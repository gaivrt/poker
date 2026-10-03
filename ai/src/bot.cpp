#include "poker/ai/bot.hpp"

#include <algorithm>
#include <cmath>

#include "poker/ai/equity.hpp"
#include "poker/ai/mind.hpp"

namespace poker::ai {

const std::vector<Personality>& personalityPresets() {
    static const std::vector<Personality> presets = {
        {0, "紧凶型", 0.35, 0.75, 0.12},
        {1, "跟注站", 0.80, 0.25, 0.04},
        {2, "疯狂型", 0.80, 0.90, 0.30},
        {3, "岩石型", 0.20, 0.40, 0.03},
        {4, "平衡型", 0.50, 0.55, 0.12},
        {5, "诈唬型", 0.55, 0.70, 0.25},
    };
    return presets;
}

const char* difficultyNameZh(Difficulty d) {
    switch (d) {
        case Difficulty::Easy: return "简单";
        case Difficulty::Normal: return "普通";
        case Difficulty::Hard: return "困难";
    }
    return "?";
}

namespace {

struct Situation {
    int opponents = 0;      // live opponents
    int raisesThisStreet = 0;
    int preflopRaisesByOthers = 0;
    int yetToAct = 0;       // live, not all-in opponents that have not acted on this street
    Chips myTotal = 0;      // stack + chips already in front on this street
    double effectiveBB = 0;
};

Situation analyze(const PlayerView& v) {
    Situation s;
    const auto& me = v.seats[static_cast<std::size_t>(v.seat)];
    s.myTotal = me.stack + me.street;
    Chips biggestOpp = 0;
    std::vector<bool> actedThisStreet(v.seats.size(), false);
    for (const Event& e : v.history) {
        if (e.type != EventType::Act) continue;
        const bool aggressive = e.action == ActionType::Bet || e.action == ActionType::Raise;
        if (e.street == v.street) {
            actedThisStreet[static_cast<std::size_t>(e.seat)] = true;
            if (aggressive) ++s.raisesThisStreet;
        }
        if (e.street == Street::Preflop && aggressive && e.seat != v.seat) ++s.preflopRaisesByOthers;
    }
    for (std::size_t i = 0; i < v.seats.size(); ++i) {
        const auto& st = v.seats[i];
        if (static_cast<int>(i) == v.seat || !st.inHand || st.folded) continue;
        ++s.opponents;
        biggestOpp = std::max(biggestOpp, st.stack + st.street);
        if (!st.allIn && !actedThisStreet[i]) ++s.yetToAct;
    }
    s.effectiveBB = static_cast<double>(std::min(s.myTotal, biggestOpp)) / static_cast<double>(v.bigBlind);
    return s;
}

// Adjustments from the mind-game layer: tilt and reads on opponents' signals.
struct Mods {
    double loose = 0, aggr = 0, bluff = 0;  // added to the personality
    double rangeMul = 1;                    // <1: assume opponents are stronger
    double margin = 0;                      // extra equity needed to call
    double bluffBoost = 0;                  // extra chance to bet when checked to
};

int lastAggressor(const PlayerView& v) {
    int seat = -1;
    for (const Event& e : v.history)
        if (e.type == EventType::Act && e.street == v.street && (e.action == ActionType::Bet || e.action == ActionType::Raise))
            seat = e.seat;
    return seat;
}

class HeuristicBot final : public Bot {
public:
    HeuristicBot(Difficulty d, Personality p) : diff_(d), p_(std::move(p)), mind_(mindProfile(p_.id)) {}

    Action decide(const PlayerView& v, Rng& rng) override { return decideImpl(v, rng, tiltMods()); }

    // ---------------- mind games ----------------

