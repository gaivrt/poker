#include "poker/hand_eval.hpp"

#include <bit>
#include <stdexcept>

namespace poker {

namespace {

HandValue make(HandCategory cat, std::initializer_list<int> ranks) {
    std::uint32_t v = static_cast<std::uint32_t>(cat) << 20;
    int shift = 16;
    for (int r : ranks) {
        v |= static_cast<std::uint32_t>(r) << shift;
        shift -= 4;
    }
    return HandValue{v};
}

// Highest rank of a 5-card straight inside `mask` (bit r = rank r present), or -1.
// The ace also plays low (A-2-3-4-5, "wheel", top card 5).
int straightHigh(std::uint32_t mask) {
    // Bit 0 = low ace, bit r+1 = rank r.
    const std::uint32_t ext = (mask << 1) | ((mask >> kRankAce) & 1U);
    for (int top = 13; top >= 4; --top) {
        const std::uint32_t window = 0x1FU << (top - 4);
        if ((ext & window) == window) return top - 1;
    }
    return -1;
}

// Fills `out` with the `n` highest ranks in `mask`.
void topRanks(std::uint32_t mask, int n, int* out) {
    int k = 0;
    for (int r = kRankAce; r >= 0 && k < n; --r)
        if (mask & (1U << r)) out[k++] = r;
}

}  // namespace

HandValue evaluate(std::span<const Card> cards) {
    if (cards.size() < 5 || cards.size() > 7) throw std::invalid_argument("evaluate: need 5..7 cards");

    std::uint32_t suitMask[kNumSuits] = {};
    int counts[kNumRanks] = {};
    std::uint32_t all = 0;
    for (Card c : cards) {
        const std::uint32_t bit = 1U << c.rank();
        suitMask[static_cast<int>(c.suit())] |= bit;
        all |= bit;
        ++counts[c.rank()];
    }

    std::uint32_t flushMask = 0;
    for (std::uint32_t m : suitMask)
        if (std::popcount(m) >= 5) flushMask = m;

    if (flushMask) {
        const int sf = straightHigh(flushMask);
        if (sf >= 0) return make(HandCategory::StraightFlush, {sf});
    }

    int quad = -1, trips[2] = {-1, -1}, pairs[3] = {-1, -1, -1};
    int nTrips = 0, nPairs = 0;
    for (int r = kRankAce; r >= 0; --r) {
        if (counts[r] == 4) quad = r;
        else if (counts[r] == 3 && nTrips < 2) trips[nTrips++] = r;
        else if (counts[r] == 2 && nPairs < 3) pairs[nPairs++] = r;
    }

    if (quad >= 0) {
        int k[1];
        topRanks(all & ~(1U << quad), 1, k);
        return make(HandCategory::FourOfAKind, {quad, k[0]});
    }
    if (nTrips >= 1 && (nTrips >= 2 || nPairs >= 1)) {
        int pairPart = nPairs ? pairs[0] : -1;
        if (nTrips >= 2 && trips[1] > pairPart) pairPart = trips[1];
        return make(HandCategory::FullHouse, {trips[0], pairPart});
    }
    if (flushMask) {
        int k[5];
        topRanks(flushMask, 5, k);
        return make(HandCategory::Flush, {k[0], k[1], k[2], k[3], k[4]});
    }
    if (const int st = straightHigh(all); st >= 0) return make(HandCategory::Straight, {st});
    if (nTrips == 1) {
        int k[2];
        topRanks(all & ~(1U << trips[0]), 2, k);
        return make(HandCategory::ThreeOfAKind, {trips[0], k[0], k[1]});
    }
    if (nPairs >= 2) {
        int k[1];
        topRanks(all & ~(1U << pairs[0]) & ~(1U << pairs[1]), 1, k);
        return make(HandCategory::TwoPair, {pairs[0], pairs[1], k[0]});
    }
    if (nPairs == 1) {
        int k[3];
        topRanks(all & ~(1U << pairs[0]), 3, k);
        return make(HandCategory::OnePair, {pairs[0], k[0], k[1], k[2]});
    }
    int k[5];
    topRanks(all, 5, k);
    return make(HandCategory::HighCard, {k[0], k[1], k[2], k[3], k[4]});
}

const char* categoryNameZh(HandCategory c) {
    switch (c) {
        case HandCategory::HighCard: return "高牌";
        case HandCategory::OnePair: return "一对";
        case HandCategory::TwoPair: return "两对";
        case HandCategory::ThreeOfAKind: return "三条";
        case HandCategory::Straight: return "顺子";
        case HandCategory::Flush: return "同花";
        case HandCategory::FullHouse: return "葫芦";
        case HandCategory::FourOfAKind: return "四条";
        case HandCategory::StraightFlush: return "同花顺";
    }
    return "?";
}

const char* categoryNameEn(HandCategory c) {
    switch (c) {
        case HandCategory::HighCard: return "High Card";
        case HandCategory::OnePair: return "One Pair";
        case HandCategory::TwoPair: return "Two Pair";
        case HandCategory::ThreeOfAKind: return "Three of a Kind";
        case HandCategory::Straight: return "Straight";
        case HandCategory::Flush: return "Flush";
        case HandCategory::FullHouse: return "Full House";
        case HandCategory::FourOfAKind: return "Four of a Kind";
        case HandCategory::StraightFlush: return "Straight Flush";
    }
    return "?";
}

std::string describeZh(HandValue v) {
    auto r = [&](int i) { return std::string(1, rankChar(v.slot(i))); };
    switch (v.category()) {
        case HandCategory::StraightFlush:
            return v.isRoyalFlush() ? std::string("皇家同花顺") : "同花顺 到" + r(0);
        case HandCategory::FourOfAKind: return "四条 " + r(0);
        case HandCategory::FullHouse: return "葫芦 " + r(0) + "带" + r(1);
        case HandCategory::Flush: return "同花 " + r(0) + "大";
        case HandCategory::Straight: return "顺子 到" + r(0);
        case HandCategory::ThreeOfAKind: return "三条 " + r(0);
        case HandCategory::TwoPair: return "两对 " + r(0) + "和" + r(1);
        case HandCategory::OnePair: return "一对 " + r(0);
        case HandCategory::HighCard: return "高牌 " + r(0);
    }
    return "?";
}

}  // namespace poker
