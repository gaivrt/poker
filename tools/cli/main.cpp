// Terminal prototype: you (seat 0) against five AI players.
//
//   poker_cli [quick|standard|classic] [easy|normal|hard] [seed] [--auto]
//
// --auto lets a bot play your seat too (handy for watching the engine run).

#include <iostream>
#include <cstdlib>
#include <memory>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#include "poker/ai/bot.hpp"
#include "poker/tournament.hpp"

using namespace poker;

namespace {

constexpr int kHuman = 0;

std::string seatName(int s, const std::vector<std::string>& names) { return names[static_cast<std::size_t>(s)]; }

void printEvent(const Event& e, const std::vector<std::string>& names) {
    const auto who = e.seat >= 0 ? seatName(e.seat, names) : std::string();
    switch (e.type) {
        case EventType::HandStarted: break;
        case EventType::PostSmallBlind: std::cout << "  " << who << " 小盲 " << e.amount << "\n"; break;
        case EventType::PostBigBlind: std::cout << "  " << who << " 大盲 " << e.amount << "\n"; break;
        case EventType::PostAnte: std::cout << "  " << who << " 前注 " << e.amount << "\n"; break;
        case EventType::DealHole:
            std::cout << "  你的手牌: [" << cardsToString(e.cards) << "]\n";
            break;
        case EventType::Act: {
            std::cout << "  " << who << " " << actionNameZh(e.action);
            if (e.action == ActionType::Call) std::cout << " " << e.amount;
            if (e.action == ActionType::Bet || e.action == ActionType::Raise) std::cout << " 到 " << e.total;
            if (e.allIn) std::cout << "  【全下!】";
            std::cout << "\n";
            break;
        }
        case EventType::BoardDealt:
            std::cout << "--- " << streetNameZh(e.street) << ": [" << cardsToString(e.cards) << "]\n";
            break;
        case EventType::UncalledReturn: std::cout << "  退还 " << who << " 未被跟注的 " << e.amount << "\n"; break;
        case EventType::AllInRunout: std::cout << "  ★ 全下摊牌! 双方亮牌，发完公共牌 ★\n"; break;
        case EventType::ShowCards:
            std::cout << "  " << who << " 亮牌 [" << cardsToString(e.cards) << "]";
            if (e.value.raw) std::cout << " " << describeZh(e.value);
            std::cout << "\n";
            break;
        case EventType::WinPot:
            std::cout << "  >> " << who << " 赢得 " << (e.potIndex > 0 ? "边池" : "底池") << " " << e.amount;
            if (e.value.raw) std::cout << " (" << describeZh(e.value) << ")";
            std::cout << "\n";
            break;
        case EventType::HandEnded: break;
    }
}

Action askHuman(const Hand& h) {
    const LegalActions la = h.legal();
    const auto& me = h.seat(kHuman);
    for (;;) {
        std::cout << "\n  底池 " << h.pot() << "  你的筹码 " << me.stack;
        if (!h.board().empty()) std::cout << "  公共牌 [" << cardsToString(h.board()) << "]";
        std::cout << "  手牌 [" << me.hole[0].str() << " " << me.hole[1].str() << "]\n  ";
        if (la.canFold) std::cout << "f=弃牌  ";
        if (la.canCheck) std::cout << "c=过牌  ";
        if (la.canCall) std::cout << "c=跟注" << la.toCall << "  ";
        if (la.canBet) std::cout << "b <金额>=下注到(" << la.minTo << "~" << la.maxTo << ")  ";
        if (la.canRaise) std::cout << "r <金额>=加注到(" << la.minTo << "~" << la.maxTo << ")  ";
        if (la.canBet || la.canRaise) std::cout << "a=全下";
        std::cout << "\n  > " << std::flush;

        std::string line;
        if (!std::getline(std::cin, line)) std::exit(0);
        std::istringstream in(line);
        std::string cmd;
        in >> cmd;
        if (cmd == "f" && la.canFold) return Action::fold();
        if (cmd == "c" && la.canCheck) return Action::check();
        if (cmd == "c" && la.canCall) return Action::call();
        if (cmd == "a" && la.canBet) return Action::bet(la.maxTo);
        if (cmd == "a" && la.canRaise) return Action::raise(la.maxTo);
        Chips amount = 0;
        if ((cmd == "b" || cmd == "r") && (in >> amount)) return la.canBet ? Action::bet(amount) : Action::raise(amount);
        std::cout << "  看不懂这个指令，再试一次。\n";
    }
}

}  // namespace

