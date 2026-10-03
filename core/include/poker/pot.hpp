#pragma once

#include <vector>

#include "poker/card.hpp"
#include "poker/hand_eval.hpp"

namespace poker {

struct Pot {
    Chips amount = 0;
    std::vector<int> eligible;  // seats that can win this pot, ascending
};

// Splits the chips everyone put in this hand into a main pot and side pots.
//
// contributed[s]: total chips seat s put in this hand (blinds, calls, raises; antes excluded).
// folded[s]:      seat s folded; its chips stay in the pots but it cannot win any.
// deadMoney:      chips owned by no seat's stake (the big-blind ante); added to the main pot.
//
// Seats that never entered the hand pass contributed = 0, folded = true.
// Adjacent pots with the same eligible set are merged.
std::vector<Pot> buildPots(const std::vector<Chips>& contributed, const std::vector<bool>& folded,
                           Chips deadMoney);

struct PotResult {
    Chips amount = 0;
    std::vector<int> winners;
    HandValue best;
};

// Awards each pot to the best hand(s) among its eligible seats.
// Split pots divide evenly; odd chips go one at a time to the winners closest to the
// left of the button (clockwise from button + 1).
// values[s] is only read for eligible seats. Returns the chips won per seat.
std::vector<Chips> awardPots(const std::vector<Pot>& pots, const std::vector<HandValue>& values, int button,
                             std::vector<PotResult>* results = nullptr);

}  // namespace poker