    Plan plan(const PlayerView& v, Rng& rng) override {
        Plan pl;
        strength_ = ownStrength(v, rng);
        double ms = mind_.thinkMs * (0.7 + 0.6 * rng.uniform());
        if (v.legal.canFold && strength_ == Strength::Weak) ms *= 0.75;  // easy folds come quickly
        for (const Tell& t : mind_.tells) {
            if (!fires(t, rng)) continue;
            if (t.feature == kFeatureFastBet) {
                pl.fastTell = true, pl.timingTell = t.id;
                ms *= 0.35;
            } else if (t.feature == kFeatureSlowBet) {
                pl.slowTell = true, pl.timingTell = t.id;
                ms *= 2.3;
            } else if (t.feature >= kLineFeatures) {  // expressions and gestures show while thinking
                pl.talk.signals.push_back(signalFor(v.seat, t.feature, aimAt(v)));
                pl.talk.tells.push_back(t.id);
            }
        }
        if (tilt_ > 0) ms *= 0.6;  // tilted players act fast
        pl.thinkMs = std::clamp(static_cast<int>(ms), 350, 6000);
        return pl;
    }

    Action decideTalk(const PlayerView& v, const TalkView& talk, Rng& rng) override {
        Mods m = tiltMods();
        const double k = mind_.reactiveness * (diff_ == Difficulty::Easy ? 1.0 : diff_ == Difficulty::Normal ? 0.9 : 0.8);
        const auto& la = v.legal;
        if (la.canCall) {
            const int a = lastAggressor(v);
            if (a >= 0 && a != v.seat) {
                const double b = belief(a, talk);
                m.rangeMul = std::exp(-2.0 * k * (b - 0.5));
                m.margin += 0.15 * k * (b - 0.5);
            }
        } else if (la.canCheck) {
            double weakest = 1.0;
            for (std::size_t s = 0; s < v.seats.size(); ++s)
                if (static_cast<int>(s) != v.seat && v.seats[s].inHand && !v.seats[s].folded)
                    weakest = std::min(weakest, belief(static_cast<int>(s), talk));
            if (weakest < 0.5) m.bluffBoost = k * (0.5 - weakest) * 0.8;
        }
        return decideImpl(v, rng, m);
    }

    Talk afterAction(const PlayerView& v, const Action& a, Rng& rng) override {
        Talk out;
        if (a.type == ActionType::Fold || a.type == ActionType::Check) return out;
        const bool aggressive = a.type == ActionType::Bet || a.type == ActionType::Raise;
        for (const Tell& t : mind_.tells)
            if (t.feature < kLineFeatures && aggressive && fires(t, rng)) {
                out.signals.push_back(signalFor(v.seat, t.feature, aimAt(v)));
                out.tells.push_back(t.id);
            }
        if (out.signals.empty() && rng.uniform() < mind_.talk * (aggressive ? 1.0 : 0.35))
            out.signals.push_back(lineSignal(v.seat, characterLine(rng), aimAt(v)));
        return out;
    }

    Talk respond(const Signal& said, const PlayerView& v, Rng& rng) override {
        Talk out;
        if (said.kind != SignalKind::Line || rng.uniform() > std::min(0.9, 0.2 + mind_.talk * 1.4)) return out;
        const auto& me = v.seats[static_cast<std::size_t>(v.seat)];
        if (!me.inHand || me.folded) {
            out.signals.push_back(lineSignal(v.seat, rng.uniform() < 0.5 ? LineKind::Hurry : LineKind::Taunt, said.seat));
            return out;
        }
        strength_ = ownStrength(v, rng);
        out.signals.push_back(lineSignal(v.seat, characterLine(rng), said.seat));
        // Someone who reads taunts backwards answers one with a smug look.
        if (mind_.contrarian && said.code == static_cast<std::uint8_t>(LineKind::Taunt))
            out.signals.push_back(Signal{v.seat, -1, SignalKind::Expression, static_cast<std::uint8_t>(Expression::Smug)});
        return out;
    }