int main(int argc, char** argv) {
    TournamentConfig cfg = quickFixedHandsConfig();
    ai::Difficulty diff = ai::Difficulty::Normal;
    std::uint64_t seed = std::random_device{}();
    bool autoPlay = false;
    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "quick") cfg = quickFixedHandsConfig();
        else if (a == "standard") cfg = standardFixedHandsConfig();
        else if (a == "classic") cfg = classicKnockoutConfig();
        else if (a == "easy") diff = ai::Difficulty::Easy;
        else if (a == "normal") diff = ai::Difficulty::Normal;
        else if (a == "hard") diff = ai::Difficulty::Hard;
        else if (a == "--auto") autoPlay = true;
        else seed = std::stoull(a);
    }

    Xoshiro256 rng(seed);
    const auto& presets = ai::personalityPresets();
    std::vector<std::unique_ptr<ai::Bot>> bots;
    std::vector<std::string> names = {autoPlay ? "你(AI代打)" : "你"};
    for (int s = 0; s < cfg.numSeats; ++s) {
        const auto& p = presets[static_cast<std::size_t>(s) % presets.size()];
        bots.push_back(ai::makeBot(diff, p));
        if (s > 0) names.push_back("AI" + std::to_string(s) + "·" + p.name);
    }

    std::cout << "=== " << cfg.name << " | AI难度: " << ai::difficultyNameZh(diff) << " | 种子 " << seed << " ===\n";
    Tournament t(cfg, rng);
    while (!t.finished()) {
        Hand& h = t.startHand();
        const auto& lv = t.level();
        std::cout << "\n========== 第 " << t.handsPlayed() + 1 << " 手";
        if (cfg.maxHands) std::cout << " / " << cfg.maxHands;
        std::cout << "  盲注 " << lv.smallBlind << "/" << lv.bigBlind;
        if (lv.ante) std::cout << " 前注 " << lv.ante;
        std::cout << "  庄位: " << seatName(h.button(), names) << " ==========\n";
        for (int s = 0; s < cfg.numSeats; ++s)
            if (h.seat(s).inHand) std::cout << "  " << seatName(s, names) << ": " << t.stacks()[static_cast<std::size_t>(s)] << "\n";

        std::size_t shown = 0;
        auto flush = [&]() {
            const auto& ev = h.events();
            for (; shown < ev.size(); ++shown)
                if (ev[shown].visibleTo < 0 || ev[shown].visibleTo == kHuman) printEvent(ev[shown], names);
        };
        while (!h.complete()) {
            flush();
            const int s = h.toAct();
            const Action a = (s == kHuman && !autoPlay) ? askHuman(h)
                                                        : bots[static_cast<std::size_t>(s)]->decide(h.view(s), rng);
            std::string err;
            if (!h.act(a, &err)) std::cout << "  非法操作: " << err << "\n";
        }
        flush();
        t.finishHand();
        for (int s = 0; s < cfg.numSeats; ++s)
            if (h.seat(s).inHand && t.stacks()[static_cast<std::size_t>(s)] == 0)
                std::cout << "  ✖ " << seatName(s, names) << " 被淘汰\n";
    }

    std::cout << "\n========== 最终排名 ==========\n";
    for (const auto& st : t.standings()) {
        std::cout << "  第" << st.place;
        if (st.placeTo != st.place) std::cout << "-" << st.placeTo;
        std::cout << "名  " << seatName(st.seat, names) << "  筹码 " << st.chips << "\n";
    }
    return 0;
}
