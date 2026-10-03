#include "poker/ai/equity.hpp"

#include <algorithm>
#include <stdexcept>

#include "poker/hand_eval.hpp"

namespace poker::ai {

namespace {

// 169 starting-hand classes: index = hi * 13 + lo, suited when hi > lo stored as [hi][lo],
// offsuit as [lo][hi], pairs on the diagonal.
int classIndex(Card a, Card b) {
    int hi = a.rank(), lo = b.rank();
    if (hi < lo) std::swap(hi, lo);
    if (hi == lo) return hi * kNumRanks + hi;
    return a.suit() == b.suit() ? hi * kNumRanks + lo : lo * kNumRanks + hi;
}

struct PreflopTable {
    std::array<double, 169> equity{};
    std::array<double, 169> percentile{};

    PreflopTable() {
        Xoshiro256 rng(0x5eed'cafe);
        constexpr int kIters = 3000;
        std::array<int, 169> combos{};
        for (int i = 0; i < kNumRanks; ++i) {
            for (int j = 0; j < kNumRanks; ++j) {
                Card a, b;
                if (i == j) {
                    a = Card(i, Suit::Clubs), b = Card(i, Suit::Diamonds);
                    combos[static_cast<std::size_t>(i * kNumRanks + j)] = 6;
                } else if (i > j) {
                    a = Card(i, Suit::Clubs), b = Card(j, Suit::Clubs);  // suited
                    combos[static_cast<std::size_t>(i * kNumRanks + j)] = 4;
                } else {
                    a = Card(j, Suit::Clubs), b = Card(i, Suit::Diamonds);  // offsuit
                    combos[static_cast<std::size_t>(i * kNumRanks + j)] = 12;
                }
                equity[static_cast<std::size_t>(classIndex(a, b))] = estimateEquity({a, b}, {}, 1, kIters, rng);
            }
        }
        std::array<int, 169> order{};
        for (int k = 0; k < 169; ++k) order[static_cast<std::size_t>(k)] = k;
        std::sort(order.begin(), order.end(), [&](int x, int y) {
            return equity[static_cast<std::size_t>(x)] > equity[static_cast<std::size_t>(y)];
        });
        int cumulative = 0;
        for (int k : order) {
            cumulative += combos[static_cast<std::size_t>(k)];
            percentile[static_cast<std::size_t>(k)] = cumulative / 1326.0;
        }
    }
};

const PreflopTable& table() {
    static const PreflopTable t;
    return t;
}

}  // namespace

double preflopEquity(Card a, Card b) { return table().equity[static_cast<std::size_t>(classIndex(a, b))]; }

double preflopPercentile(Card a, Card b) {
    return table().percentile[static_cast<std::size_t>(classIndex(a, b))];
}

double estimateEquity(const std::array<Card, 2>& hole, const std::vector<Card>& board, int opponents,
                      int iterations, Rng& rng, double rangeTop) {
    if (opponents < 1 || opponents > 9 || iterations < 1) throw std::invalid_argument("estimateEquity: bad arguments");
    if (board.size() > 5) throw std::invalid_argument("estimateEquity: board too long");

    std::array<bool, kDeckSize> known{};
    known[hole[0].id] = known[hole[1].id] = true;
    for (Card c : board) known[c.id] = true;
    std::array<Card, kDeckSize> pool{};
    int poolSize = 0;
    for (int i = 0; i < kDeckSize; ++i)
        if (!known[static_cast<std::size_t>(i)]) pool[static_cast<std::size_t>(poolSize++)] = Card(static_cast<std::uint8_t>(i));

    const bool useRange = rangeTop < 1.0;
    // Building the table runs estimateEquity itself without a range, so only touch it here.
    const PreflopTable* tbl = useRange ? &table() : nullptr;

    std::array<Card, 7> cards{};
    const auto boardSize = static_cast<int>(board.size());
    std::copy(board.begin(), board.end(), cards.begin());
    double total = 0;

    for (int it = 0; it < iterations; ++it) {
        int k = 0;  // pool[0, k) is drawn; partial Fisher-Yates
        auto draw = [&]() {
            const int j = k + static_cast<int>(rng.below(static_cast<std::uint64_t>(poolSize - k)));
            std::swap(pool[static_cast<std::size_t>(k)], pool[static_cast<std::size_t>(j)]);
            return pool[static_cast<std::size_t>(k++)];
        };

        std::array<std::array<Card, 2>, 9> opp{};
        for (int o = 0; o < opponents; ++o) {
            for (int attempt = 0;; ++attempt) {
                const Card a = draw(), b = draw();
                opp[static_cast<std::size_t>(o)] = {a, b};
                if (!useRange || attempt >= 30 ||
                    tbl->percentile[static_cast<std::size_t>(classIndex(a, b))] <= rangeTop)
                    break;
                k -= 2;  // put them back; they stay uniformly available
            }
        }
        for (int i = boardSize; i < 5; ++i) cards[static_cast<std::size_t>(i)] = draw();

        cards[5] = hole[0];
        cards[6] = hole[1];
        const HandValue mine = evaluate(cards);
        bool lost = false;
        int tied = 1;
        for (int o = 0; o < opponents && !lost; ++o) {
            cards[5] = opp[static_cast<std::size_t>(o)][0];
            cards[6] = opp[static_cast<std::size_t>(o)][1];
            const HandValue theirs = evaluate(cards);
            if (theirs > mine) lost = true;
            else if (theirs == mine) ++tied;
        }
        if (!lost) total += 1.0 / tied;
    }
    return total / iterations;
}

}  // namespace poker::ai