    void learn(int seat, const std::vector<int>& features, Strength s) override {
        if (seat < 0) return;
        if (reads_.size() <= static_cast<std::size_t>(seat)) reads_.resize(static_cast<std::size_t>(seat) + 1);
        reads_[static_cast<std::size_t>(seat)].observe(features, s);
    }

    Talk afterHand(Chips before, Chips after, bool provoked, Rng& rng) override {
        Talk out;
        const bool bigLoss = before > 0 && static_cast<double>(before - after) >= 0.35 * static_cast<double>(before);
        const double resist = diff_ == Difficulty::Hard ? 0.5 : 1.0;
        if (after > 0 && (bigLoss || provoked) && rng.uniform() < mind_.tiltProne * resist * (provoked ? 1.5 : 1.0)) {
            tilt_ = diff_ == Difficulty::Hard ? 2 : 4;
            out.signals.push_back(Signal{-1, -1, SignalKind::Expression, static_cast<std::uint8_t>(Expression::Angry)});
        } else if (tilt_ > 0 && --tilt_ == 0) {
            out.signals.push_back(Signal{-1, -1, SignalKind::Expression, static_cast<std::uint8_t>(Expression::Calm)});
        }
        return out;
    }

    bool wantsToShow(const PlayerView& v, Rng& rng) override {
        (void)v;
        return strength_ == Strength::Weak && rng.uniform() < mind_.showBluff;
    }

private:
    Mods tiltMods() const {
        Mods m;
        if (tilt_ > 0) m.loose = 0.25, m.aggr = 0.25, m.bluff = 0.12;
        return m;
    }

    double belief(int seat, const TalkView& talk) const {
        if (seat < 0 || static_cast<std::size_t>(seat) >= talk.features.size()) return 0.5;
        const auto& f = talk.features[static_cast<std::size_t>(seat)];
        if (f.empty()) return 0.5;
        static const ReadModel blank;
        const ReadModel& rm = static_cast<std::size_t>(seat) < reads_.size() ? reads_[static_cast<std::size_t>(seat)] : blank;
        const double w = mind_.priorWeight * (diff_ == Difficulty::Easy ? 1.5 : diff_ == Difficulty::Hard ? 0.5 : 1.0);
        return rm.belief(f, w, mind_.contrarian);
    }

    Strength ownStrength(const PlayerView& v, Rng& rng) const {
        int opps = 0;
        for (std::size_t s = 0; s < v.seats.size(); ++s)
            if (static_cast<int>(s) != v.seat && v.seats[s].inHand && !v.seats[s].folded) ++opps;
        opps = std::clamp(opps, 1, 9);
        const double rel = estimateEquity(v.hole, v.board, opps, 200, rng) * (opps + 1);
        return rel > 1.6 ? Strength::Strong : rel < 0.85 ? Strength::Weak : Strength::Medium;
    }

    // Tells are clearest on Easy and almost hidden on Hard.
    bool fires(const Tell& t, Rng& rng) const {
        const double mean = (t.pStrong + t.pWeak) / 2;
        double p = strength_ == Strength::Strong ? t.pStrong : strength_ == Strength::Weak ? t.pWeak : mean * 0.6;
        const double k = diff_ == Difficulty::Easy ? 1.0 : diff_ == Difficulty::Normal ? 0.65 : 0.3;
        p = mean + (p - mean) * k;
        return rng.uniform() < p;
    }

    // A line in character: honest characters say what they have, liars the opposite.
    LineKind characterLine(Rng& rng) const {
        const double h = mind_.honesty;
        if (strength_ != Strength::Medium && rng.uniform() < std::abs(h)) {
            const bool sayStrong = (strength_ == Strength::Strong) == (h > 0);
            if (sayStrong) return rng.uniform() < 0.5 ? LineKind::Confident : LineKind::Taunt;
            return rng.uniform() < 0.5 ? LineKind::Weak : LineKind::Plead;
        }
        static const LineKind any[] = {LineKind::Taunt, LineKind::Weak, LineKind::Confident, LineKind::Probe};
        return any[rng.below(4)];
    }

