#pragma once

#include <array>
#include <vector>

#include "poker/card.hpp"
#include "poker/talk.hpp"

namespace poker::ai {

// The mind-game side of a character: how it talks, which tells it has, how long it
// thinks, and how it reads other players. See docs/06-mind-games.md.

// A tell: a signal the character tends to give with a strong (or a weak) hand.
struct Tell {
    int id;              // unique across the cast; the client keeps a "tells found" collection
    int feature;         // featureOf(...) or kFeatureFastBet / kFeatureSlowBet
    double pStrong;      // chance to show it with a strong hand
    double pWeak;        // chance to show it with a weak hand (bluffing or giving up)
    const char* textZh;  // the tell in words, revealed once the player has caught it
    bool meansStrong() const { return pStrong > pWeak; }
};

struct MindProfile {
    double talk;          // chance to say something when acting
    double honesty;       // +1 its lines match its hand, -1 reversed, 0 unrelated
    double reactiveness;  // how much other players' signals sway its decisions
    double priorWeight;   // strength of its face-value beliefs; high = slow to learn
    bool contrarian;      // reads signals backwards until evidence says otherwise
    double tiltProne;     // chance to tilt after a big loss
    double showBluff;     // chance to show a bluff after winning uncontested
    int thinkMs;          // typical time per decision
    double sizing;        // +1 bets bigger with strong hands, -1 bigger with bluffs, 0 balanced
    std::vector<Tell> tells;
};

const MindProfile& mindProfile(int personalityId);
const Tell* findTell(int id);

// Face-value reading of a feature: probability the player giving it is strong.
double naiveStrongProb(int feature);

// What one observer has learned about one opponent from hands it saw revealed.
class ReadModel {
public:
    void observe(const std::vector<int>& features, Strength s);
    // Probability the opponent is strong given the features it showed this hand.
    double belief(const std::vector<int>& features, double priorWeight, bool contrarian) const;
    double seen(int feature) const { return seen_[static_cast<std::size_t>(feature)]; }

private:
    std::array<double, kNumFeatures> strong_{};
    std::array<double, kNumFeatures> seen_{};
};

// How good a revealed hand is, for learning: relative to what the board gives everyone.
Strength classifyHand(const std::array<Card, 2>& hole, const std::vector<Card>& board);

}  // namespace poker::ai
