#include <numeric>

#include "poker/ai/bot.hpp"
#include "poker/tournament.hpp"
#include "test.hpp"

using namespace poker;

namespace {
// Plays a whole tournament with random legal actions.
void playRandom(Tournament& t, Rng& rng) {
    while (!t.finished()) {
        Hand& h = t.startHand();
        while (!h.complete()) {
            const auto la = h.legal();
            const auto roll = rng.below(10);
            if ((la.canBet || la.canRaise) && roll < 2) h.act(la.canBet ? Action::bet(la.maxTo) : Action::raise(la.maxTo));
            else if (la.canFold && roll < 5) h.act(Action::fold());
            else h.act(la.canCheck ? Action::check() : Action::call());
        }
        t.finishHand();
    }
}
}  // namespace

TEST(tournament_knockout_runs_to_one_winner) {
    Xoshiro256 rng(1);
    for (int i = 0; i < 200; ++i) {
        Tournament t(classicKnockoutConfig(), rng);
        playRandom(t, rng);
        CHECK_EQ(t.playersLeft(), 1);
        const auto st = t.standings();
        CHECK_EQ(st[0].place, 1);
        CHECK_EQ(st[0].chips, 6 * t.config().startingStack);
        Chips total = 0;
        for (const auto& s : st) total += s.chips;
        CHECK_EQ(total, 6 * t.config().startingStack);
        for (std::size_t k = 1; k < st.size(); ++k) CHECK(st[k].place >= st[k - 1].place);
    }
}

TEST(tournament_fixed_hands_stops_and_ranks_by_chips) {
    Xoshiro256 rng(2);
    for (int i = 0; i < 200; ++i) {
        Tournament t(quickFixedHandsConfig(), rng);
        playRandom(t, rng);
        CHECK(t.handsPlayed() <= 18);
        const auto st = t.standings();
        for (std::size_t k = 1; k < st.size(); ++k) {
            CHECK(st[k].place >= st[k - 1].place);
            // Survivors are ordered by chips.
            if (st[k].bustHand < 0) CHECK(st[k].chips <= st[k - 1].chips);
            // Busted players always rank below survivors.
            if (st[k - 1].bustHand >= 0) CHECK(st[k].bustHand >= 0);
        }
    }
}

TEST(tournament_blinds_rise_and_button_moves) {
    Xoshiro256 rng(3);
    auto cfg = standardFixedHandsConfig();
    Tournament t(cfg, rng);
    int lastButton = -1;
    for (int i = 0; i < 13 && !t.finished(); ++i) {
        Hand& h = t.startHand();
        CHECK(h.button() != lastButton);
        lastButton = h.button();
        CHECK_EQ(h.config().bigBlind, cfg.levels[static_cast<std::size_t>(i / cfg.handsPerLevel)].bigBlind);
        while (!h.complete()) h.act(h.legal().canCheck ? Action::check() : Action::call());
        t.finishHand();
    }
}

TEST(tournament_same_hand_busts_ranked_by_starting_stack) {
    // Heads-up into 3 players: force two players out in one hand by rigging stacks.
    Xoshiro256 rng(11);
    TournamentConfig c;
    c.numSeats = 3;
    c.startingStack = 100;
    c.levels = {{50, 100, 0}};
    c.handsPerLevel = 100;
    for (int attempt = 0; attempt < 500; ++attempt) {
        Tournament t(c, rng);
        Hand& h = t.startHand();
        // Everyone is all-in from the blinds or calls all-in.
        while (!h.complete()) h.act(h.legal().canCall ? Action::call() : Action::check());
        t.finishHand();
        if (t.playersLeft() == 1) {
            const auto st = t.standings();
            CHECK_EQ(st[0].place, 1);
            // Both busted in hand 0 with equal starting stacks: they tie for 2nd.
            CHECK_EQ(st[1].place, 2);
            CHECK_EQ(st[1].placeTo, 3);
            CHECK_EQ(st[2].place, 2);
            return;
        }
    }
    CHECK(false);  // never produced a double bust
}