    static int aimAt(const PlayerView& v) {
        const int a = lastAggressor(v);
        return a != v.seat ? a : -1;
    }

    static Signal lineSignal(int seat, LineKind k, int target) {
        return Signal{seat, target, SignalKind::Line, static_cast<std::uint8_t>(k)};
    }

    static Signal signalFor(int seat, int feature, int target) {
        if (feature < kLineFeatures) return lineSignal(seat, static_cast<LineKind>(feature), target);
        if (feature < kLineFeatures + kExpressionFeatures)
            return Signal{seat, -1, SignalKind::Expression, static_cast<std::uint8_t>(feature - kLineFeatures)};
        const auto g = static_cast<std::uint8_t>(feature - kLineFeatures - kExpressionFeatures);
        return Signal{seat, g == static_cast<std::uint8_t>(Gesture::Stare) ? target : -1, SignalKind::Gesture, g};
    }

    Action decideImpl(const PlayerView& v, Rng& rng, const Mods& m) {
        const Personality p{p_.id, p_.name, std::clamp(p_.looseness + m.loose, 0.0, 1.0),
                            std::clamp(p_.aggression + m.aggr, 0.0, 1.0), std::clamp(p_.bluff + m.bluff, 0.0, 1.0)};
        const LegalActions& la = v.legal;
        const Situation s = analyze(v);
        const bool preflop = v.street == Street::Preflop;
        const int opps = std::clamp(s.opponents, 1, 9);

        // --- equity estimate (against a range shaped by the betting so far) ---
        double range = 1.0;
        if (diff_ == Difficulty::Hard) {
            if (s.raisesThisStreet >= 2) range = 0.20;
            else if (s.raisesThisStreet == 1) range = 0.45;
            else if (!preflop && s.preflopRaisesByOthers > 0) range = 0.60;
        } else if (diff_ == Difficulty::Normal) {
            if (s.raisesThisStreet >= 2) range = 0.25;
            else if (s.raisesThisStreet == 1) range = 0.50;
        }
        if (m.rangeMul != 1.0) range = std::clamp(range * m.rangeMul, 0.05, 1.0);
        const int iters = diff_ == Difficulty::Easy ? 150 : diff_ == Difficulty::Normal ? 400 : 900;
        double eq = estimateEquity(v.hole, v.board, opps, iters, rng, range);
        if (diff_ == Difficulty::Easy) eq = std::clamp(eq + (rng.uniform() - 0.5) * 0.16, 0.0, 1.0);
        const double share = 1.0 / (opps + 1);
        const double rel = eq / share;  // 1.0 = an average hand in this spot
        const double potOdds =
            la.toCall > 0 ? static_cast<double>(la.toCall) / static_cast<double>(v.pot + la.toCall) : 0.0;

        // --- short stack: push or fold (tournament endgame) ---
        const double pushFoldDepth = diff_ == Difficulty::Hard ? 12 : diff_ == Difficulty::Normal ? 9 : 0;
        if (preflop && s.effectiveBB <= pushFoldDepth) {
            const double pct = preflopPercentile(v.hole[0], v.hole[1]);
            if (s.raisesThisStreet == 0) {
                double pushTop = 0.15 + (12.0 - s.effectiveBB) * 0.035 + (5 - s.yetToAct) * 0.06 +
                                 (p.looseness - 0.5) * 0.15;
                pushTop = std::clamp(pushTop, 0.08, 0.85);
                if (pct <= pushTop) return shove(la);
                return la.canCheck ? Action::check() : Action::fold();
            }
            const double margin = diff_ == Difficulty::Hard ? 0.02 : 0.04;
            if (eq > potOdds + margin) {
                if (la.canRaise && rel > 2.2) return shove(la);
                return la.canCall ? Action::call() : Action::check();
            }
            return la.canCheck ? Action::check() : Action::fold();
        }

        const double aggr = p.aggression * (diff_ == Difficulty::Easy ? 0.6 : 1.0);
        const bool canAggress = la.canBet || la.canRaise;

        if (la.canCheck) {
            const double valueThreshold = (preflop ? 1.8 : 1.25) + 0.5 * (1.0 - aggr);
            if (canAggress && rel > valueThreshold && rng.uniform() < 0.55 + 0.45 * aggr)
                return aggress(v, la, s, rel > valueThreshold + 0.8 ? 0.75 : 0.55);
            double bluffChance = p.bluff * (opps == 1 ? 1.5 : 0.6);
            if (diff_ == Difficulty::Hard && s.yetToAct == 0) bluffChance *= 1.5;  // in position
            bluffChance += m.bluffBoost;
            if (canAggress && !preflop && rng.uniform() < bluffChance) return aggress(v, la, s, 0.5);
            return Action::check();
        }

        // Facing a bet.
        const double raiseThreshold = 1.7 + 0.6 * (1.0 - aggr);
        if (la.canRaise && rel > raiseThreshold && rng.uniform() < 0.4 + 0.5 * aggr)
            return aggress(v, la, s, 0.8);

        double margin = 0.0;
        switch (diff_) {
            case Difficulty::Easy: margin = -0.08 - 0.05 * p.looseness; break;
            case Difficulty::Normal: margin = 0.03 - 0.06 * (p.looseness - 0.5); break;
            case Difficulty::Hard: margin = 0.02 - 0.04 * (p.looseness - 0.5); break;
        }
        if (preflop) margin -= 0.04;  // implied odds: there are streets to come
        margin += m.margin;
        if (eq >= potOdds + margin) return Action::call();

        if (diff_ != Difficulty::Easy && la.canRaise && !preflop && opps == 1 && rng.uniform() < p.bluff * 0.3)
            return aggress(v, la, s, 0.8);
        return Action::fold();
    }

