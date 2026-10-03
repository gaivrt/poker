#include "poker/rng.hpp"

#include <stdexcept>

namespace poker {

std::uint64_t Rng::below(std::uint64_t n) {
    if (n == 0) throw std::invalid_argument("Rng::below(0)");
    // Rejection sampling: discard the biased tail so every value is equally likely.
    const std::uint64_t threshold = (0 - n) % n;
    for (;;) {
        const std::uint64_t x = next();
        if (x >= threshold) return x % n;
    }
}

double Rng::uniform() { return static_cast<double>(next() >> 11) * 0x1.0p-53; }

namespace {
std::uint64_t splitmix64(std::uint64_t& x) {
    std::uint64_t z = (x += 0x9e3779b97f4a7c15ULL);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}
std::uint64_t rotl(std::uint64_t x, int k) { return (x << k) | (x >> (64 - k)); }
}  // namespace

Xoshiro256::Xoshiro256(std::uint64_t seed) {
    for (auto& v : s_) v = splitmix64(seed);
}

std::uint64_t Xoshiro256::next() {
    const std::uint64_t result = rotl(s_[1] * 5, 7) * 9;
    const std::uint64_t t = s_[1] << 17;
    s_[2] ^= s_[0];
    s_[3] ^= s_[1];
    s_[1] ^= s_[2];
    s_[0] ^= s_[3];
    s_[2] ^= t;
    s_[3] = rotl(s_[3], 45);
    return result;
}

Deck::Deck() {
    for (int i = 0; i < kDeckSize; ++i) cards_[static_cast<std::size_t>(i)] = Card(static_cast<std::uint8_t>(i));
}

Deck Deck::stacked(const std::vector<Card>& top) {
    Deck d;
    std::array<bool, kDeckSize> used{};
    std::size_t k = 0;
    for (Card c : top) {
        if (used[c.id]) throw std::invalid_argument("Deck::stacked: duplicate card " + c.str());
        used[c.id] = true;
        d.cards_[k++] = c;
    }
    for (int i = 0; i < kDeckSize; ++i)
        if (!used[static_cast<std::size_t>(i)]) d.cards_[k++] = Card(static_cast<std::uint8_t>(i));
    return d;
}

void Deck::shuffle(Rng& rng) {
    // Fisher-Yates.
    for (int i = kDeckSize - 1; i > 0; --i) {
        const auto j = static_cast<int>(rng.below(static_cast<std::uint64_t>(i) + 1));
        std::swap(cards_[static_cast<std::size_t>(i)], cards_[static_cast<std::size_t>(j)]);
    }
    pos_ = 0;
}

Card Deck::draw() {
    if (pos_ >= kDeckSize) throw std::logic_error("Deck::draw: deck exhausted");
    return cards_[static_cast<std::size_t>(pos_++)];
}

}  // namespace poker
