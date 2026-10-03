#pragma once

#include <memory>
#include <string>
#include <vector>

#include "poker/hand.hpp"
#include "poker/rng.hpp"

namespace poker::ai {

enum class Difficulty { Easy, Normal, Hard };

// Play style knobs, all in [0, 1]. In the single-player mode every character
// plays with its own personality, so the cast feels different at the table.
struct Personality {
    std::string name;
    double looseness = 0.5;   // how many hands it plays / how light it calls
    double aggression = 0.5;  // raise vs call, bet vs check
    double bluff = 0.1;       // how often it bets without a hand
};

// Sample styles for the MVP (placeholders until the cast is designed).
const std::vector<Personality>& personalityPresets();

// A bot only ever sees a PlayerView: the same information a human in that seat has.
class Bot {
public:
    virtual ~Bot() = default;
    virtual Action decide(const PlayerView& view, Rng& rng) = 0;
};

std::unique_ptr<Bot> makeBot(Difficulty difficulty, const Personality& personality);

const char* difficultyNameZh(Difficulty d);

}  // namespace poker::ai
