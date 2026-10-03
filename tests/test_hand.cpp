#include <numeric>

#include "poker/hand.hpp"
#include "test.hpp"

using namespace poker;

namespace {

// Builds a deck that deals `holes` (one "Xx Yy" string per dealt seat, in deal order:
// starting left of the button) and then `board` (up to 5 cards). Burn cards are
// filled with unused cards.
Deck rig(const std::vector<std::string>& holes, const std::string& board) {
    std::vector<std::vector<Card>> h;
    std::vector<bool> used(52, false);
    for (const auto& s : holes) {
        h.push_back(parseCards(s));
        for (Card c : h.back()) used[c.id] = true;
    }
    const auto b = parseCards(board);
    for (Card c : b) used[c.id] = true;
    int filler = 0;
    auto burn = [&]() {
        while (used[static_cast<std::size_t>(filler)]) ++filler;
        used[static_cast<std::size_t>(filler)] = true;
        return Card(static_cast<std::uint8_t>(filler));
    };
    std::vector<Card> top;
    for (int round = 0; round < 2; ++round)
        for (const auto& cards : h) top.push_back(cards[static_cast<std::size_t>(round)]);
    std::size_t bi = 0;
    for (int street = 0; street < 3 && bi < b.size(); ++street) {
        top.push_back(burn());
        const std::size_t n = street == 0 ? 3 : 1;
        for (std::size_t k = 0; k < n && bi < b.size(); ++k) top.push_back(b[bi++]);
    }
    return Deck::stacked(top);
}

HandConfig cfg(std::vector<Chips> stacks, int button, Chips sb = 10, Chips bb = 20, Chips ante = 0) {
    HandConfig c;
    c.stacks = std::move(stacks);
    c.button = button;
    c.smallBlind = sb;
    c.bigBlind = bb;
    c.ante = ante;
    return c;
}

Chips sum(const std::vector<Chips>& v) { return std::accumulate(v.begin(), v.end(), Chips{0}); }

void must(Hand& h, Action a) {
    std::string err;
    if (!h.act(a, &err)) throw t::Failure{"illegal action: " + err};
}

}  // namespace

TEST(hand_blinds_and_order_three_handed) {
    Hand h(cfg({1000, 1000, 1000}, 0), Deck());
    CHECK_EQ(h.smallBlindSeat(), 1);
    CHECK_EQ(h.bigBlindSeat(), 2);
    CHECK_EQ(h.toAct(), 0);  // button is "UTG" three-handed
    CHECK_EQ(h.pot(), 30);
    must(h, Action::call());
    must(h, Action::call());
    CHECK_EQ(h.toAct(), 2);  // big blind option
    CHECK(h.legal().canCheck);
    CHECK(h.legal().canRaise);
    must(h, Action::check());
    CHECK(h.street() == Street::Flop);
    CHECK_EQ(h.toAct(), 1);  // first seat left of the button
}

TEST(hand_heads_up_button_is_small_blind) {
    Hand h(cfg({1000, 1000}, 1), Deck());
    CHECK_EQ(h.smallBlindSeat(), 1);
    CHECK_EQ(h.bigBlindSeat(), 0);
    CHECK_EQ(h.toAct(), 1);  // button acts first preflop
    must(h, Action::call());
    must(h, Action::check());
    CHECK(h.street() == Street::Flop);
    CHECK_EQ(h.toAct(), 0);  // and last after the flop
}

TEST(hand_fold_to_big_blind_returns_uncalled) {
    Hand h(cfg({1000, 1000, 1000}, 0), Deck());
    must(h, Action::fold());
    must(h, Action::fold());
    CHECK(h.complete());
    CHECK(!h.wentToShowdown());
    const auto st = h.finalStacks();
    CHECK_EQ(st[0], 1000);
    CHECK_EQ(st[1], 990);
    CHECK_EQ(st[2], 1010);
}

TEST(hand_min_raise_sizes) {
    Hand h(cfg({1000, 1000, 1000, 1000}, 0), Deck());  // UTG = seat 3
    auto la = h.legal();
    CHECK(la.canRaise);
    CHECK_EQ(la.minTo, 40);
    CHECK_EQ(la.maxTo, 1000);
    std::string err;
    CHECK(!h.act(Action::raise(39), &err));
    must(h, Action::raise(60));  // raise of 40
    la = h.legal();
    CHECK_EQ(la.minTo, 100);  // 60 + 40
    CHECK_EQ(la.toCall, 60);
    CHECK(!h.act(Action::check(), &err));
    CHECK(!h.act(Action::raise(1001), &err));
}

