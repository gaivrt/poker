#include "poker/app/session.hpp"

#include <algorithm>
#include <bit>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace poker::app {

namespace {

// Tiny JSON builder: enough for flat objects and arrays of scalars.
class Json {
public:
    Json& key(const char* k) {
        sep();
        out_ << '"' << k << "\":";
        fresh_ = true;
        return *this;
    }
    Json& str(const std::string& v) {
        sep();
        out_ << '"';
        for (char c : v) {
            if (c == '"' || c == '\\') out_ << '\\';
            out_ << c;
        }
        out_ << '"';
        return *this;
    }
    Json& num(double v) {
        sep();
        if (std::floor(v) == v && std::abs(v) < 1e15) out_ << static_cast<long long>(v);
        else out_ << v;
        return *this;
    }
    Json& boolean(bool v) {
        sep();
        out_ << (v ? "true" : "false");
        return *this;
    }
    Json& raw(const std::string& v) {
        sep();
        out_ << v;
        return *this;
    }
    Json& open(char c) {
        sep();
        out_ << c;
        fresh_ = true;
        return *this;
    }
    Json& close(char c) {
        out_ << c;
        fresh_ = false;
        return *this;
    }
    std::string done() const { return out_.str(); }

private:
    void sep() {
        if (!fresh_) out_ << ',';
        fresh_ = false;
    }
    std::ostringstream out_;
    bool fresh_ = true;
};

Json& cards(Json& j, const std::vector<Card>& cs) {
    j.open('[');
    for (Card c : cs) j.str(c.str());
    return j.close(']');
}

const char* streetName(Street s) {
    switch (s) {
        case Street::Preflop: return "preflop";
        case Street::Flop: return "flop";
        case Street::Turn: return "turn";
        case Street::River: return "river";
        case Street::Complete: return "complete";
    }
    return "?";
}

const char* actionName(ActionType a) {
    switch (a) {
        case ActionType::Fold: return "fold";
        case ActionType::Check: return "check";
        case ActionType::Call: return "call";
        case ActionType::Bet: return "bet";
        case ActionType::Raise: return "raise";
    }
    return "?";
}

TournamentConfig configFor(const std::string& format) {
    if (format == "quick") return quickFixedHandsConfig();
    if (format == "standard") return standardFixedHandsConfig();
    if (format == "classic") return classicKnockoutConfig();
    throw std::invalid_argument("unknown format: " + format);
}

}  // namespace

std::vector<Card> bestFive(const std::vector<Card>& cs) {
    const int n = static_cast<int>(cs.size());
    const HandValue target = evaluate(cs);
    for (unsigned mask = 0; mask < (1U << n); ++mask) {
        if (std::popcount(mask) != 5) continue;
        std::vector<Card> five;
        for (int i = 0; i < n; ++i)
            if (mask & (1U << i)) five.push_back(cs[static_cast<std::size_t>(i)]);
        if (evaluate(five) == target) return five;
    }
    return {};
}

std::vector<double> runoutEquity(const std::vector<std::array<Card, 2>>& hands, const std::vector<Card>& board,
                                 Rng& rng) {
    const std::size_t n = hands.size();
    std::vector<double> win(n, 0.0);
    std::array<bool, kDeckSize> used{};
    for (const auto& h : hands) used[h[0].id] = used[h[1].id] = true;
    for (Card c : board) used[c.id] = true;
    std::vector<Card> rest;
    for (int i = 0; i < kDeckSize; ++i)
        if (!used[static_cast<std::size_t>(i)]) rest.push_back(Card(static_cast<std::uint8_t>(i)));

    std::vector<Card> full(board);
    std::vector<HandValue> v(n);
    double trials = 0;
    auto score = [&]() {
        HandValue best{};
        for (std::size_t s = 0; s < n; ++s) {
            std::vector<Card> seven(full);
            seven.push_back(hands[s][0]);
            seven.push_back(hands[s][1]);
            v[s] = evaluate(seven);
            best = std::max(best, v[s]);
        }
        const auto winners = static_cast<double>(std::count(v.begin(), v.end(), best));
        for (std::size_t s = 0; s < n; ++s)
            if (v[s] == best) win[s] += 1.0 / winners;
        trials += 1;
    };

    const std::size_t missing = 5 - board.size();
    if (missing == 0) {
        score();
    } else if (missing == 1) {
        for (Card c : rest) {
            full.push_back(c);
            score();
            full.pop_back();
        }
    } else if (missing == 2) {
        for (std::size_t i = 0; i < rest.size(); ++i)
            for (std::size_t j = i + 1; j < rest.size(); ++j) {
                full.push_back(rest[i]);
                full.push_back(rest[j]);
                score();
                full.resize(board.size());
            }
    } else {
        for (int it = 0; it < 20000; ++it) {
            for (std::size_t k = 0; k < missing; ++k) {
                const std::size_t j = k + static_cast<std::size_t>(rng.below(rest.size() - k));
                std::swap(rest[k], rest[j]);
                full.push_back(rest[k]);
            }
            score();
            full.resize(board.size());
        }
    }
    for (auto& w : win) w /= trials;
    return win;
}

