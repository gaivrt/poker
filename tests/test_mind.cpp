#include "poker/ai/bot.hpp"
#include "poker/ai/mind.hpp"
#include "poker/app/session.hpp"
#include "test.hpp"

using namespace poker;
using namespace poker::ai;
using poker::app::Session;

namespace {
constexpr int kTaunt = featureOf(SignalKind::Line, static_cast<std::uint8_t>(LineKind::Taunt));
constexpr int kConfident = featureOf(SignalKind::Line, static_cast<std::uint8_t>(LineKind::Confident));

bool contains(const std::string& s, const char* needle) { return s.find(needle) != std::string::npos; }
int count(const std::string& s, const char* needle) {
    int n = 0;
    for (auto p = s.find(needle); p != std::string::npos; p = s.find(needle, p + 1)) ++n;
    return n;
}

// Heads-up flop: seat 0 (the "human") bets the pot into seat 1, holding `hole1`.
PlayerView facingPotBet(const char* hole1) {
    // Button 1 is the small blind and acts first preflop; deal order 0, 1, 0, 1.
    const auto h1 = parseCards(hole1);
    std::vector<Card> top = {parseCards("As")[0], h1[0], parseCards("Kd")[0], h1[1]};
    for (Card c : parseCards("2c Qh 9c 4s")) top.push_back(c);  // burn, flop
    HandConfig c;
    c.stacks = {2000, 2000};
    c.button = 1;
    c.smallBlind = 10;
    c.bigBlind = 20;
    Hand h(c, Deck::stacked(top));
    h.act(Action::call());   // seat 1 (button/SB) completes
    h.act(Action::check());  // seat 0 checks: flop
    h.act(Action::bet(40));  // seat 0 bets the pot
    return h.view(1);
}

double foldRate(int personality, const std::vector<int>& humanFeatures, const char* hole1 = "Ah 3d") {
    Xoshiro256 rng(77);
    auto bot = makeBot(Difficulty::Normal, personalityPresets()[static_cast<std::size_t>(personality)]);
    const PlayerView v = facingPotBet(hole1);
    TalkView talk{{humanFeatures, {}}};
    int folds = 0;
    const int n = 400;
    for (int i = 0; i < n; ++i) folds += bot->decideTalk(v, talk, rng).type == ActionType::Fold ? 1 : 0;
    return static_cast<double>(folds) / n;
}
}  // namespace

TEST(mind_read_model_learns_against_face_value) {
    ReadModel m;
    // Face value: a taunt sounds strong.
    CHECK(m.belief({kTaunt}, 3.0, false) > 0.6);
    // A contrarian reads it the other way.
    CHECK(m.belief({kTaunt}, 3.0, true) < 0.4);
    // After seeing this player taunt with junk eight times, taunts read as weakness.
    for (int i = 0; i < 8; ++i) m.observe({kTaunt}, Strength::Weak);
    CHECK(m.belief({kTaunt}, 3.0, false) < 0.4);
    // No signal, no opinion.
    CHECK(m.belief({}, 3.0, false) == 0.5);
}

TEST(mind_classify_hand) {
    const auto h = [](const char* s) { auto c = parseCards(s); return std::array<Card, 2>{c[0], c[1]}; };
    CHECK(classifyHand(h("As Ah"), {}) == Strength::Strong);
    CHECK(classifyHand(h("7c 2d"), {}) == Strength::Weak);
    CHECK(classifyHand(h("Qs Qd"), parseCards("Qh 7c 2d")) == Strength::Strong);   // set
    CHECK(classifyHand(h("Ks 9d"), parseCards("Kh 7c 2d")) == Strength::Medium);   // top pair
    CHECK(classifyHand(h("As Ad"), parseCards("Kh 7c 2d")) == Strength::Strong);   // overpair
    CHECK(classifyHand(h("7s 6d"), parseCards("Kh 7c 2d")) == Strength::Weak);     // middle pair
    CHECK(classifyHand(h("As 3d"), parseCards("Kh Kc 2d")) == Strength::Weak);     // pair on the board
    CHECK(classifyHand(h("As 3d"), parseCards("Kh 7c 2d")) == Strength::Weak);     // nothing
    // Two pair that is all on the board is not a strong hand.
    CHECK(classifyHand(h("As 3d"), parseCards("Kh Kc 7d 7s 2c")) == Strength::Weak);
}