TEST(hand_short_all_in_does_not_reopen) {
    // Button 0 (150 chips), SB 1, BB 2, UTG 3.
    Hand h(cfg({150, 1000, 1000, 1000}, 0), Deck());
    CHECK_EQ(h.toAct(), 3);
    must(h, Action::raise(100));  // full raise of 80
    must(h, Action::raise(150));  // all-in: only +50, not a full raise
    CHECK_EQ(h.toAct(), 1);
    auto la = h.legal();
    CHECK(la.canRaise);         // SB has not acted yet: may raise
    CHECK_EQ(la.minTo, 230);   // 150 + last full raise 80
    must(h, Action::fold());
    must(h, Action::fold());
    CHECK_EQ(h.toAct(), 3);
    la = h.legal();
    CHECK(!la.canRaise);  // faced only +50 since acting: call or fold
    CHECK(la.canCall);
    CHECK_EQ(la.toCall, 50);
}

TEST(hand_cumulative_short_all_ins_reopen) {
    // 6 seats, button 0; UTG = 3 raises to 100, seats 4 and 5 shove short.
    for (const Chips seat5 : {Chips{190}, Chips{170}}) {
        Hand h(cfg({1000, 1000, 1000, 1000, 140, seat5}, 0), Deck());
        must(h, Action::raise(100));
        must(h, Action::raise(140));
        must(h, Action::raise(seat5));
        must(h, Action::call());  // button calls, so someone could still face a re-raise
        must(h, Action::fold());
        must(h, Action::fold());
        CHECK_EQ(h.toAct(), 3);
        const auto la = h.legal();
        if (seat5 == 190) {
            CHECK(la.canRaise);  // +90 since acting >= full raise of 80
            CHECK_EQ(la.minTo, 270);
        } else {
            CHECK(!la.canRaise);  // +70 < 80
        }
    }
}

TEST(hand_side_pots_at_showdown) {
    // Button 0. Deal order: 1, 2, 0. Seat 0 has the nuts but the smallest stack.
    // Board: Ah Kh 7c 2d 9s
    Deck d = rig({"Qs Qd", "Jc Jd", "As Ad"}, "Ah Kh 7c 2d 9s");
    Hand h(cfg({100, 300, 500}, 0), d);
    CHECK_EQ(h.toAct(), 0);
    must(h, Action::raise(100));  // seat 0 all-in
    must(h, Action::raise(300));  // seat 1 all-in
    must(h, Action::call());      // seat 2 calls 300 (280 more)
    CHECK(h.complete());
    CHECK(h.wentToShowdown());
    const auto st = h.finalStacks();
    CHECK_EQ(st[0], 300);  // main pot 100 x 3
    CHECK_EQ(st[1], 400);  // side pot 200 x 2 (QQ beats JJ)
    CHECK_EQ(st[2], 200);
    CHECK_EQ(sum(st), 900);
    // All hands were turned up before the runout.
    bool runout = false;
    for (const auto& e : h.events()) runout |= e.type == EventType::AllInRunout;
    CHECK(runout);
}

TEST(hand_uncalled_part_of_shove_returned) {
    Deck d = rig({"2c 7d", "3c 8d", "As Ad"}, "Kh Qh 4c 5d 9s");
    Hand h(cfg({1000, 1000, 300}, 2), d);  // button 2, SB 0, BB 1, first to act: 2
    must(h, Action::raise(300));  // seat 2 all-in for 300
    must(h, Action::raise(1000)); // seat 0 shoves 1000
    must(h, Action::fold());      // seat 1 folds
    CHECK(h.complete());
    const auto st = h.finalStacks();
    // Seat 0 gets 700 back; seat 2 wins 300 + 300 + 20 (BB).
    CHECK_EQ(st[2], 620);
    CHECK_EQ(st[0], 700);
    CHECK_EQ(st[1], 980);
}

TEST(hand_big_blind_ante_is_dead_money) {
    Hand h(cfg({1000, 1000, 1000}, 0, 10, 20, 20), Deck());
    CHECK_EQ(h.pot(), 50);
    CHECK_EQ(h.seat(2).stack, 960);
    must(h, Action::fold());
    must(h, Action::fold());
    const auto st = h.finalStacks();
    CHECK_EQ(st[2], 1010);  // the ante was the big blind's own money: net gain is the small blind
    CHECK_EQ(sum(st), 3000);
}

