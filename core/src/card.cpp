#include "poker/card.hpp"

#include <stdexcept>

namespace poker {

namespace {
constexpr std::string_view kRanks = "23456789TJQKA";
constexpr std::string_view kSuits = "cdhs";
}  // namespace

char rankChar(int rank) { return kRanks.at(static_cast<std::size_t>(rank)); }

char suitChar(Suit suit) { return kSuits.at(static_cast<std::size_t>(suit)); }

std::string Card::str() const { return {rankChar(rank()), suitChar(suit())}; }

std::optional<Card> Card::parse(std::string_view text) {
    if (text.size() != 2) return std::nullopt;
    char r = text[0];
    if (r >= 'a' && r <= 'z') r = static_cast<char>(r - 'a' + 'A');
    const auto rankPos = kRanks.find(r);
    const auto suitPos = kSuits.find(text[1]);
    if (rankPos == std::string_view::npos || suitPos == std::string_view::npos) return std::nullopt;
    return Card(static_cast<int>(rankPos), static_cast<Suit>(suitPos));
}

std::vector<Card> parseCards(std::string_view text) {
    std::vector<Card> out;
    std::size_t i = 0;
    while (i < text.size()) {
        while (i < text.size() && text[i] == ' ') ++i;
        if (i >= text.size()) break;
        std::size_t j = i;
        while (j < text.size() && text[j] != ' ') ++j;
        auto card = Card::parse(text.substr(i, j - i));
        if (!card) throw std::invalid_argument("bad card: " + std::string(text.substr(i, j - i)));
        out.push_back(*card);
        i = j;
    }
    return out;
}

std::string cardsToString(const std::vector<Card>& cards) {
    std::string s;
    for (std::size_t i = 0; i < cards.size(); ++i) {
        if (i) s += ' ';
        s += cards[i].str();
    }
    return s;
}

}  // namespace poker
