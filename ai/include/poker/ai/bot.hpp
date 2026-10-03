#pragma once

#include <memory>
#include <string>
#include <vector>

#include "poker/hand.hpp"
#include "poker/rng.hpp"
#include "poker/talk.hpp"

namespace poker::ai {

enum class Difficulty { Easy, Normal, Hard };

// Play style knobs, all in [0, 1]. In the single-player mode every character
// plays with its own personality, so the cast feels different at the table.
struct Personality {
    int id = 0;  // index into personalityPresets(); also selects the mind profile (mind.hpp)
    std::string name;
    double looseness = 0.5;   // how many hands it plays / how light it calls
    double aggression = 0.5;  // raise vs call, bet vs check
    double bluff = 0.1;       // how often it bets without a hand
};

// Sample styles for the MVP (placeholders until the cast is designed).
const std::vector<Personality>& personalityPresets();

// Public table talk a bot can take into account: the features (signals and
// thinking-time tells) each seat has shown so far in the current hand.
struct TalkView {
    std::vector<std::vector<int>> features;  // per seat
};

// Signals a bot gives, plus which of its tells they were (for the tell collection).
struct Talk {
    std::vector<Signal> signals;
    std::vector<int> tells;
};

// What a bot does before acting: how long it thinks and what it lets slip meanwhile.
struct Plan {
    int thinkMs = 1000;
    Talk talk;
    bool fastTell = false;  // its thinking time this decision is one of its tells
    bool slowTell = false;
    int timingTell = -1;    // tell id when the timing is a tell
};

// A bot only ever sees a PlayerView (and public talk): the same information a human
// in that seat has.
class Bot {
public:
    virtual ~Bot() = default;
    virtual Action decide(const PlayerView& view, Rng& rng) = 0;

    // --- mind games (defaults: a silent bot that ignores talk) ---
    virtual Plan plan(const PlayerView& view, Rng& rng) {
        (void)view, (void)rng;
        return {};
    }
    virtual Action decideTalk(const PlayerView& view, const TalkView& talk, Rng& rng) {
        (void)talk;
        return decide(view, rng);
    }
    // Lines after its own action (taunt after a bet, ...).
    virtual Talk afterAction(const PlayerView& view, const Action& action, Rng& rng) {
        (void)view, (void)action, (void)rng;
        return {};
    }
    // A reply when someone speaks to it.
    virtual Talk respond(const Signal& said, const PlayerView& view, Rng& rng) {
        (void)said, (void)view, (void)rng;
        return {};
    }
    // A hand of `seat` was revealed: learn how its signals relate to its strength.
    virtual void learn(int seat, const std::vector<int>& features, Strength s) { (void)seat, (void)features, (void)s; }
    // End of hand: may tilt (returns the expression it shows, if any).
    virtual Talk afterHand(Chips before, Chips after, bool provoked, Rng& rng) {
        (void)before, (void)after, (void)provoked, (void)rng;
        return {};
    }
    // After winning uncontested: show the hand? (Bluffers like to.)
    virtual bool wantsToShow(const PlayerView& view, Rng& rng) {
        (void)view, (void)rng;
        return false;
    }
};

std::unique_ptr<Bot> makeBot(Difficulty difficulty, const Personality& personality);

const char* difficultyNameZh(Difficulty d);

}  // namespace poker::ai
