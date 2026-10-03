#include "poker/tournament.hpp"

#include <algorithm>
#include <numeric>
#include <stdexcept>
#include <tuple>

namespace poker {

TournamentConfig quickFixedHandsConfig() {
    TournamentConfig c;
    c.name = "快速赛 (18手)";
    c.startingStack = 2000;
    c.maxHands = 18;
    c.handsPerLevel = 6;
    c.levels = {{10, 20, 20}, {20, 40, 40}, {40, 80, 80}};
    return c;
}

TournamentConfig standardFixedHandsConfig() {
    TournamentConfig c;
    c.name = "标准赛 (30手)";
    c.startingStack = 2000;
    c.maxHands = 30;
    c.handsPerLevel = 6;
    c.levels = {{10, 20, 20}, {15, 30, 30}, {25, 50, 50}, {40, 80, 80}, {60, 120, 120}};
    return c;
}

TournamentConfig classicKnockoutConfig() {
    TournamentConfig c;
    c.name = "经典淘汰赛";
    c.startingStack = 2000;
    c.maxHands = 0;
    c.handsPerLevel = 8;
    c.levels = {{10, 20, 0},       {15, 30, 0},       {25, 50, 50},      {40, 80, 80},
                {60, 120, 120},    {100, 200, 200},   {150, 300, 300},   {250, 500, 500},
                {400, 800, 800},   {600, 1200, 1200}, {1000, 2000, 2000}, {1500, 3000, 3000}};
    return c;
}

Tournament::Tournament(TournamentConfig config, Rng& rng) : config_(std::move(config)), rng_(rng) {
    if (config_.numSeats < 2) throw std::invalid_argument("Tournament: need at least 2 seats");
    if (config_.levels.empty()) throw std::invalid_argument("Tournament: no blind levels");
    if (config_.handsPerLevel <= 0) throw std::invalid_argument("Tournament: handsPerLevel must be > 0");
    const auto n = static_cast<std::size_t>(config_.numSeats);
    stacks_.assign(n, config_.startingStack);
    bustHand_.assign(n, -1);
    bustStartStack_.assign(n, 0);
    button_ = static_cast<int>(rng_.below(n));
}

int Tournament::levelIndex() const {
    const int last = static_cast<int>(config_.levels.size()) - 1;
    return std::min(handsPlayed_ / config_.handsPerLevel, last);
}

const BlindLevel& Tournament::level() const { return config_.levels[static_cast<std::size_t>(levelIndex())]; }

int Tournament::playersLeft() const {
    return static_cast<int>(std::count_if(stacks_.begin(), stacks_.end(), [](Chips c) { return c > 0; }));
}

Hand& Tournament::startHand() {
    if (finished_) throw std::logic_error("Tournament: already finished");
    if (hand_ && !hand_->complete()) throw std::logic_error("Tournament: previous hand still running");

    // Simplified moving button: it always moves to the next seat that still has chips.
    // (The first hand uses the randomly drawn seat.)
    if (handsPlayed_ > 0 || stacks_[static_cast<std::size_t>(button_)] == 0) {
        const int n = config_.numSeats;
        for (int k = 1; k <= n; ++k) {
            const int s = (button_ + k) % n;
            if (stacks_[static_cast<std::size_t>(s)] > 0) {
                button_ = s;
                break;
            }
        }
    }

    const BlindLevel& lv = level();
    HandConfig hc;
    hc.stacks = stacks_;
    hc.button = button_;
    hc.smallBlind = lv.smallBlind;
    hc.bigBlind = lv.bigBlind;
    hc.ante = lv.ante;

    Deck deck;
    deck.shuffle(rng_);
    handStartStacks_ = stacks_;
    hand_ = std::make_unique<Hand>(hc, deck);
    return *hand_;
}

void Tournament::finishHand() {
    if (!hand_ || !hand_->complete()) throw std::logic_error("Tournament: hand not complete");
    stacks_ = hand_->finalStacks();
    for (int s = 0; s < config_.numSeats; ++s) {
        const auto i = static_cast<std::size_t>(s);
        if (handStartStacks_[i] > 0 && stacks_[i] == 0) {
            bustHand_[i] = handsPlayed_;
            bustStartStack_[i] = handStartStacks_[i];
        }
    }
    ++handsPlayed_;
    if (playersLeft() <= 1 || (config_.maxHands > 0 && handsPlayed_ >= config_.maxHands)) finished_ = true;
}

std::vector<Standing> Tournament::standings() const {
    const int n = config_.numSeats;
    std::vector<Standing> out(static_cast<std::size_t>(n));
    for (int s = 0; s < n; ++s) {
        auto& st = out[static_cast<std::size_t>(s)];
        st.seat = s;
        st.chips = stacks_[static_cast<std::size_t>(s)];
        st.bustHand = bustHand_[static_cast<std::size_t>(s)];
    }
    // Survivors by chips; then busted seats, later busts first; within the same hand,
    // the bigger starting stack places higher.
    auto key = [&](const Standing& a) {
        const auto i = static_cast<std::size_t>(a.seat);
        if (a.bustHand < 0) return std::tuple<int, Chips>(1'000'000, a.chips);
        return std::tuple<int, Chips>(a.bustHand, bustStartStack_[i]);
    };
    std::sort(out.begin(), out.end(), [&](const Standing& a, const Standing& b) {
        if (key(a) != key(b)) return key(a) > key(b);
        return a.seat < b.seat;
    });
    for (int i = 0; i < n;) {
        int j = i;
        while (j + 1 < n && key(out[static_cast<std::size_t>(j + 1)]) == key(out[static_cast<std::size_t>(i)])) ++j;
        for (int k = i; k <= j; ++k) {
            out[static_cast<std::size_t>(k)].place = i + 1;
            out[static_cast<std::size_t>(k)].placeTo = j + 1;
        }
        i = j + 1;
    }
    return out;
}

}  // namespace poker