Session::Session(const std::string& format, int difficulty, unsigned seed)
    : rng_(std::make_unique<Xoshiro256>(seed)) {
    const TournamentConfig cfg = configFor(format);
    tournament_ = std::make_unique<Tournament>(cfg, *rng_);
    const auto diff = static_cast<ai::Difficulty>(std::clamp(difficulty, 0, 2));

    // Five of the six play styles, in random order.
    const auto& presets = ai::personalityPresets();
    std::vector<int> order(presets.size());
    for (std::size_t i = 0; i < order.size(); ++i) order[i] = static_cast<int>(i);
    for (std::size_t i = order.size() - 1; i > 0; --i) std::swap(order[i], order[static_cast<std::size_t>(rng_->below(i + 1))]);

    personality_.assign(static_cast<std::size_t>(cfg.numSeats), -1);
    bots_.resize(static_cast<std::size_t>(cfg.numSeats));
    for (int s = 1; s < cfg.numSeats; ++s) {
        const int p = order[static_cast<std::size_t>(s - 1) % order.size()];
        personality_[static_cast<std::size_t>(s)] = p;
        bots_[static_cast<std::size_t>(s)] = ai::makeBot(diff, presets[static_cast<std::size_t>(p)]);
    }
}

bool Session::handRunning() const {
    const Hand* h = tournament_->currentHand();
    return h && !h->complete();
}

int Session::toAct() const { return handRunning() ? tournament_->currentHand()->toAct() : -1; }

bool Session::isHumanTurn() const { return toAct() == kHuman; }

void Session::startHand() {
    if (finished() || handRunning()) return;
    Hand& h = tournament_->startHand();
    handSettled_ = false;
    finalsSent_ = false;
    converted_ = 0;
    board_.clear();
    revealed_.clear();
    isRevealed_.assign(static_cast<std::size_t>(h.numSeats()), false);
    revealed_.resize(static_cast<std::size_t>(h.numSeats()));

    const BlindLevel& lv = tournament_->level();
    Json j;
    j.open('{').key("t").str("handStart").key("hand").num(tournament_->handsPlayed() + 1);
    j.key("maxHands").num(tournament_->config().maxHands).key("level").num(tournament_->levelIndex() + 1);
    j.key("handsPerLevel").num(tournament_->config().handsPerLevel);
    j.key("sb").num(static_cast<double>(lv.smallBlind)).key("bb").num(static_cast<double>(lv.bigBlind));
    j.key("ante").num(static_cast<double>(lv.ante)).key("button").num(h.button());
    j.key("stacks").open('[');
    for (int s = 0; s < h.numSeats(); ++s) j.num(static_cast<double>(h.config().stacks[static_cast<std::size_t>(s)]));
    j.close(']').close('}');
    pending_.push_back(j.done());
    collect();
}

bool Session::stepBot() {
    if (!handRunning()) return false;
    Hand& h = *tournament_->currentHand();
    const int s = h.toAct();
    if (s == kHuman) return false;
    const Action a = bots_[static_cast<std::size_t>(s)]->decide(h.view(s), *rng_);
    if (!h.act(a)) {
        // A bot should never pick an illegal move; fall back to the safest legal one.
        const LegalActions la = h.legal();
        h.act(la.canCheck ? Action::check() : Action::fold());
    }
    collect();
    return true;
}

bool Session::humanAct(const std::string& type, double to) {
    if (!isHumanTurn()) return false;
    Hand& h = *tournament_->currentHand();
    Action a;
    const auto amount = static_cast<Chips>(std::llround(to));
    if (type == "fold") a = Action::fold();
    else if (type == "check") a = Action::check();
    else if (type == "call") a = Action::call();
    else if (type == "bet") a = Action::bet(amount);
    else if (type == "raise") a = Action::raise(amount);
    else return false;
    if (!h.act(a)) return false;
    collect();
    return true;
}