    static Action shove(const LegalActions& la) {
        if (la.canBet) return Action::bet(la.maxTo);
        if (la.canRaise) return Action::raise(la.maxTo);
        return la.canCall ? Action::call() : Action::check();
    }

    // Bet or raise sized as a fraction of the pot (preflop: standard open / 3-bet sizes).
    static Action aggress(const PlayerView& v, const LegalActions& la, const Situation& s, double potFraction) {
        Chips to;
        if (v.street == Street::Preflop) {
            if (s.raisesThisStreet == 0) {
                int limpers = 0;
                for (const Event& e : v.history)
                    if (e.type == EventType::Act && e.street == Street::Preflop && e.action == ActionType::Call) ++limpers;
                to = v.bigBlind * 5 / 2 + limpers * v.bigBlind;
            } else {
                to = v.currentBet * 3;
            }
        } else {
            const Chips toCall = la.canRaise ? la.toCall : 0;
            to = v.currentBet + static_cast<Chips>(std::llround(static_cast<double>(v.pot + toCall) * potFraction));
        }
        // Round to small-blind units so bets read like a person made them.
        const Chips unit = std::max<Chips>(1, v.smallBlind);
        to = (to + unit / 2) / unit * unit;
        // Commit the rest when the bet would leave a stack too small to fold.
        const Chips left = la.maxTo - to;
        if (left < v.pot / 2) to = la.maxTo;
        to = std::clamp(to, la.minTo, la.maxTo);
        return la.canBet ? Action::bet(to) : Action::raise(to);
    }

    Difficulty diff_;
    Personality p_;
    const MindProfile& mind_;
    std::vector<ReadModel> reads_;
    Strength strength_ = Strength::Medium;  // own hand, as of the last plan()
    int tilt_ = 0;                          // hands left on tilt
};

}  // namespace

std::unique_ptr<Bot> makeBot(Difficulty difficulty, const Personality& personality) {
    return std::make_unique<HeuristicBot>(difficulty, personality);
}

}  // namespace poker::ai
