#pragma once

#include <memory>
#include <string>
#include <vector>

#include "poker/hand.hpp"
#include "poker/rng.hpp"

namespace poker {

struct BlindLevel {
    Chips smallBlind = 10;
    Chips bigBlind = 20;
    Chips ante = 0;  // big-blind ante
};

struct TournamentConfig {
    std::string name;
    int numSeats = 6;
    Chips startingStack = 2000;
    std::vector<BlindLevel> levels;  // the last level repeats forever
    int handsPerLevel = 6;
    // 0: classic knockout, play until one player has every chip.
    // N: "fixed hands" format (like a mahjong hanchan): stop after N hands and rank
    //    the survivors by chips. Use a multiple of numSeats so everyone gets the
    //    button equally often.
    int maxHands = 0;
};

// Presets. Numbers are tuned with tools/sim; see docs/04-rules-engine-spec.md.
TournamentConfig quickFixedHandsConfig();     // ranked "quick": 18 hands
TournamentConfig standardFixedHandsConfig();  // ranked "standard": 30 hands
TournamentConfig classicKnockoutConfig();     // classic 6-max sit & go

struct Standing {
    int seat = -1;
    int place = 0;    // 1 = first
    int placeTo = 0;  // == place unless tied; tied seats share places [place, placeTo]
    Chips chips = 0;
    int bustHand = -1;  // hand number the seat was eliminated in, -1 if it survived
};

// A single table tournament: drives hands, moves the button, raises blinds,
// eliminates players and ranks them.
//
//   Tournament t(cfg, rng);
//   while (!t.finished()) {
//       Hand& h = t.startHand();
//       while (!h.complete()) h.act(decide(h.view(h.toAct())));
//       t.finishHand();
//   }
//   auto ranking = t.standings();
class Tournament {
public:
    // `rng` must outlive the tournament. Servers pass a CSPRNG.
    Tournament(TournamentConfig config, Rng& rng);

    bool finished() const { return finished_; }
    Hand& startHand();
    Hand* currentHand() { return hand_.get(); }
    void finishHand();

    const TournamentConfig& config() const { return config_; }
    int handsPlayed() const { return handsPlayed_; }
    int levelIndex() const;
    const BlindLevel& level() const;
    int button() const { return button_; }
    const std::vector<Chips>& stacks() const { return stacks_; }
    int playersLeft() const;

    // Final ranking once finished(); a provisional one (by chips) before that.
    std::vector<Standing> standings() const;

private:
    TournamentConfig config_;
    Rng& rng_;
    std::vector<Chips> stacks_;
    std::vector<int> bustHand_;
    std::vector<Chips> bustStartStack_;  // stack at the start of the hand they busted in
    std::unique_ptr<Hand> hand_;
    std::vector<Chips> handStartStacks_;
    int button_ = -1;
    int handsPlayed_ = 0;
    bool finished_ = false;
};

}  // namespace poker
