#include "poker/ai/bot.hpp"

#include <algorithm>
#include <cmath>

#include "poker/ai/equity.hpp"

namespace poker::ai {

const std::vector<Personality>& personalityPresets() {
    static const std::vector<Personality> presets = {
        {"紧凶型", 0.35, 0.75, 0.12},
        {"跟注站", 0.80, 0.25, 0.04},
        {"疯狂型", 0.80, 0.90, 0.30},
        {"岩石型", 0.20, 0.40, 0.03},
        {"平衡型", 0.50, 0.55, 0.12},
        {"诈唬型", 0.55, 0.70, 0.25},
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

class HeuristicBot final : public Bot {
public:
    HeuristicBot(Difficulty d, Personality p) : diff_(d), p_(std::move(p)) {}

    Action decide(const PlayerView& v, Rng& rng) override {
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
                                 (p_.looseness - 0.5) * 0.15;
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

        const double aggr = p_.aggression * (diff_ == Difficulty::Easy ? 0.6 : 1.0);
        const bool canAggress = la.canBet || la.canRaise;

        if (la.canCheck) {
            const double valueThreshold = (preflop ? 1.8 : 1.25) + 0.5 * (1.0 - aggr);
            if (canAggress && rel > valueThreshold && rng.uniform() < 0.55 + 0.45 * aggr)
                return aggress(v, la, s, rel > valueThreshold + 0.8 ? 0.75 : 0.55);
            double bluffChance = p_.bluff * (opps == 1 ? 1.5 : 0.6);
            if (diff_ == Difficulty::Hard && s.yetToAct == 0) bluffChance *= 1.5;  // in position
            if (canAggress && !preflop && rng.uniform() < bluffChance) return aggress(v, la, s, 0.5);
            return Action::check();
        }

        // Facing a bet.
        const double raiseThreshold = 1.7 + 0.6 * (1.0 - aggr);
        if (la.canRaise && rel > raiseThreshold && rng.uniform() < 0.4 + 0.5 * aggr)
            return aggress(v, la, s, 0.8);

        double margin = 0.0;
        switch (diff_) {
            case Difficulty::Easy: margin = -0.08 - 0.05 * p_.looseness; break;
            case Difficulty::Normal: margin = 0.03 - 0.06 * (p_.looseness - 0.5); break;
            case Difficulty::Hard: margin = 0.02 - 0.04 * (p_.looseness - 0.5); break;
        }
        if (preflop) margin -= 0.04;  // implied odds: there are streets to come
        if (eq >= potOdds + margin) return Action::call();

        if (diff_ != Difficulty::Easy && la.canRaise && !preflop && opps == 1 && rng.uniform() < p_.bluff * 0.3)
            return aggress(v, la, s, 0.8);
        return Action::fold();
    }

private:
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
};

}  // namespace

std::unique_ptr<Bot> makeBot(Difficulty difficulty, const Personality& personality) {
    return std::make_unique<HeuristicBot>(difficulty, personality);
}

}  // namespace poker::ai
