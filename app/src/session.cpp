#include "poker/app/session.hpp"

#include "poker/ai/mind.hpp"

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

const char* kindName(SignalKind k) {
    switch (k) {
        case SignalKind::Line: return "line";
        case SignalKind::Expression: return "expression";
        case SignalKind::Gesture: return "gesture";
        case SignalKind::Sticker: return "sticker";
    }
    return "?";
}

const char* strengthName(Strength s) {
    switch (s) {
        case Strength::Weak: return "weak";
        case Strength::Medium: return "medium";
        case Strength::Strong: return "strong";
    }
    return "?";
}

bool aggressive(const Action& a) { return a.type == ActionType::Bet || a.type == ActionType::Raise; }

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

Session::Session(const std::string& format, int difficulty, unsigned seed, int humanMask)
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
    human_.assign(static_cast<std::size_t>(cfg.numSeats), false);
    for (int s = 0; s < cfg.numSeats; ++s) human_[static_cast<std::size_t>(s)] = (humanMask >> s) & 1;
    bots_.resize(static_cast<std::size_t>(cfg.numSeats));
    std::size_t next = 0;
    for (int s = 0; s < cfg.numSeats; ++s) {
        if (human_[static_cast<std::size_t>(s)]) continue;
        const int p = order[next++ % order.size()];
        personality_[static_cast<std::size_t>(s)] = p;
        bots_[static_cast<std::size_t>(s)] = ai::makeBot(diff, presets[static_cast<std::size_t>(p)]);
    }
}

bool Session::handRunning() const {
    const Hand* h = tournament_->currentHand();
    return h && !h->complete();
}

int Session::toAct() const { return handRunning() ? tournament_->currentHand()->toAct() : -1; }

bool Session::isHuman(int seat) const {
    return seat >= 0 && static_cast<std::size_t>(seat) < human_.size() && human_[static_cast<std::size_t>(seat)];
}

bool Session::isHumanTurn() const { return isHuman(toAct()); }

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
    const auto n = static_cast<std::size_t>(h.numSeats());
    features_.assign(n, {});
    if (thinkHistory_.size() != n) thinkHistory_.assign(n, {});
    talkCount_.assign(n, {0, 0, 0, 0});
    talkStreet_ = Street::Preflop;
    tellUses_.clear();
    actThink_.clear();
    actSize_.clear();
    actConverted_ = 0;
    plan_.reset();
    fullyShown_.assign(n, false);
    showed_.assign(n, false);
    provoked_.assign(n, false);

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
    push(j.done());
    collect();
}

std::string Session::prepareBot() {
    if (!handRunning()) return "{}";
    Hand& h = *tournament_->currentHand();
    const int s = h.toAct();
    if (isHuman(s)) return "{}";
    if (!plan_ || planKey_ != h.events().size()) {
        plan_ = bots_[static_cast<std::size_t>(s)]->plan(h.view(s), *rng_);
        planKey_ = h.events().size();
        emitTalk(s, plan_->talk);
    }
    Json j;
    j.open('{').key("seat").num(s).key("thinkMs").num(plan_->thinkMs).close('}');
    return j.done();
}

bool Session::stepBot() {
    if (!handRunning()) return false;
    Hand& h = *tournament_->currentHand();
    const int s = h.toAct();
    if (isHuman(s)) return false;
    if (!plan_ || planKey_ != h.events().size()) prepareBot();
    const ai::Plan plan = *plan_;
    plan_.reset();
    auto& bot = *bots_[static_cast<std::size_t>(s)];
    const PlayerView before = h.view(s);
    Action a = bot.decideTalk(before, ai::TalkView{features_}, *rng_);
    if (!h.legal().canFold && a.type == ActionType::Fold) a = Action::check();
    const Sizing size = sizingOf(h, a);
    const std::size_t actEvent = h.events().size();  // index the act event will get
    if (!h.act(a)) {
        // A bot should never pick an illegal move; fall back to the safest legal one.
        const LegalActions la = h.legal();
        a = la.canCheck ? Action::check() : Action::fold();
        h.act(a);
    }
    recordAction(s, plan.thinkMs, a, size);
    // Its timing or sizing matched one of its tells: the player may catch it at showdown.
    const ai::MindProfile& mind = ai::mindProfile(personality_[static_cast<std::size_t>(s)]);
    if (plan.timingTell >= 0) {
        const ai::Tell* t = ai::findTell(plan.timingTell);
        const bool forBets = t && (t->feature == kFeatureFastBet || t->feature == kFeatureSlowBet);
        if (t && (forBets ? aggressive(a) : a.type == ActionType::Call)) tellUses_.push_back({s, plan.timingTell});
    }
    for (const ai::Tell& t : mind.tells)
        if (size.feature >= 0 && t.feature == size.feature) tellUses_.push_back({s, t.id});
    // What it says after acting belongs right after the action, before any board
    // cards or showdown the action may have triggered.
    collect(actEvent + 1);
    emitTalk(s, bot.afterAction(before, a, *rng_));
    collect();
    return true;
}

