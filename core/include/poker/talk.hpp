#pragma once

#include <cstdint>

namespace poker {

// Table talk: the mind-game layer on top of the rules.
//
// Signals are public and always chosen by the player who sends them (or by a bot
// playing its character). The system never generates a signal on a human's behalf,
// so nothing here can leak a human's cards; a signal may be honest or a lie.
// See docs/06-mind-games.md.

enum class LineKind : std::uint8_t {
    Taunt,      // 挑衅 "你敢跟吗？"
    Weak,       // 示弱 "唉，这手牌……"
    Confident,  // 自信 "这把我稳了。"
    Probe,      // 试探 "你是不是早就中了？" (usually aimed at someone)
    Hurry,      // 催促 "快点吧～"
    Plead,      // 求饶 "放过我吧……"
    Count
};

enum class Expression : std::uint8_t { Calm, Smug, Nervous, Smile, Angry, Count };

enum class Gesture : std::uint8_t {
    RecheckCards,  // 再看一眼底牌
    FiddleChips,   // 摸筹码
    Stare,         // 盯着某人 (aimed)
    Sigh,          // 叹气
    Count
};

enum class SignalKind : std::uint8_t { Line, Expression, Gesture };

struct Signal {
    int seat = -1;
    int target = -1;  // seat it is aimed at, -1 for the whole table
    SignalKind kind = SignalKind::Line;
    std::uint8_t code = 0;  // LineKind / Expression / Gesture value
};

// Features a read model can learn from: every signal type plus thinking-time tells.
inline constexpr int kLineFeatures = static_cast<int>(LineKind::Count);
inline constexpr int kExpressionFeatures = static_cast<int>(Expression::Count);
inline constexpr int kGestureFeatures = static_cast<int>(Gesture::Count);
inline constexpr int kFeatureFastBet = kLineFeatures + kExpressionFeatures + kGestureFeatures;  // bet much faster than usual
inline constexpr int kFeatureSlowBet = kFeatureFastBet + 1;                                     // bet after a long think
inline constexpr int kNumFeatures = kFeatureSlowBet + 1;

constexpr int featureOf(SignalKind kind, std::uint8_t code) {
    switch (kind) {
        case SignalKind::Line: return code;
        case SignalKind::Expression: return kLineFeatures + code;
        case SignalKind::Gesture: return kLineFeatures + kExpressionFeatures + code;
    }
    return 0;
}

constexpr std::uint8_t codeCount(SignalKind kind) {
    switch (kind) {
        case SignalKind::Line: return static_cast<std::uint8_t>(LineKind::Count);
        case SignalKind::Expression: return static_cast<std::uint8_t>(Expression::Count);
        case SignalKind::Gesture: return static_cast<std::uint8_t>(Gesture::Count);
    }
    return 0;
}

// How strong a revealed hand turned out to be: what read models learn from.
enum class Strength : std::uint8_t { Weak, Medium, Strong };

}  // namespace poker
