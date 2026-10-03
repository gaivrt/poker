#pragma once

#include <compare>
#include <cstdint>
#include <span>
#include <string>

#include "poker/card.hpp"

namespace poker {

enum class HandCategory : std::uint8_t {
    HighCard = 0,
    OnePair,
    TwoPair,
    ThreeOfAKind,
    Straight,
    Flush,
    FullHouse,
    FourOfAKind,
    StraightFlush,
};

// Comparable strength of the best 5-card hand.
// Layout: category << 20 | five 4-bit rank slots (most significant first).
// A larger value is a stronger hand; equal values split the pot.
struct HandValue {
    std::uint32_t raw = 0;

    HandCategory category() const { return static_cast<HandCategory>(raw >> 20); }
    // Rank in slot i (0 = most significant). Unused slots are 0.
    int slot(int i) const { return static_cast<int>((raw >> (16 - 4 * i)) & 0xF); }
    bool isRoyalFlush() const { return category() == HandCategory::StraightFlush && slot(0) == kRankAce; }

    friend auto operator<=>(HandValue, HandValue) = default;
};

// Best 5-card hand out of 5, 6 or 7 cards.
HandValue evaluate(std::span<const Card> cards);

const char* categoryNameZh(HandCategory c);
const char* categoryNameEn(HandCategory c);
// e.g. "葫芦 K带7", "顺子 到A"; used by logs and the CLI.
std::string describeZh(HandValue v);

}  // namespace poker