bool Session::humanAct(const std::string& type, double to, int thinkMs) {
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
    const int seat = h.toAct();
    const Sizing size = sizingOf(h, a);
    if (!h.act(a)) return false;
    recordAction(seat, std::max(0, thinkMs), a, size);  // before collect(): the act event carries it
    collect();
    return true;
}

Session::Sizing Session::sizingOf(const Hand& h, const Action& a) const {
    Sizing out;
    if (!aggressive(a) || h.street() == Street::Preflop) return out;  // preflop sizes are conventions
    const SeatState& st = h.seat(h.toAct());
    const Chips toCall = std::max<Chips>(0, h.currentBet() - st.street);
    const Chips raiseBy = a.to - h.currentBet();
    const double frac = static_cast<double>(raiseBy) / static_cast<double>(std::max<Chips>(1, h.pot() + toCall));
    out.pct = static_cast<int>(std::lround(frac * 100));
    out.feature = sizingFeature(frac, a.to >= st.street + st.stack);
    return out;
}

void Session::recordAction(int seat, int thinkMs, const Action& a, const Sizing& size) {
    auto& hist = thinkHistory_[static_cast<std::size_t>(seat)];
    auto& feats = features_[static_cast<std::size_t>(seat)];
    // Acting much faster or slower than this player's usual pace is a timing tell.
    const bool isCall = a.type == ActionType::Call;
    if ((aggressive(a) || isCall) && hist.size() >= 4) {
        std::vector<int> sorted(hist.end() - static_cast<std::ptrdiff_t>(std::min<std::size_t>(hist.size(), 20)), hist.end());
        std::sort(sorted.begin(), sorted.end());
        const double median = sorted[sorted.size() / 2];
        if (thinkMs < 0.55 * median) feats.push_back(isCall ? kFeatureFastCall : kFeatureFastBet);
        else if (thinkMs > 1.8 * median) feats.push_back(isCall ? kFeatureSlowCall : kFeatureSlowBet);
    }
    // And how big the bet was compared to the pot.
    if (size.feature >= 0) feats.push_back(size.feature);
    hist.push_back(thinkMs);
    actThink_.push_back(thinkMs);
    actSize_.push_back(size.pct);
}

bool Session::inPlay(int seat) const {
    const Hand* h = tournament_->currentHand();
    return h && !h->complete() && h->seat(seat).inHand && !h->seat(seat).folded;
}

void Session::emitSignal(const Signal& sig) {
    Json j;
    j.open('{').key("t").str("signal").key("seat").num(sig.seat).key("kind").str(kindName(sig.kind));
    j.key("code").num(sig.code).key("target").num(sig.target).close('}');
    push(j.done());
    if (inPlay(sig.seat)) features_[static_cast<std::size_t>(sig.seat)].push_back(featureOf(sig.kind, sig.code));
}

void Session::emitTalk(int seat, const ai::Talk& talk) {
    for (Signal sig : talk.signals) {
        sig.seat = seat;
        emitSignal(sig);
    }
    for (int t : talk.tells) tellUses_.push_back({seat, t});
}

bool Session::humanSignal(int kind, int code, int target) { return signalFrom(kHuman, kind, code, target); }