void Session::finishHand() {
    Hand* h = tournament_->currentHand();
    if (!h || !h->complete() || handSettled_) return;
    const std::vector<Chips> before = tournament_->stacks();
    tournament_->finishHand();
    handSettled_ = true;

    const auto st = tournament_->standings();
    for (int s = 0; s < h->numSeats(); ++s) {
        if (before[static_cast<std::size_t>(s)] > 0 && tournament_->stacks()[static_cast<std::size_t>(s)] == 0) {
            for (const auto& row : st)
                if (row.seat == s) {
                    Json j;
                    j.open('{').key("t").str("eliminated").key("seat").num(s).key("place").num(row.place);
                    j.key("placeTo").num(row.placeTo).close('}');
                    pending_.push_back(j.done());
                }
        }
    }
    if (finished()) {
        Json j;
        j.open('{').key("t").str("tournamentEnd").key("standings").raw(standings()).close('}');
        pending_.push_back(j.done());
    }
}

void Session::collect() {
    Hand* h = tournament_->currentHand();
    if (!h) return;
    const auto& ev = h->events();
    for (; converted_ < ev.size(); ++converted_) {
        const Event& e = ev[converted_];
        if (e.visibleTo >= 0 && e.visibleTo != kHuman) continue;
        const std::string j = eventJson(e);
        if (!j.empty()) pending_.push_back(j);
    }
}

std::string Session::eventJson(const Event& e) {
    Json j;
    j.open('{');
    auto equityField = [&]() {
        std::vector<std::array<Card, 2>> hands;
        std::vector<int> seats;
        for (std::size_t s = 0; s < isRevealed_.size(); ++s)
            if (isRevealed_[s]) {
                hands.push_back(revealed_[s]);
                seats.push_back(static_cast<int>(s));
            }
        if (hands.size() < 2) return;
        Xoshiro256 local(0xE0E0 + board_.size());
        const auto eq = runoutEquity(hands, board_, local);
        j.key("equity").open('[');
        for (std::size_t i = 0; i < seats.size(); ++i)
            j.open('{').key("seat").num(seats[i]).key("pct").num(std::round(eq[i] * 1000) / 10).close('}');
        j.close(']');
    };

    switch (e.type) {
        case EventType::HandStarted:
        case EventType::HandEnded:
            if (e.type == EventType::HandStarted) return {};
            j.key("t").str("handEnd");
            break;
        case EventType::PostSmallBlind:
        case EventType::PostBigBlind:
        case EventType::PostAnte:
            j.key("t").str(e.type == EventType::PostSmallBlind ? "postSB"
                           : e.type == EventType::PostBigBlind ? "postBB"
                                                               : "postAnte");
            j.key("seat").num(e.seat).key("amount").num(static_cast<double>(e.amount)).key("allIn").boolean(e.allIn);
            break;
        case EventType::DealHole:
            j.key("t").str("hole").key("seat").num(e.seat).key("cards");
            cards(j, e.cards);
            break;
        case EventType::Act:
            j.key("t").str("act").key("seat").num(e.seat).key("action").str(actionName(e.action));
            j.key("amount").num(static_cast<double>(e.amount)).key("total").num(static_cast<double>(e.total));
            j.key("allIn").boolean(e.allIn).key("street").str(streetName(e.street));
            break;
        case EventType::BoardDealt: {
            board_.insert(board_.end(), e.cards.begin(), e.cards.end());
            j.key("t").str("board").key("street").str(streetName(e.street)).key("cards");
            cards(j, e.cards);
            equityField();
            break;
        }
        case EventType::UncalledReturn:
            j.key("t").str("uncalled").key("seat").num(e.seat).key("amount").num(static_cast<double>(e.amount));
            break;
        case EventType::AllInRunout:
            j.key("t").str("runout");
            break;
        case EventType::ShowCards: {
            const auto s = static_cast<std::size_t>(e.seat);
            isRevealed_[s] = true;
            revealed_[s] = {e.cards[0], e.cards[1]};
            j.key("t").str("show").key("seat").num(e.seat).key("cards");
            cards(j, e.cards);
            if (e.value.raw) {
                std::vector<Card> all(board_);
                all.push_back(e.cards[0]);
                all.push_back(e.cards[1]);
                j.key("hand").str(describeZh(e.value)).key("category").num(static_cast<int>(e.value.category()));
                j.key("best");
                cards(j, bestFive(all));
            }
            // During an all-in runout, the reveal happens before the board is complete:
            // report equity once the last hand is face up.
            bool last = true;
            const auto& ev = tournament_->currentHand()->events();
            if (converted_ + 1 < ev.size() && ev[converted_ + 1].type == EventType::ShowCards) last = false;
            if (last && board_.size() < 5) equityField();
            break;
        }
        case EventType::WinPot:
            // Before the first award of a showdown, restate every revealed hand on the
            // final board: in an all-in runout the hands were shown before the river.
            if (e.value.raw && !finalsSent_ && board_.size() == 5) {
                finalsSent_ = true;
                Json f;
                f.open('{').key("t").str("finalHands").key("hands").open('[');
                for (std::size_t s = 0; s < isRevealed_.size(); ++s) {
                    if (!isRevealed_[s]) continue;
                    std::vector<Card> all(board_);
                    all.push_back(revealed_[s][0]);
                    all.push_back(revealed_[s][1]);
                    const HandValue v = evaluate(all);
                    f.open('{').key("seat").num(static_cast<double>(s)).key("hand").str(describeZh(v));
                    f.key("category").num(static_cast<int>(v.category())).key("best");
                    cards(f, bestFive(all));
                    f.close('}');
                }
                f.close(']').close('}');
                pending_.push_back(f.done());
            }
            j.key("t").str("win").key("seat").num(e.seat).key("amount").num(static_cast<double>(e.amount));
            j.key("pot").num(e.potIndex);
            if (e.value.raw) {
                j.key("hand").str(describeZh(e.value)).key("category").num(static_cast<int>(e.value.category()));
                j.key("royal").boolean(e.value.isRoyalFlush());
            }
            break;
    }
    j.close('}');
    return j.done();
}

