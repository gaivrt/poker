#include <cmath>

#include "poker/ai/bot.hpp"
#include "poker/ai/equity.hpp"
#include "poker/tournament.hpp"
#include "test.hpp"

using namespace poker;
using namespace poker::ai;

namespace {
std::array<Card, 2> hole(const char* s) {
    const auto c = parseCards(s);
    return {c[0], c[1]};
}
}  // namespace

TEST(ai_equity_known_matchups) {
    Xoshiro256 rng(5);
    // AA vs one random hand is ~85%.
    const double aa = estimateEquity(hole("As Ah"), {}, 1, 20000, rng);
    CHECK(std::abs(aa - 0.852) < 0.015);
    // 72o vs one random hand is ~35%.
    const double trash = estimateEquity(hole("7c 2d"), {}, 1, 20000, rng);
    CHECK(std::abs(trash - 0.35) < 0.02);
    // Made nut flush on the river vs anything: always wins or ties.
    const auto board = parseCards("Kh Qh 2h 7c 9d");
    CHECK(estimateEquity(hole("Ah 3h"), board, 3, 2000, rng) > 0.99);
}

TEST(ai_preflop_table_ordering) {
    const auto aa = parseCards("As Ah");
    const auto kk = parseCards("Ks Kh");
    const auto ako = parseCards("As Kd");
    const auto sevenTwo = parseCards("7s 2d");
    CHECK(preflopPercentile(aa[0], aa[1]) < 0.01);
    CHECK(preflopPercentile(aa[0], aa[1]) < preflopPercentile(kk[0], kk[1]));
    CHECK(preflopPercentile(ako[0], ako[1]) < 0.1);
    CHECK(preflopPercentile(sevenTwo[0], sevenTwo[1]) > 0.9);
}

TEST(ai_bots_only_make_legal_moves) {
    Xoshiro256 rng(9);
    for (const auto diff : {Difficulty::Easy, Difficulty::Normal, Difficulty::Hard}) {
        std::vector<std::unique_ptr<Bot>> bots;
        for (const auto& p : personalityPresets()) bots.push_back(makeBot(diff, p));
        for (int game = 0; game < 3; ++game) {
            Tournament t(classicKnockoutConfig(), rng);
            while (!t.finished()) {
                Hand& h = t.startHand();
                while (!h.complete()) {
                    const int s = h.toAct();
                    std::string err;
                    const Action a = bots[static_cast<std::size_t>(s)]->decide(h.view(s), rng);
                    if (!h.act(a, &err)) throw t::Failure{std::string("bot made illegal move: ") + err};
                }
                t.finishHand();
            }
        }
    }
}
