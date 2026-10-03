// Bot-vs-bot simulator used to tune tournament formats and AI.
//
//   poker_sim [games-per-format] [seed]
//
// For each format it reports how long matches run and how much skill shows
// through (does the Hard AI outplace the Easy AI?).

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <map>
#include <memory>
#include <numeric>
#include <string>
#include <vector>

#include "poker/ai/bot.hpp"
#include "poker/ai/equity.hpp"
#include "poker/tournament.hpp"

using namespace poker;
using namespace poker::ai;

namespace {

// Example ranked points by place (1st..6th), like a mahjong "uma".
constexpr double kPoints[6] = {60, 30, 10, 0, -15, -30};

struct Seat {
    Difficulty diff;
    const Personality* personality;
};

struct GameResult {
    int hands = 0;
    std::vector<Standing> standings;
};

GameResult play(const TournamentConfig& cfg, const std::vector<Seat>& seats, Rng& rng) {
    std::vector<std::unique_ptr<Bot>> bots;
    for (const auto& s : seats) bots.push_back(makeBot(s.diff, *s.personality));
    Tournament t(cfg, rng);
    while (!t.finished()) {
        Hand& h = t.startHand();
        while (!h.complete()) {
            const int s = h.toAct();
            h.act(bots[static_cast<std::size_t>(s)]->decide(h.view(s), rng));
        }
        t.finishHand();
    }
    return {t.handsPlayed(), t.standings()};
}

double pointsFor(const Standing& st) {
    double sum = 0;
    for (int p = st.place; p <= st.placeTo; ++p) sum += kPoints[p - 1];
    return sum / (st.placeTo - st.place + 1);
}

struct Tally {
    int n = 0;
    double place = 0, points = 0, firsts = 0;
    void add(const Standing& st) {
        ++n;
        place += (st.place + st.placeTo) / 2.0;
        points += pointsFor(st);
        if (st.place == 1) firsts += 1.0 / (st.placeTo - st.place + 1);
    }
};

void runFormat(const TournamentConfig& cfg, int games, Rng& rng) {
    std::printf("\n## %s\n\n", cfg.name.c_str());
    const auto& presets = personalityPresets();

    // A) Match length with six Normal bots of different personalities.
    std::vector<int> hands;
    std::map<std::string, Tally> byStyle;
    int busts = 0;
    const auto t0 = std::chrono::steady_clock::now();
    for (int g = 0; g < games; ++g) {
        std::vector<Seat> seats;
        for (int s = 0; s < 6; ++s) seats.push_back({Difficulty::Normal, &presets[static_cast<std::size_t>((s + g) % 6)]});
        const auto r = play(cfg, seats, rng);
        hands.push_back(r.hands);
        for (const auto& st : r.standings) {
            byStyle[seats[static_cast<std::size_t>(st.seat)].personality->name].add(st);
            busts += st.bustHand >= 0 ? 1 : 0;
        }
    }
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    std::sort(hands.begin(), hands.end());
    const double avg = std::accumulate(hands.begin(), hands.end(), 0.0) / games;
    std::printf("对局长度 (6 个普通 AI, %d 局): 平均 %.1f 手, 中位 %d, P90 %d, 最长 %d; 平均每局淘汰 %.2f 人; 模拟耗时 %.1f ms/局\n\n",
                games, avg, hands[hands.size() / 2], hands[hands.size() * 9 / 10], hands.back(),
                static_cast<double>(busts) / games, ms / games);
    std::printf("| 风格 (普通难度) | 平均名次 | 平均段位分 | 一位率 |\n|---|---|---|---|\n");
    for (const auto& [name, t] : byStyle)
        std::printf("| %s | %.2f | %+.1f | %.1f%% |\n", name.c_str(), t.place / t.n, t.points / t.n, 100.0 * t.firsts / t.n);

    // B) Skill expression: 2 Hard + 2 Normal + 2 Easy, seats and styles shuffled each game.
    std::map<Difficulty, Tally> byDiff;
    for (int g = 0; g < games; ++g) {
        std::vector<Seat> seats = {{Difficulty::Hard, nullptr},   {Difficulty::Hard, nullptr},
                                   {Difficulty::Normal, nullptr}, {Difficulty::Normal, nullptr},
                                   {Difficulty::Easy, nullptr},   {Difficulty::Easy, nullptr}};
        for (int i = 5; i > 0; --i) std::swap(seats[static_cast<std::size_t>(i)], seats[rng.below(static_cast<std::uint64_t>(i) + 1)]);
        for (auto& s : seats) s.personality = &presets[rng.below(presets.size())];
        const auto r = play(cfg, seats, rng);
        for (const auto& st : r.standings) byDiff[seats[static_cast<std::size_t>(st.seat)].diff].add(st);
    }
    std::printf("\n| 难度 (2困难+2普通+2简单混战) | 平均名次 | 平均段位分 | 一位率 |\n|---|---|---|---|\n");
    for (const auto d : {Difficulty::Hard, Difficulty::Normal, Difficulty::Easy}) {
        const auto& t = byDiff[d];
        std::printf("| %s | %.2f | %+.1f | %.1f%% |\n", difficultyNameZh(d), t.place / t.n, t.points / t.n, 100.0 * t.firsts / t.n);
    }
}

}  // namespace

int main(int argc, char** argv) {
    const int games = argc > 1 ? std::atoi(argv[1]) : 200;
    const std::uint64_t seed = argc > 2 ? std::stoull(argv[2]) : 2026;
    Xoshiro256 rng(seed);

    // Evaluator speed.
    {
        std::vector<std::array<Card, 7>> hands(1'000'000);
        for (auto& h : hands) {
            Deck d;
            d.shuffle(rng);
            for (auto& c : h) c = d.draw();
        }
        const auto t0 = std::chrono::steady_clock::now();
        std::uint64_t sink = 0;
        for (const auto& h : hands) sink += evaluate(h).raw;
        const double ns = std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - t0).count();
        std::printf("牌型判定速度: %.1f ns/次 (7张牌, checksum %llu)\n", ns / static_cast<double>(hands.size()),
                    static_cast<unsigned long long>(sink % 1000));
    }

    std::printf("每种赛制 %d 局, 种子 %llu。段位分示例: 1~6位 = +60/+30/+10/0/-15/-30\n", games,
                static_cast<unsigned long long>(seed));
    runFormat(quickFixedHandsConfig(), games, rng);
    runFormat(standardFixedHandsConfig(), games, rng);
    runFormat(classicKnockoutConfig(), games, rng);
    return 0;
}