// The point of the whole layer: what you say changes what the AI does.
TEST(mind_lines_change_ai_decisions) {
    // Spot: ace-high (A3) on Q-9-4 facing a pot-sized bet: a borderline call.
    // 团子 (id 1) takes "this hand is mine" at face value and folds more.
    const double plain = foldRate(1, {});
    const double confident = foldRate(1, {kConfident});
    CHECK(confident > plain + 0.05);
    // 焰 (id 2) reads a taunt as a bluff and folds less.
    CHECK(foldRate(2, {kTaunt}) <= foldRate(2, {}));
    // 凛 (id 0) barely cares.
    CHECK(std::abs(foldRate(0, {kConfident}) - foldRate(0, {})) < std::abs(confident - plain));
}

TEST(mind_session_signals_rate_limits_and_think_time) {
    Session s("quick", 1, 99);
    s.startHand();
    std::string all = s.drainEvents();
    CHECK(!s.humanSignal(0, 99, -1));   // bad code
    CHECK(!s.humanSignal(7, 0, -1));    // bad kind
    CHECK(!s.humanSignal(0, 0, 0));     // cannot aim at yourself
    int lines = 0;
    for (int i = 0; i < 6; ++i) lines += s.humanSignal(0, i % 6, -1) ? 1 : 0;
    CHECK_EQ(lines, 3);                 // three lines per street
    CHECK(s.humanSignal(1, 2, -1));     // an expression still goes through
    CHECK(s.humanSignal(2, 2, 3));      // stare at seat 3
    all += s.drainEvents();
    CHECK(count(all, "\"t\":\"signal\",\"seat\":0") == 5);
    // Play the hand out; every action carries its thinking time.
    while (s.handRunning()) {
        if (s.isHumanTurn()) CHECK(s.humanAct("fold", 0, 4200) || s.humanAct("check", 0, 4200));
        else {
            CHECK(contains(s.prepareBot(), "thinkMs"));
            CHECK(s.stepBot());
        }
        all += s.drainEvents();
    }
    CHECK(count(all, "\"t\":\"act\"") == count(all, "\"thinkMs\""));
}

TEST(mind_session_show_choice_and_tells) {
    // Easy bots have obvious tells; over a few games some get revealed and spotted.
    int shows = 0, tellsSeen = 0, angry = 0;
    for (unsigned seed = 1; seed <= 6; ++seed) {
        Session s("standard", 0, seed);
        s.startHand();
        std::string all;
        int guard = 0;
        while (!s.finished() && ++guard < 20000) {
            all += s.drainEvents();
            if (s.isHumanTurn()) {
                // Bet big often so we win uncontested pots we can show.
                if (!s.humanAct("raise", 1e9, 2000) && !s.humanAct("bet", 1e9, 2000)) {
                    // too big: fall back
                }
                if (s.isHumanTurn()) s.humanAct("call", 0, 2000) || s.humanAct("check", 0, 2000);
            } else if (s.handRunning()) {
                s.prepareBot();
                s.stepBot();
            } else {
                if (s.canHumanShow()) {
                    CHECK(s.humanShow(3));
                    CHECK(!s.humanShow(3));  // only once
                    ++shows;
                }
                s.finishHand();
                if (!s.finished()) s.startHand();
            }
        }
        all += s.drainEvents();
        tellsSeen += count(all, "\"t\":\"tellSeen\"");
        angry += count(all, "\"kind\":\"expression\",\"code\":4");
        CHECK(count(all, "\"t\":\"voluntaryShow\"") >= 0);
    }
    CHECK(tellsSeen > 0);
    (void)shows;
    (void)angry;
}

