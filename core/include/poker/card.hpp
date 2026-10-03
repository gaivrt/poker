#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace poker {

using Chips = std::int64_t;

enum class Suit : std::uint8_t { Clubs = 0, Diamonds = 1, Hearts = 2, Spades = 3 };

// Rank index: 0 = '2' ... 12 = 'A'.
inline constexpr int kNumRanks = 13;
inline constexpr int kNumSuits = 4;
inline constexpr int kDeckSize = 52;
inline constexpr int kRankAce = 12;

// A card is a single byte: id = rank * 4 + suit.
struct Card {
    std::uint8_t id = 0;

    constexpr Card() = default;
    constexpr explicit Card(std::uint8_t cardId) : id(cardId) {}
    constexpr Card(int rank, Suit suit)
        : id(static_cast<std::uint8_t>(rank * kNumSuits + static_cast<int>(suit))) {}

    constexpr int rank() const { return id >> 2; }
    constexpr Suit suit() const { return static_cast<Suit>(id & 3); }

    // "As", "Td", "2c".
    std::string str() const;
    static std::optional<Card> parse(std::string_view text);

    friend constexpr bool operator==(Card a, Card b) { return a.id == b.id; }
};

char rankChar(int rank);
char suitChar(Suit suit);

// Parses a whitespace separated list: "As Kd 2c". Throws std::invalid_argument on bad input.
std::vector<Card> parseCards(std::string_view text);
std::string cardsToString(const std::vector<Card>& cards);

}  // namespace poker
