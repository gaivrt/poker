#include "poker/hand.hpp"

#include <algorithm>
#include <stdexcept>

namespace poker {

Hand::Hand(HandConfig config, Deck deck) : config_(std::move(config)), deck_(deck) {
    const int n = static_cast<int>(config_.stacks.size());
    if (n < 2) throw std::invalid_argument("Hand: need at least 2 seats");
    if (config_.bigBlind <= 0 || config_.smallBlind < 0 || config_.ante < 0)
        throw std::invalid_argument("Hand: bad blinds");

    seats_.resize(static_cast<std::size_t>(n));
    int dealt = 0;
    for (int s = 0; s < n; ++s) {
        auto& st = seats_[static_cast<std::size_t>(s)];
        st.stack = config_.stacks[static_cast<std::size_t>(s)];
        if (st.stack < 0) throw std::invalid_argument("Hand: negative stack");
        st.inHand = st.stack > 0;
        st.folded = !st.inHand;
        dealt += st.inHand ? 1 : 0;
    }
    if (dealt < 2) throw std::invalid_argument("Hand: need at least 2 players with chips");
    if (config_.button < 0 || config_.button >= n || !seat(config_.button).inHand)
        throw std::invalid_argument("Hand: button must be a seat with chips");
    winnings_.assign(static_cast<std::size_t>(n), 0);

    {
        Event e;
        e.type = EventType::HandStarted;
        e.seat = config_.button;
        e.amount = config_.bigBlind;
        push(e);
    }

    // Heads-up: the button posts the small blind and acts first preflop.
    if (dealt == 2) {
        sbSeat_ = config_.button;
        bbSeat_ = nextSeat(sbSeat_);
    } else {
        sbSeat_ = nextSeat(config_.button);
        bbSeat_ = nextSeat(sbSeat_);
    }

    auto post = [&](int s, Chips amount, EventType type) {
        const Chips paid = std::min(amount, seat(s).stack);
        commit(s, paid);
        Event e;
        e.type = type;
        e.seat = s;
        e.amount = paid;
        e.total = seat(s).street;
        e.allIn = seat(s).allIn;
        push(e);
    };
    post(sbSeat_, config_.smallBlind, EventType::PostSmallBlind);
    post(bbSeat_, config_.bigBlind, EventType::PostBigBlind);

    // Big-blind ante: blind first, then the ante from whatever is left. It is dead
    // money, so it does not count toward the big blind's stake in side pots.
    if (config_.ante > 0 && seat(bbSeat_).stack > 0) {
        auto& bb = seats_[static_cast<std::size_t>(bbSeat_)];
        const Chips paid = std::min(config_.ante, bb.stack);
        bb.stack -= paid;
        bb.allIn = bb.stack == 0;
        deadMoney_ += paid;
        Event e;
        e.type = EventType::PostAnte;
        e.seat = bbSeat_;
        e.amount = paid;
        e.allIn = bb.allIn;
        push(e);
    }

    // Everyone must at least match the full big blind, even if the big blind is short.
    currentBet_ = config_.bigBlind;
    lastRaiseSize_ = config_.bigBlind;

    // Deal two rounds, one card at a time, starting left of the button.
    for (int round = 0; round < 2; ++round) {
        int s = config_.button;
        for (int k = 0; k < dealt; ++k) {
            s = nextSeat(s);
            seats_[static_cast<std::size_t>(s)].hole[static_cast<std::size_t>(round)] = deck_.draw();
        }
    }
    {
        int s = config_.button;
        for (int k = 0; k < dealt; ++k) {
            s = nextSeat(s);
            Event e;
            e.type = EventType::DealHole;
            e.seat = s;
            e.visibleTo = s;
            e.cards = {seat(s).hole[0], seat(s).hole[1]};
            push(e);
        }
    }

    progress(bbSeat_);
}

int Hand::nextSeat(int from) const {
    const int n = numSeats();
    for (int k = 1; k <= n; ++k) {
        const int s = (from + k) % n;
        if (seat(s).inHand) return s;
    }
    return -1;
}

int Hand::liveCount() const {
    int c = 0;
    for (const auto& s : seats_) c += (s.inHand && !s.folded) ? 1 : 0;
    return c;
}

int Hand::canActCount() const {
    int c = 0;
    for (const auto& s : seats_) c += (s.inHand && !s.folded && !s.allIn) ? 1 : 0;
    return c;
}

bool Hand::needsAction(int s) const {
    const SeatState& st = seat(s);
    if (!st.inHand || st.folded || st.allIn) return false;
    // Last one able to act and nothing to call: nobody is left to bet against.
    if (canActCount() == 1 && st.street >= currentBet_) return false;
    return !st.acted || st.street < currentBet_;
}

int Hand::findNextToAct(int after) const {
    const int n = numSeats();
    for (int k = 1; k <= n; ++k) {
        const int s = (after + k) % n;
        if (needsAction(s)) return s;
    }
    return -1;
}

void Hand::commit(int s, Chips amount) {
    auto& st = seats_[static_cast<std::size_t>(s)];
    st.stack -= amount;
    st.street += amount;
    st.total += amount;
    st.allIn = st.stack == 0;
}

Chips Hand::pot() const {
    Chips p = deadMoney_;
    for (const auto& s : seats_) p += s.total;
    return p;
}

LegalActions Hand::legal() const {
    LegalActions la;
    if (complete() || toAct_ < 0) return la;
    const SeatState& st = seat(toAct_);
    la.seat = toAct_;
    const Chips owed = currentBet_ - st.street;
    la.canCheck = owed <= 0;
    la.canCall = owed > 0;
    la.canFold = owed > 0;
    la.toCall = std::clamp<Chips>(owed, 0, st.stack);

    const Chips maxTo = st.street + st.stack;
    // A short all-in (less than a full raise) does not reopen betting for seats that
    // already acted, unless the raises they now face add up to a full raise.
    const bool reopened = !st.acted || currentBet_ - st.levelAfterAction >= lastRaiseSize_;
    bool someoneCanRespond = false;
    for (int s = 0; s < numSeats(); ++s)
        if (s != toAct_ && seat(s).inHand && !seat(s).folded && !seat(s).allIn) someoneCanRespond = true;

    if (maxTo > currentBet_ && reopened && someoneCanRespond) {
        if (currentBet_ == 0) {
            la.canBet = true;
            la.minTo = std::min(config_.bigBlind, maxTo);
        } else {
            la.canRaise = true;
            la.minTo = std::min(currentBet_ + lastRaiseSize_, maxTo);
        }
        la.maxTo = maxTo;
    }
    return la;
}

bool Hand::act(const Action& action, std::string* error) {
    auto fail = [&](const char* why) {
        if (error) *error = why;
        return false;
    };
    if (complete()) return fail("hand is complete");
    const LegalActions la = legal();
    const int s = toAct_;
    auto& st = seats_[static_cast<std::size_t>(s)];

    Event e;
    e.type = EventType::Act;
    e.seat = s;
    e.street = street_;
    e.action = action.type;

    switch (action.type) {
        case ActionType::Fold:
            if (!la.canFold) return fail("cannot fold when checking is free");
            st.folded = true;
            break;
        case ActionType::Check:
            if (!la.canCheck) return fail("cannot check facing a bet");
            break;
        case ActionType::Call:
            if (!la.canCall) return fail("nothing to call");
            e.amount = la.toCall;
            commit(s, la.toCall);
            break;
        case ActionType::Bet:
        case ActionType::Raise: {
            const bool isBet = action.type == ActionType::Bet;
            if (isBet ? !la.canBet : !la.canRaise) return fail(isBet ? "cannot bet" : "cannot raise");
            if (action.to < la.minTo || action.to > la.maxTo) return fail("bet size out of range");
            const Chips raiseSize = action.to - currentBet_;
            // Only a full bet/raise sets the next min-raise step; a short all-in does not.
            if (raiseSize >= lastRaiseSize_) lastRaiseSize_ = raiseSize;
            e.amount = action.to - st.street;
            commit(s, e.amount);
            currentBet_ = action.to;
            lastAggressor_ = s;
            break;
        }
    }
    st.acted = true;
    st.levelAfterAction = currentBet_;
    e.total = st.street;
    e.allIn = st.allIn;
    push(e);

    progress(s);
    return true;
}

void Hand::progress(int lastActor) {
    if (liveCount() == 1) {
        finishUncontested();
        return;
    }
    if (const int next = findNextToAct(lastActor); next >= 0) {
        toAct_ = next;
        return;
    }
    // Betting round over. Deal on until someone has to act or the hand is decided.
    for (;;) {
        returnUncalled();
        if (street_ == Street::River) {
            showdown();
            return;
        }
        if (canActCount() < 2 && !revealed_) revealAll(EventType::AllInRunout);
        dealStreet();
        if (canActCount() >= 2) {
            toAct_ = findNextToAct(config_.button);
            if (toAct_ >= 0) return;
        }
    }
}

void Hand::returnUncalled() {
    // The biggest stake is only "called" up to the second biggest; the rest goes back.
    int top = -1;
    Chips first = 0, second = 0;
    for (int s = 0; s < numSeats(); ++s) {
        const Chips t = seat(s).total;
        if (t > first) {
            second = first;
            first = t;
            top = s;
        } else if (t > second) {
            second = t;
        }
    }
    if (top < 0 || first == second) return;
    const Chips excess = first - second;
    auto& st = seats_[static_cast<std::size_t>(top)];
    st.stack += excess;
    st.total -= excess;
    st.street = std::max<Chips>(0, st.street - excess);
    st.allIn = st.stack == 0;
    Event e;
    e.type = EventType::UncalledReturn;
    e.seat = top;
    e.street = street_;
    e.amount = excess;
    push(e);
}

void Hand::dealStreet() {
    for (auto& s : seats_) {
        s.street = 0;
        s.acted = false;
        s.levelAfterAction = 0;
    }
    currentBet_ = 0;
    lastRaiseSize_ = config_.bigBlind;
    lastAggressor_ = -1;

    deck_.draw();  // burn
    Event e;
    e.type = EventType::BoardDealt;
    if (street_ == Street::Preflop) {
        street_ = Street::Flop;
        for (int i = 0; i < 3; ++i) e.cards.push_back(deck_.draw());
    } else if (street_ == Street::Flop) {
        street_ = Street::Turn;
        e.cards.push_back(deck_.draw());
    } else {
        street_ = Street::River;
        e.cards.push_back(deck_.draw());
    }
    board_.insert(board_.end(), e.cards.begin(), e.cards.end());
    e.street = street_;
    push(e);
}

void Hand::revealAll(EventType why) {
    if (why == EventType::AllInRunout) {
        Event e;
        e.type = EventType::AllInRunout;
        e.street = street_;
        push(e);
    }
    revealed_ = true;
    // Showdown order: the last aggressor of the final street first, otherwise the
    // first live seat left of the button; then clockwise. (All-in runouts: same order.)
    const int n = numSeats();
    const int start = lastAggressor_ >= 0 && !seat(lastAggressor_).folded ? lastAggressor_ : nextSeat(config_.button);
    for (int k = 0; k < n; ++k) {
        const int s = (start + k) % n;
        if (!seat(s).inHand || seat(s).folded) continue;
        Event e;
        e.type = EventType::ShowCards;
        e.seat = s;
        e.street = street_;
        e.cards = {seat(s).hole[0], seat(s).hole[1]};
        if (board_.size() >= 3) {
            std::vector<Card> all(board_);
            all.push_back(seat(s).hole[0]);
            all.push_back(seat(s).hole[1]);
            e.value = evaluate(all);
        }
        push(e);
    }
}

void Hand::endEvent() {
    Event e;
    e.type = EventType::HandEnded;
    e.street = street_;
    push(e);
}

void Hand::finishUncontested() {
    returnUncalled();
    int winner = -1;
    for (int s = 0; s < numSeats(); ++s)
        if (seat(s).inHand && !seat(s).folded) winner = s;
    const Chips amount = pot();
    winnings_[static_cast<std::size_t>(winner)] = amount;
    Event e;
    e.type = EventType::WinPot;
    e.seat = winner;
    e.street = street_;
    e.amount = amount;
    e.potIndex = 0;
    push(e);
    street_ = Street::Complete;
    toAct_ = -1;
    endEvent();
}

void Hand::showdown() {
    showdown_ = true;
    if (!revealed_) revealAll(EventType::ShowCards);

    const int n = numSeats();
    std::vector<Chips> contributed(static_cast<std::size_t>(n));
    std::vector<bool> folded(static_cast<std::size_t>(n));
    std::vector<HandValue> values(static_cast<std::size_t>(n));
    for (int s = 0; s < n; ++s) {
        const SeatState& st = seat(s);
        contributed[static_cast<std::size_t>(s)] = st.total;
        folded[static_cast<std::size_t>(s)] = !st.inHand || st.folded;
        if (st.inHand && !st.folded) {
            std::vector<Card> all(board_);
            all.push_back(st.hole[0]);
            all.push_back(st.hole[1]);
            values[static_cast<std::size_t>(s)] = evaluate(all);
        }
    }
    const auto pots = buildPots(contributed, folded, deadMoney_);
    std::vector<PotResult> results;
    winnings_ = awardPots(pots, values, config_.button, &results);

    for (std::size_t p = 0; p < results.size(); ++p) {
        const auto& r = results[p];
        const auto count = static_cast<Chips>(r.winners.size());
        Chips odd = r.amount % count;
        for (int w : r.winners) {
            Event e;
            e.type = EventType::WinPot;
            e.seat = w;
            e.street = Street::River;
            e.amount = r.amount / count + (odd > 0 ? 1 : 0);
            if (odd > 0) --odd;
            e.potIndex = static_cast<int>(p);
            e.value = r.best;
            push(e);
        }
    }
    street_ = Street::Complete;
    toAct_ = -1;
    endEvent();
}

std::vector<Chips> Hand::finalStacks() const {
    std::vector<Chips> out(static_cast<std::size_t>(numSeats()));
    for (int s = 0; s < numSeats(); ++s)
        out[static_cast<std::size_t>(s)] = seat(s).stack + winnings_[static_cast<std::size_t>(s)];
    return out;
}

PlayerView Hand::view(int s) const {
    PlayerView v;
    v.seat = s;
    if (s >= 0 && s < numSeats()) v.hole = seat(s).hole;
    v.board = board_;
    v.street = street_;
    v.button = config_.button;
    v.smallBlind = config_.smallBlind;
    v.bigBlind = config_.bigBlind;
    v.pot = pot();
    v.currentBet = currentBet_;
    for (const auto& st : seats_)
        v.seats.push_back(SeatPublic{st.inHand, st.folded, st.allIn, st.stack, st.street, st.total});
    if (toAct_ == s) v.legal = legal();
    for (const auto& e : events_)
        if (e.visibleTo < 0 || e.visibleTo == s) v.history.push_back(e);
    return v;
}

const char* streetNameZh(Street s) {
    switch (s) {
        case Street::Preflop: return "翻牌前";
        case Street::Flop: return "翻牌";
        case Street::Turn: return "转牌";
        case Street::River: return "河牌";
        case Street::Complete: return "结束";
    }
    return "?";
}

const char* actionNameZh(ActionType a) {
    switch (a) {
        case ActionType::Fold: return "弃牌";
        case ActionType::Check: return "过牌";
        case ActionType::Call: return "跟注";
        case ActionType::Bet: return "下注";
        case ActionType::Raise: return "加注";
    }
    return "?";
}

}  // namespace poker