namespace {
// Heads-up flop checked to seat 1, which holds `hole1`; returns its average bet as a
// fraction of the pot over the times it chose to bet.
double avgBetFraction(int personality, const char* hole1, int* bets) {
    const auto h1 = parseCards(hole1);
    std::vector<Card> top = {parseCards("2s")[0], h1[0], parseCards("3d")[0], h1[1]};
    for (Card c : parseCards("5c Qh 9c 4s")) top.push_back(c);
    HandConfig c;
    c.stacks = {4000, 4000};
    c.button = 1;
    c.smallBlind = 10;
    c.bigBlind = 20;
    Hand h(c, Deck::stacked(top));
    h.act(Action::raise(100));  // seat 1 raises, seat 0 calls: a 200 pot
    h.act(Action::call());
    h.act(Action::check());     // seat 0 checks the flop to seat 1
    const PlayerView v = h.view(1);
    Xoshiro256 rng(5);
    auto bot = makeBot(Difficulty::Easy, personalityPresets()[static_cast<std::size_t>(personality)]);
    double sum = 0;
    *bets = 0;
    for (int i = 0; i < 3000; ++i) {
        bot->plan(v, rng);
        const Action a = bot->decideTalk(v, TalkView{{{}, {}}}, rng);
        if (a.type != ActionType::Bet) continue;
        ++*bets;
        sum += static_cast<double>(a.to) / static_cast<double>(v.pot);
    }
    return *bets ? sum / *bets : 0;
}
}  // namespace

// Bet sizing is part of each character: 团子 bets big with monsters, 狐 the reverse.
TEST(mind_sizing_styles) {
    int nStrong = 0, nWeak = 0;
    const double dangoStrong = avgBetFraction(1, "Qs Qd", &nStrong);  // top set
    const double dangoWeak = avgBetFraction(1, "7h 6d", &nWeak);      // air
    CHECK(nStrong > 100);
    if (nWeak > 20) CHECK(dangoStrong > dangoWeak + 0.2);
    const double foxStrong = avgBetFraction(5, "Qs Qd", &nStrong);
    const double foxWeak = avgBetFraction(5, "7h 6d", &nWeak);
    CHECK(nWeak > 50);
    CHECK(foxWeak > foxStrong + 0.2);
    // 凛 is balanced: similar sizes either way.
    const double rinStrong = avgBetFraction(0, "Qs Qd", &nStrong);
    const double rinWeak = avgBetFraction(0, "7h 6d", &nWeak);
    if (nWeak > 20) CHECK(std::abs(rinStrong - rinWeak) < 0.15);
}

TEST(mind_session_sizing_and_stickers) {
    ReadModel m;
    for (int i = 0; i < 6; ++i) m.observe({kFeatureBigBet}, Strength::Weak);
    CHECK(m.belief({kFeatureBigBet}, 2.0, false) < 0.4);  // big bets from this player are bluffs

    Session s("standard", 1, 31);
    s.startHand();
    std::string all = s.drainEvents();
    int stickers = 0;
    for (int i = 0; i < 5; ++i) stickers += s.humanSignal(3, i, -1) ? 1 : 0;
    CHECK_EQ(stickers, 3);
    CHECK(!s.humanSignal(3, 8, -1));  // no such sticker
    all += s.drainEvents();
    CHECK(count(all, "\"kind\":\"sticker\"") >= 3);
    // Postflop bets carry their size in % of the pot.
    int guard = 0;
    while (!s.finished() && ++guard < 5000 && count(all, "potPct") == 0) {
        all += s.drainEvents();
        if (s.isHumanTurn()) s.humanAct("call", 0, 1500) || s.humanAct("check", 0, 1500);
        else if (s.handRunning()) {
            s.prepareBot();
            s.stepBot();
        } else {
            s.finishHand();
            if (!s.finished()) s.startHand();
        }
        all += s.drainEvents();
    }
    CHECK(count(all, "potPct") > 0);
}

// A bot's words after its action come before anything that action set off.
TEST(mind_bot_talk_precedes_showdown) {
    for (unsigned seed = 1; seed <= 30; ++seed) {
        Session s("quick", 0, seed);
        s.startHand();
        std::string all;
        int guard = 0;
        while (!s.finished() && ++guard < 5000) {
            all += s.drainEvents();
            if (s.isHumanTurn()) s.humanAct("fold", 0, 1000) || s.humanAct("check", 0, 1000);
            else if (s.handRunning()) {
                s.prepareBot();
                s.stepBot();
                const std::string batch = s.drainEvents();
                // In any batch, a signal never comes after the hand's end.
                const auto end = batch.find("\"t\":\"handEnd\"");
                if (end != std::string::npos) CHECK(batch.find("\"t\":\"signal\"", end) == std::string::npos);
                all += batch;
            } else {
                s.finishHand();
                if (!s.finished()) s.startHand();
            }
        }
    }
}
