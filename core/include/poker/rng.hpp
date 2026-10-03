#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "poker/card.hpp"

namespace poker {

// Random source used by the engine. Production servers plug in a CSPRNG;
// simulations and replays use the deterministic Xoshiro256 below.
class Rng {
public:
    virtual ~Rng() = default;
    virtual std::uint64_t next() = 0;

    // Unbiased integer in [0, n). Implemented here (not std::uniform_int_distribution)
    // so the same seed shuffles identically on every platform and standard library.
    std::uint64_t below(std::uint64_t n);
    // Uniform double in [0, 1).
    double uniform();
};

class Xoshiro256 final : public Rng {
public:
    explicit Xoshiro256(std::uint64_t seed);
    std::uint64_t next() override;

private:
    std::array<std::uint64_t, 4> s_{};
};

// A 52-card deck dealt from the top.
class Deck {
public:
    Deck();  // ordered deck
    // A deck whose first cards are `top` (in order), followed by the rest in id order.
    // Used by tests and replays to rig a specific deal.
    static Deck stacked(const std::vector<Card>& top);

    void shuffle(Rng& rng);
    Card draw();
    int remaining() const { return kDeckSize - pos_; }

private:
    std::array<Card, kDeckSize> cards_{};
    int pos_ = 0;
};

}  // namespace poker