TEST(hand_short_big_blind_pays_blind_before_ante) {
    // BB has 25: posts 20 blind, 5 ante. Others still must call the full 20.
    Hand h(cfg({1000, 1000, 25}, 0, 10, 20, 20), Deck());
    CHECK(h.seat(2).allIn);
    CHECK_EQ(h.seat(2).street, 20);
    CHECK_EQ(h.pot(), 35);
    CHECK_EQ(h.legal().toCall, 20);
}

TEST(hand_everyone_all_in_from_blinds_runs_out) {
    Hand h(cfg({5, 15}, 0), Deck());  // heads-up, both all-in posting blinds
    CHECK(h.complete());
    CHECK_EQ(h.board().size(), 5u);
    CHECK_EQ(sum(h.finalStacks()), 20);
}

TEST(hand_board_plays_split_with_odd_chip) {
    // Board is a royal flush: everyone splits. 3 x 25 + ante 0 = 75 doesn't divide... use blinds 5/10.
    Deck d = rig({"2c 3d", "2d 3c", "2h 3s"}, "As Ks Qs Js Ts");
    Hand h(cfg({1000, 1000, 1000}, 0, 5, 10, 1), Deck(d));
    must(h, Action::call());
    must(h, Action::call());
    must(h, Action::check());
    for (int street = 0; street < 3; ++street)
        for (int k = 0; k < 3; ++k) must(h, Action::check());
    CHECK(h.complete());
    const auto st = h.finalStacks();
    // Pot = 30 + 1 ante = 31: 11 to seat 1 (first left of button), 10 to the others.
    CHECK_EQ(st[1], 1000 - 10 + 11);
    CHECK_EQ(st[2], 1000 - 10 - 1 + 10);
    CHECK_EQ(st[0], 1000 - 10 + 10);
}

TEST(hand_view_hides_other_hole_cards) {
    Hand h(cfg({1000, 1000, 1000}, 0), Deck());
    const auto v = h.view(1);
    int holeEvents = 0;
    for (const auto& e : v.history)
        if (e.type == EventType::DealHole) {
            ++holeEvents;
            CHECK_EQ(e.seat, 1);
        }
    CHECK_EQ(holeEvents, 1);
}

// Random legal play: chips are conserved and every hand terminates.
TEST(hand_fuzz_random_play) {
    Xoshiro256 rng(7);
    for (int it = 0; it < 20000; ++it) {
        const int n = 2 + static_cast<int>(rng.below(5));
        std::vector<Chips> stacks(static_cast<std::size_t>(n));
        for (auto& s : stacks) s = rng.below(4) == 0 ? 0 : 1 + static_cast<Chips>(rng.below(400));
        if (std::count_if(stacks.begin(), stacks.end(), [](Chips c) { return c > 0; }) < 2) continue;
        int button = static_cast<int>(rng.below(static_cast<std::uint64_t>(n)));
        while (stacks[static_cast<std::size_t>(button)] == 0) button = (button + 1) % n;
        Deck d;
        d.shuffle(rng);
        Hand h(cfg(stacks, button, 5, 10, rng.below(2) ? 10 : 0), d);
        int steps = 0;
        while (!h.complete()) {
            CHECK(++steps < 200);
            const auto la = h.legal();
            std::vector<Action> options;
            if (la.canFold) options.push_back(Action::fold());
            if (la.canCheck) options.push_back(Action::check());
            if (la.canCall) options.push_back(Action::call());
            if (la.canBet || la.canRaise) {
                const Chips span = la.maxTo - la.minTo;
                const Chips to = la.minTo + (span > 0 ? static_cast<Chips>(rng.below(static_cast<std::uint64_t>(span) + 1)) : 0);
                options.push_back(la.canBet ? Action::bet(to) : Action::raise(to));
                options.push_back(la.canBet ? Action::bet(la.maxTo) : Action::raise(la.maxTo));
            }
            CHECK(!options.empty());
            must(h, options[rng.below(options.size())]);
        }
        const auto st = h.finalStacks();
        CHECK_EQ(sum(st), sum(stacks));
        for (Chips c : st) CHECK(c >= 0);
        Chips won = 0;
        for (const auto& e : h.events())
            if (e.type == EventType::WinPot) won += e.amount;
        CHECK_EQ(won, sum(h.winnings()));
    }
}
