#include "poker/pot.hpp"
#include "test.hpp"

using namespace poker;

namespace {
HandValue hv(std::uint32_t raw) { return HandValue{raw}; }
}  // namespace

TEST(pots_single_main_pot) {
    auto pots = buildPots({100, 100, 100}, {false, false, false}, 0);
    CHECK_EQ(pots.size(), 1u);
    CHECK_EQ(pots[0].amount, 300);
    CHECK_EQ(pots[0].eligible.size(), 3u);
}

TEST(pots_side_pots_layered) {
    // A all-in 50, B all-in 120, C and D put in 200.
    auto pots = buildPots({50, 120, 200, 200}, {false, false, false, false}, 0);
    CHECK_EQ(pots.size(), 3u);
    CHECK_EQ(pots[0].amount, 200);  // 50 x 4
    CHECK_EQ(pots[0].eligible.size(), 4u);
    CHECK_EQ(pots[1].amount, 210);  // 70 x 3
    CHECK_EQ(pots[1].eligible.size(), 3u);
    CHECK_EQ(pots[2].amount, 160);  // 80 x 2
    CHECK_EQ(pots[2].eligible.size(), 2u);
}

TEST(pots_folded_money_stays_but_cannot_win) {
    // Seat 1 put in 150 then folded; seat 0 all-in 100, seat 2 put in 300.
    auto pots = buildPots({100, 150, 300}, {false, true, false}, 0);
    CHECK_EQ(pots.size(), 2u);
    CHECK_EQ(pots[0].amount, 300);  // 100 from each
    CHECK(pots[0].eligible == (std::vector<int>{0, 2}));
    CHECK_EQ(pots[1].amount, 250);  // 50 from seat 1 + 200 from seat 2
    CHECK(pots[1].eligible == (std::vector<int>{2}));
}

TEST(pots_dead_money_goes_to_main_pot) {
    auto pots = buildPots({20, 80, 80}, {false, false, false}, 20);
    CHECK_EQ(pots[0].amount, 80);  // 3 x 20 + 20 ante
    CHECK_EQ(pots[1].amount, 120);
}

TEST(pots_split_and_odd_chip) {
    // 3 seats, button = 2. Pot of 101 split between seats 0 and 1.
    std::vector<Pot> pots = {{101, {0, 1, 2}}};
    auto won = awardPots(pots, {hv(500), hv(500), hv(100)}, 2);
    CHECK_EQ(won[0], 51);  // seat 0 is first left of the button: gets the odd chip
    CHECK_EQ(won[1], 50);
    CHECK_EQ(won[2], 0);
    // Button = 0: seat 1 is first to the left now.
    won = awardPots(pots, {hv(500), hv(500), hv(100)}, 0);
    CHECK_EQ(won[1], 51);
    CHECK_EQ(won[0], 50);
}

TEST(pots_short_stack_wins_main_only) {
    auto pots = buildPots({50, 200, 200}, {false, false, false}, 0);
    auto won = awardPots(pots, {hv(900), hv(500), hv(400)}, 0);
    CHECK_EQ(won[0], 150);  // main pot only
    CHECK_EQ(won[1], 300);  // side pot
    CHECK_EQ(won[2], 0);
}
