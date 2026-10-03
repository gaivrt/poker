#include "poker/app/session.hpp"
#include "test.hpp"

using namespace poker;
using namespace poker::app;

namespace {
bool contains(const std::string& s, const char* needle) { return s.find(needle) != std::string::npos; }
}  // namespace

// Drive whole games the way the web client does: the human always calls or checks.
TEST(session_plays_full_games) {
    for (const char* format : {"quick", "standard", "classic"}) {
        Session s(format, 1, 123);
        int hands = 0;
        std::string all;
        s.startHand();
        while (!s.finished()) {
            all += s.drainEvents();
            if (s.isHumanTurn()) {
                const std::string la = s.legal();
                CHECK(s.humanAct(contains(la, "\"canCheck\":true") ? "check" : "call", 0, 3000));
            } else if (s.handRunning()) {
                CHECK(s.stepBot());
            } else {
                s.finishHand();
                ++hands;
                if (!s.finished()) s.startHand();
            }
            CHECK(hands < 500);
        }
        all += s.drainEvents();
        CHECK(contains(all, "\"t\":\"handStart\""));
        CHECK(contains(all, "\"t\":\"tournamentEnd\""));
        CHECK(contains(all, "\"t\":\"finalHands\""));
        // The human only ever sees their own hole cards.
        std::size_t pos = 0;
        while ((pos = all.find("\"t\":\"hole\"", pos)) != std::string::npos) {
            CHECK(all.compare(pos + 10, 9, ",\"seat\":0") == 0);
            ++pos;
        }
    }
}

TEST(session_rejects_out_of_turn_and_bad_actions) {
    Session s("quick", 0, 5);
    s.startHand();
    while (s.handRunning() && !s.isHumanTurn()) s.stepBot();
    if (s.isHumanTurn()) {
        CHECK(!s.humanAct("raise", 1, 1000));   // below the minimum
        CHECK(!s.humanAct("dance", 0, 1000));   // unknown action
    } else {
        CHECK(!s.humanAct("fold", 0, 1000));    // hand ended before our turn
    }
}

TEST(session_runout_equity) {
    Xoshiro256 rng(1);
    // AA vs KK preflop: about 82% / 18%.
    auto eq = runoutEquity({{parseCards("As Ah")[0], parseCards("As Ah")[1]}, {parseCards("Ks Kh")[0], parseCards("Ks Kh")[1]}},
                           {}, rng);
    CHECK(eq[0] > 0.79 && eq[0] < 0.85);
    // On the turn the result is exact: KK needs one of two kings.
    const auto board = parseCards("2c 7d 9h Js");
    eq = runoutEquity({{parseCards("As")[0], parseCards("Ah")[0]}, {parseCards("Ks")[0], parseCards("Kh")[0]}}, board, rng);
    CHECK(std::abs(eq[1] - 2.0 / 44.0) < 1e-9);
}

TEST(session_best_five) {
    const auto five = bestFive(parseCards("As Ks Qs Js Ts 2c 3d"));
    CHECK_EQ(five.size(), 5u);
    for (Card c : five) CHECK(c.suit() == Suit::Spades);
}