bool Session::signalFrom(int seat, int kind, int code, int target) {
    const Hand* h = tournament_->currentHand();
    if (!h || handSettled_ || kind < 0 || kind > 3 || !isHuman(seat)) return false;
    const auto k = static_cast<SignalKind>(kind);
    if (code < 0 || code >= codeCount(k)) return false;
    if (target < -1 || target >= h->numSeats() || target == seat) return false;
    if (tournament_->stacks()[static_cast<std::size_t>(seat)] == 0 && !h->seat(seat).inHand) return false;  // out of the game

    // Rate limit per street: 3 lines, 4 expressions, 3 gestures.
    if (h->street() != talkStreet_) {
        talkStreet_ = h->street();
        for (auto& c : talkCount_) c = {0, 0, 0, 0};
    }
    static constexpr int kLimit[4] = {3, 4, 3, 3};
    auto& count = talkCount_[static_cast<std::size_t>(seat)][static_cast<std::size_t>(kind)];
    if (count >= kLimit[kind]) return false;
    ++count;

    const Signal sig{seat, target, k, static_cast<std::uint8_t>(code)};
    emitSignal(sig);

    // Someone answers a line or a sticker: the one it was aimed at, else a bot still in the hand.
    if (k == SignalKind::Line || k == SignalKind::Sticker) {
        int responder = target;
        if (responder < 0) {
            std::vector<int> candidates;
            for (int s = 0; s < h->numSeats(); ++s)
                if (inPlay(s) && !isHuman(s)) candidates.push_back(s);
            if (!candidates.empty()) responder = candidates[static_cast<std::size_t>(rng_->below(candidates.size()))];
        }
        if (responder >= 0 && !isHuman(responder) && h->seat(responder).inHand)
            emitTalk(responder, bots_[static_cast<std::size_t>(responder)]->respond(sig, h->view(responder), *rng_));
    }
    return true;
}

bool Session::canHumanShow() const { return canShow(kHuman); }

bool Session::canShow(int seat) const {
    const Hand* h = tournament_->currentHand();
    if (!isHuman(seat) || !h || !h->complete() || handSettled_ || h->wentToShowdown()) return false;
    if (showed_[static_cast<std::size_t>(seat)]) return false;
    return h->winnings()[static_cast<std::size_t>(seat)] > 0;
}

std::string Session::handInfo(int seat, const std::vector<Card>& shown, Strength st) const {
    const Hand& h = *tournament_->currentHand();
    Json j;
    j.open('{').key("t").str("voluntaryShow").key("seat").num(seat).key("cards");
    cards(j, shown);
    if (shown.size() == 2) {
        j.key("strength").str(strengthName(st));
        if (h.board().size() >= 3) {
            std::vector<Card> all(h.board());
            all.insert(all.end(), shown.begin(), shown.end());
            j.key("hand").str(describeZh(evaluate(all)));
        }
    }
    j.close('}');
    return j.done();
}

void Session::revealVoluntary(int seat, int mask) {
    const Hand& h = *tournament_->currentHand();
    const auto& hole = h.seat(seat).hole;
    std::vector<Card> shown;
    if (mask & 1) shown.push_back(hole[0]);
    if (mask & 2) shown.push_back(hole[1]);
    const Strength st = ai::classifyHand(hole, h.board());
    push(handInfo(seat, shown, st));
    if (mask == 3) {
        fullyShown_[static_cast<std::size_t>(seat)] = true;
        // Showing a bluff to the players who folded to it can put them on tilt.
        if (st == Strength::Weak)
            for (int s = 0; s < h.numSeats(); ++s)
                if (s != seat && h.seat(s).inHand && h.seat(s).folded) provoked_[static_cast<std::size_t>(s)] = true;
    }
}

bool Session::humanShow(int mask) { return show(kHuman, mask); }

bool Session::show(int seat, int mask) {
    if (!canShow(seat) || mask < 1 || mask > 3) return false;
    showed_[static_cast<std::size_t>(seat)] = true;
    revealVoluntary(seat, mask);
    return true;
}