std::string Session::drainEvents() {
    std::string out = "[";
    for (std::size_t i = 0; i < pending_.size(); ++i) {
        if (i) out += ',';
        out += pending_[i];
    }
    out += ']';
    pending_.clear();
    return out;
}

std::string Session::state() const {
    const Tournament& t = *tournament_;
    const Hand* h = t.currentHand();
    Json j;
    j.open('{').key("finished").boolean(finished()).key("handsPlayed").num(t.handsPlayed());
    j.key("maxHands").num(t.config().maxHands).key("toAct").num(toAct());
    j.key("seats").open('[');
    // Until finishHand() runs, the table still shows the hand that was just played.
    const bool showHand = h && !handSettled_;
    const std::vector<Chips> finals = showHand && h->complete() ? h->finalStacks() : std::vector<Chips>{};
    for (int s = 0; s < t.config().numSeats; ++s) {
        j.open('{');
        if (showHand) {
            const SeatState& st = h->seat(s);
            const Chips stack = h->complete() ? finals[static_cast<std::size_t>(s)] : st.stack;
            j.key("stack").num(static_cast<double>(stack)).key("bet").num(static_cast<double>(h->complete() ? 0 : st.street));
            j.key("inHand").boolean(st.inHand).key("folded").boolean(st.folded).key("allIn").boolean(st.allIn);
        } else {
            j.key("stack").num(static_cast<double>(t.stacks()[static_cast<std::size_t>(s)])).key("bet").num(0);
            j.key("inHand").boolean(false).key("folded").boolean(false).key("allIn").boolean(false);
        }
        j.close('}');
    }
    j.close(']');
    if (h) {
        j.key("pot").num(static_cast<double>(handRunning() ? h->pot() : 0)).key("button").num(h->button());
        j.key("board");
        cards(j, h->board());
        j.key("hole");
        cards(j, {h->seat(kHuman).hole[0], h->seat(kHuman).hole[1]});
        j.key("currentBet").num(static_cast<double>(h->currentBet()));
        j.key("bb").num(static_cast<double>(h->config().bigBlind)).key("sb").num(static_cast<double>(h->config().smallBlind));
    }
    j.close('}');
    return j.done();
}

std::string Session::legal() const {
    Json j;
    j.open('{');
    if (isHumanTurn()) {
        const LegalActions la = tournament_->currentHand()->legal();
        j.key("canFold").boolean(la.canFold).key("canCheck").boolean(la.canCheck).key("canCall").boolean(la.canCall);
        j.key("canBet").boolean(la.canBet).key("canRaise").boolean(la.canRaise);
        j.key("toCall").num(static_cast<double>(la.toCall)).key("minTo").num(static_cast<double>(la.minTo));
        j.key("maxTo").num(static_cast<double>(la.maxTo));
    } else {
        j.key("canFold").boolean(false).key("canCheck").boolean(false).key("canCall").boolean(false);
        j.key("canBet").boolean(false).key("canRaise").boolean(false);
    }
    j.close('}');
    return j.done();
}

std::string Session::roster() const {
    Json j;
    j.open('[');
    for (int p : personality_) j.num(p);
    j.close(']');
    return j.done();
}

std::string Session::standings() const {
    Json j;
    j.open('[');
    for (const auto& st : tournament_->standings()) {
        j.open('{').key("seat").num(st.seat).key("place").num(st.place).key("placeTo").num(st.placeTo);
        j.key("chips").num(static_cast<double>(st.chips)).close('}');
    }
    j.close(']');
    return j.done();
}

}  // namespace poker::app
