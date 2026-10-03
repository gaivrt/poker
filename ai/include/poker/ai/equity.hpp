#pragma once

#include <array>
#include <vector>

#include "poker/card.hpp"
#include "poker/rng.hpp"

namespace poker::ai {

// Monte Carlo share of the pot `hole` wins at showdown against `opponents` unknown hands
// (ties count fractionally). `rangeTop` in (0, 1] limits each opponent to the strongest
// fraction of starting hands, e.g. 0.2 = "top 20%"; 1.0 = any two cards.
double estimateEquity(const std::array<Card, 2>& hole, const std::vector<Card>& board, int opponents,
                      int iterations, Rng& rng, double rangeTop = 1.0);

// Heads-up all-in equity of a starting hand against one random hand (precomputed table).
double preflopEquity(Card a, Card b);
// Where a starting hand ranks among all 1326 combos: 0 = best (AA), 1 = worst (72o).
double preflopPercentile(Card a, Card b);

}  // namespace poker::ai