void Session::finishHand() {
    Hand* h = tournament_->currentHand();
    if (!h || !h->complete() || handSettled_) return;
    const int n = h->numSeats();

    // A bot that won without a showdown may show its bluff.
    if (!h->wentToShowdown())
        for (int s = 0; s < n; ++s)
            if (!isHuman(s) && h->winnings()[static_cast<std::size_t>(s)] > 0 &&
                bots_[static_cast<std::size_t>(s)]->wantsToShow(h->view(s), *rng_))
                revealVoluntary(s, 3);

    // Everyone at the table learns from every hand that was turned face up.
    for (int r = 0; r < n; ++r) {
        const bool shown = (h->wentToShowdown() && isRevealed_[static_cast<std::size_t>(r)]) || fullyShown_[static_cast<std::size_t>(r)];
        if (!shown) continue;
        const Strength st = ai::classifyHand(h->seat(r).hole, h->board());
        for (int b = 0; b < n; ++b)
            if (b != r && !isHuman(b)) bots_[static_cast<std::size_t>(b)]->learn(r, features_[static_cast<std::size_t>(r)], st);
        // A bot's tell that matched its revealed hand: the player may have spotted it.
        std::vector<int> seen;
        for (const auto& u : tellUses_) {
            if (u.seat != r || std::find(seen.begin(), seen.end(), u.tell) != seen.end()) continue;
            const ai::Tell* t = ai::findTell(u.tell);
            if (!t || st == Strength::Medium || t->meansStrong() != (st == Strength::Strong)) continue;
            seen.push_back(u.tell);
            Json j;
            j.open('{').key("t").str("tellSeen").key("seat").num(r).key("tell").num(u.tell).key("text").str(t->textZh).close('}');
            push(j.done());
        }
    }

    const std::vector<Chips> before = tournament_->stacks();
    tournament_->finishHand();
    handSettled_ = true;

    // Big losses (or being shown a bluff) can tilt a bot.
    for (int s = 0; s < n; ++s) {
        const auto i = static_cast<std::size_t>(s);
        if (before[i] == 0 || isHuman(s)) continue;
        emitTalk(s, bots_[i]->afterHand(before[i], tournament_->stacks()[i], provoked_[i], *rng_));
    }

    const auto st = tournament_->standings();
    for (int s = 0; s < h->numSeats(); ++s) {
        if (before[static_cast<std::size_t>(s)] > 0 && tournament_->stacks()[static_cast<std::size_t>(s)] == 0) {
            for (const auto& row : st)
                if (row.seat == s) {
                    Json j;
                    j.open('{').key("t").str("eliminated").key("seat").num(s).key("place").num(row.place);
                    j.key("placeTo").num(row.placeTo).close('}');
                    push(j.done());
                }
        }
    }
    if (finished()) {
        Json j;
        j.open('{').key("t").str("tournamentEnd").key("standings").raw(standings()).close('}');
        push(j.done());
    }
}

void Session::collect(std::size_t upTo) {
    Hand* h = tournament_->currentHand();
    if (!h) return;
    const auto& ev = h->events();
    const std::size_t end = std::min(upTo, ev.size());
    for (; converted_ < end; ++converted_) {
        const Event& e = ev[converted_];
        const std::string j = eventJson(e);
        if (!j.empty()) push(j, e.visibleTo);
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
            if (actConverted_ < actThink_.size()) {
                j.key("thinkMs").num(actThink_[actConverted_]);
                if (actSize_[actConverted_] > 0) j.key("potPct").num(actSize_[actConverted_]);
            }
            ++actConverted_;
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
                    f.key("strength").str(strengthName(ai::classifyHand(revealed_[s], board_)));
                    f.key("category").num(static_cast<int>(v.category())).key("best");
                    cards(f, bestFive(all));
                    f.close('}');
                }
                f.close(']').close('}');
                push(f.done());
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
    bool first = true;
    for (const Pending& p : pending_) {
        if (p.to >= 0 && p.to != kHuman) continue;
        if (!first) out += ',';
        out += p.json;
        first = false;
    }
    out += ']';
    pending_.clear();
    return out;
}

std::string Session::drainAll() {
    std::string out = "[";
    for (std::size_t i = 0; i < pending_.size(); ++i) {
        if (i) out += ',';
        out += "{\"to\":" + std::to_string(pending_[i].to) + ",\"e\":" + pending_[i].json + "}";
    }
    out += ']';
    pending_.clear();
    return out;
}

std::string Session::state() const { return stateFor(kHuman); }

std::string Session::stateFor(int seat) const {
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
        const int me = std::clamp(seat, 0, h->numSeats() - 1);
        cards(j, {h->seat(me).hole[0], h->seat(me).hole[1]});
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
