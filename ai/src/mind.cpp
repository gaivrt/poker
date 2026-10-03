#include "poker/ai/mind.hpp"

#include <algorithm>
#include <cmath>

#include "poker/ai/equity.hpp"
#include "poker/hand_eval.hpp"

namespace poker::ai {

namespace {

constexpr int line(LineKind k) { return featureOf(SignalKind::Line, static_cast<std::uint8_t>(k)); }
constexpr int expr(Expression e) { return featureOf(SignalKind::Expression, static_cast<std::uint8_t>(e)); }
constexpr int gest(Gesture g) { return featureOf(SignalKind::Gesture, static_cast<std::uint8_t>(g)); }

// Indices match personalityPresets() in bot.cpp:
// 0 紧凶型 凛 · 1 跟注站 团子 · 2 疯狂型 焰 · 3 岩石型 静 · 4 平衡型 葵 · 5 诈唬型 狐
const std::vector<MindProfile>& profiles() {
    static const std::vector<MindProfile> p = {
        // 凛: quiet, ignores table talk; bets fast with big hands, stares when bluffing.
        {0.20, 0.0, 0.25, 3.0, false, 0.15, 0.05, 1300,
         {{1, kFeatureFastBet, 0.70, 0.15, "拿到大牌时下注特别快"},
          {2, gest(Gesture::Stare), 0.10, 0.55, "诈唬时会一直盯着对手"}}},
        // 团子: chatty and honest, believes what people say; fiddles chips with big hands.
        {0.55, 0.8, 0.80, 6.0, false, 0.40, 0.00, 1700,
         {{3, gest(Gesture::FiddleChips), 0.70, 0.08, "拿到大牌时会忍不住摸筹码"},
          {4, gest(Gesture::Sigh), 0.05, 0.55, "牌不好时会叹气"}}},
        // 焰: loud, provoked by taunts (reads them backwards), tilts easily.
        {0.75, -0.3, 0.70, 3.0, true, 0.60, 0.35, 900,
         {{5, line(LineKind::Taunt), 0.20, 0.65, "越是牌烂越爱挑衅"},
          {6, kFeatureSlowBet, 0.60, 0.10, "拿到大牌时会故意长考"}}},
        // 静: almost silent and hard to rattle; looks nervous with monsters.
        {0.12, 0.4, 0.30, 4.0, false, 0.05, 0.00, 2100,
         {{7, expr(Expression::Nervous), 0.55, 0.08, "拿到大牌反而会显得紧张"},
          {8, gest(Gesture::RecheckCards), 0.08, 0.45, "牌不好时会再看一眼底牌"}}},
        // 葵: balanced and a quick learner; one small tell.
        {0.35, 0.0, 0.50, 1.5, false, 0.15, 0.10, 1500,
         {{9, expr(Expression::Smile), 0.45, 0.10, "拿到好牌时嘴角会上扬"}}},
        // 狐: says the opposite of what she has, loves showing bluffs, reads people fast.
        {0.60, -0.8, 0.60, 1.0, false, 0.20, 0.50, 1300,
         {{10, line(LineKind::Weak), 0.55, 0.08, "装可怜的时候往往是大牌"},
          {11, line(LineKind::Confident), 0.12, 0.50, "嘴上说「稳了」的时候多半在诈唬"}}},
    };
    return p;
}

}  // namespace

const MindProfile& mindProfile(int personalityId) {
    const auto& p = profiles();
    return p[static_cast<std::size_t>(std::clamp(personalityId, 0, static_cast<int>(p.size()) - 1))];
}

const Tell* findTell(int id) {
    for (const auto& prof : profiles())
        for (const auto& t : prof.tells)
            if (t.id == id) return &t;
    return nullptr;
}

double naiveStrongProb(int f) {
    static const std::array<double, kNumFeatures> table = {
        // lines: taunt, weak, confident, probe, hurry, plead
        0.65, 0.30, 0.70, 0.50, 0.60, 0.30,
        // expressions: calm, smug, nervous, smile, angry
        0.50, 0.65, 0.35, 0.60, 0.45,
        // gestures: recheck cards, fiddle chips, stare, sigh
        0.45, 0.60, 0.60, 0.30,
        // fast bet, slow bet
        0.55, 0.50,
    };
    return table[static_cast<std::size_t>(std::clamp(f, 0, kNumFeatures - 1))];
}

namespace {
std::vector<int> unique(std::vector<int> v) {
    std::sort(v.begin(), v.end());
    v.erase(std::unique(v.begin(), v.end()), v.end());
    return v;
}
}  // namespace

void ReadModel::observe(const std::vector<int>& features, Strength s) {
    const double score = s == Strength::Strong ? 1.0 : s == Strength::Medium ? 0.5 : 0.0;
    for (int f : unique(features)) {
        if (f < 0 || f >= kNumFeatures) continue;
        seen_[static_cast<std::size_t>(f)] += 1;
        strong_[static_cast<std::size_t>(f)] += score;
    }
}

double ReadModel::belief(const std::vector<int>& features, double priorWeight, bool contrarian) const {
    const double w = std::max(0.5, priorWeight);
    double logit = 0;
    for (int f : unique(features)) {
        if (f < 0 || f >= kNumFeatures) continue;
        double prior = naiveStrongProb(f);
        if (contrarian) prior = 1.0 - prior;
        const auto i = static_cast<std::size_t>(f);
        const double p = std::clamp((strong_[i] + prior * w) / (seen_[i] + w), 0.05, 0.95);
        logit += std::log(p / (1 - p));
    }
    return std::clamp(1.0 / (1.0 + std::exp(-logit)), 0.08, 0.92);
}

Strength classifyHand(const std::array<Card, 2>& hole, const std::vector<Card>& board) {
    if (board.size() < 3) {
        const double pct = preflopPercentile(hole[0], hole[1]);
        return pct <= 0.15 ? Strength::Strong : pct >= 0.5 ? Strength::Weak : Strength::Medium;
    }
    std::vector<Card> all(board);
    all.push_back(hole[0]);
    all.push_back(hole[1]);
    const HandValue mine = evaluate(all);
    // A hand that only plays the board (e.g. two pair on a double-paired board) is weak.
    if (board.size() >= 5) {
        const HandValue boardOnly = evaluate(board);
        if (mine.category() == boardOnly.category() && mine.slot(0) == boardOnly.slot(0)) return Strength::Weak;
    }
    if (mine.category() >= HandCategory::TwoPair) return Strength::Strong;
    if (mine.category() == HandCategory::OnePair) return Strength::Medium;
    return Strength::Weak;
}

}  // namespace poker::ai
