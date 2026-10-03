#include <array>
#include <cstdlib>

#include "poker/hand_eval.hpp"
#include "poker/rng.hpp"
#include "test.hpp"

using namespace poker;

namespace {
HandValue ev(const char* s) {
    const auto cards = parseCards(s);
    return evaluate(cards);
}
}  // namespace

TEST(eval_categories) {
    CHECK(ev("As Ks Qs Js Ts").isRoyalFlush());
    CHECK(ev("9s Ks Qs Js Ts").category() == HandCategory::StraightFlush);
    CHECK(ev("As 2s 3s 4s 5s").category() == HandCategory::StraightFlush);
    CHECK_EQ(ev("As 2s 3s 4s 5s").slot(0), 3);  // wheel tops at the five
    CHECK(ev("7c 7d 7h 7s 2c").category() == HandCategory::FourOfAKind);
    CHECK(ev("7c 7d 7h 2s 2c").category() == HandCategory::FullHouse);
    CHECK(ev("Ah 9h 7h 4h 2h").category() == HandCategory::Flush);
    CHECK(ev("Ah 2c 3d 4s 5h").category() == HandCategory::Straight);
    CHECK(ev("Th Jc Qd Ks Ah").category() == HandCategory::Straight);
    CHECK(ev("Qh Kc Ad 2s 3h").category() == HandCategory::HighCard);  // no wrap-around
    CHECK(ev("7c 7d 7h Ks 2c").category() == HandCategory::ThreeOfAKind);
    CHECK(ev("7c 7d Kh Ks 2c").category() == HandCategory::TwoPair);
    CHECK(ev("7c 7d Kh Qs 2c").category() == HandCategory::OnePair);
    CHECK(ev("7c 9d Kh Qs 2c").category() == HandCategory::HighCard);
}

TEST(eval_ordering_and_kickers) {
    CHECK(ev("As Ks Qs Js Ts") > ev("Ks Qs Js Ts 9s"));
    CHECK(ev("6s 2s 3s 4s 5s") > ev("As 2s 3s 4s 5s"));    // 6-high SF beats the steel wheel
    CHECK(ev("2c 3d 4h 5s 6c") > ev("Ac 2d 3h 4s 5c"));    // 6-high straight beats the wheel
    CHECK(ev("Ac Ad Kh Ks 3c") > ev("Ac Ad Qh Qs Kc"));    // second pair decides
    CHECK(ev("Ac Ad Kh Ks 4c") > ev("Ah As Kc Kd 3c"));    // kicker decides
    CHECK(ev("Ac Ad Kh Ks 4c") == ev("Ah As Kc Kd 4d"));   // exact tie
    CHECK(ev("Ac Ad 9h 8s 3c") < ev("Ah As 9c 8d 4c"));    // third kicker
    CHECK(ev("2h 2d 2c Ks Kc") > ev("Ah Kh Qh Jh 9h"));    // boat beats flush
}

TEST(eval_seven_cards) {
    // Two trips make a full house with the higher set on top.
    auto v = ev("9c 9d 9h 4s 4c 4d Ah");
    CHECK(v.category() == HandCategory::FullHouse);
    CHECK_EQ(v.slot(0), 7);
    CHECK_EQ(v.slot(1), 2);
    // Three pairs: best two plus the best kicker (which may be the third pair).
    v = ev("Kc Kd 5h 5s 3c 3d 4h");
    CHECK(v.category() == HandCategory::TwoPair);
    CHECK_EQ(v.slot(2), 2);  // kicker 4 beats the third pair's 3
    // Flush and straight together: the straight flush, not the higher plain flush.
    v = ev("5h 6h 7h 8h 9h Ah Kc");
    CHECK(v.category() == HandCategory::StraightFlush);
    // Six-card flush keeps the top five.
    v = ev("2h 6h 7h 9h Jh Qh Kc");
    CHECK(v.category() == HandCategory::Flush);
    CHECK_EQ(v.slot(4), 4);  // 6h is the fifth card, 2h dropped
}

// Every 5-card hand: the textbook category counts.
TEST(eval_exhaustive_five_card_counts) {
    std::array<long, 9> counts{};
    std::array<Card, 5> h{};
    for (int a = 0; a < 52; ++a)
        for (int b = a + 1; b < 52; ++b)
            for (int c = b + 1; c < 52; ++c)
                for (int d = c + 1; d < 52; ++d)
                    for (int e = d + 1; e < 52; ++e) {
                        h = {Card(std::uint8_t(a)), Card(std::uint8_t(b)), Card(std::uint8_t(c)),
                             Card(std::uint8_t(d)), Card(std::uint8_t(e))};
                        ++counts[static_cast<std::size_t>(evaluate(h).category())];
                    }
    CHECK_EQ(counts[0], 1302540L);
    CHECK_EQ(counts[1], 1098240L);
    CHECK_EQ(counts[2], 123552L);
    CHECK_EQ(counts[3], 54912L);
    CHECK_EQ(counts[4], 10200L);
    CHECK_EQ(counts[5], 5108L);
    CHECK_EQ(counts[6], 3744L);
    CHECK_EQ(counts[7], 624L);
    CHECK_EQ(counts[8], 40L);
}

// The 7-card evaluator must equal the best of its 21 five-card subsets.
TEST(eval_seven_matches_best_subset) {
    Xoshiro256 rng(42);
    for (int it = 0; it < 100000; ++it) {
        Deck deck;
        deck.shuffle(rng);
        std::array<Card, 7> c{};
        for (auto& x : c) x = deck.draw();
        HandValue best{};
        for (int skipA = 0; skipA < 7; ++skipA)
            for (int skipB = skipA + 1; skipB < 7; ++skipB) {
                std::array<Card, 5> five{};
                int k = 0;
                for (int i = 0; i < 7; ++i)
                    if (i != skipA && i != skipB) five[static_cast<std::size_t>(k++)] = c[static_cast<std::size_t>(i)];
                best = std::max(best, evaluate(five));
            }
        CHECK(evaluate(c) == best);
    }
}

// All 133,784,560 seven-card hands. A few seconds in Release; set POKER_SKIP_SLOW=1 to skip.
TEST(eval_exhaustive_seven_card_counts) {
    if (std::getenv("POKER_SKIP_SLOW")) return;
    std::array<long, 9> counts{};
    std::array<Card, 7> h{};
    for (int a = 0; a < 52; ++a) {
        h[0] = Card(std::uint8_t(a));
        for (int b = a + 1; b < 52; ++b) {
            h[1] = Card(std::uint8_t(b));
            for (int c = b + 1; c < 52; ++c) {
                h[2] = Card(std::uint8_t(c));
                for (int d = c + 1; d < 52; ++d) {
                    h[3] = Card(std::uint8_t(d));
                    for (int e = d + 1; e < 52; ++e) {
                        h[4] = Card(std::uint8_t(e));
                        for (int f = e + 1; f < 52; ++f) {
                            h[5] = Card(std::uint8_t(f));
                            for (int g = f + 1; g < 52; ++g) {
                                h[6] = Card(std::uint8_t(g));
                                ++counts[static_cast<std::size_t>(evaluate(h).category())];
                            }
                        }
                    }
                }
            }
        }
    }
    CHECK_EQ(counts[0], 23294460L);
    CHECK_EQ(counts[1], 58627800L);
    CHECK_EQ(counts[2], 31433400L);
    CHECK_EQ(counts[3], 6461620L);
    CHECK_EQ(counts[4], 6180020L);
    CHECK_EQ(counts[5], 4047644L);
    CHECK_EQ(counts[6], 3473184L);
    CHECK_EQ(counts[7], 224848L);
    CHECK_EQ(counts[8], 41584L);
}
