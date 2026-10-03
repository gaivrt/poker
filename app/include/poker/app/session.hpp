#pragma once

#include <memory>
#include <string>
#include <vector>

#include <optional>

#include "poker/ai/bot.hpp"
#include "poker/talk.hpp"
#include "poker/tournament.hpp"

namespace poker::app {

// A single-player game: the human in seat 0 against five bots.
//
// This is the boundary the web client talks to (through WebAssembly). Everything
// crosses it as JSON strings so the binding layer stays trivial. The client drives
// the pacing: it calls stepBot() when it is ready to animate the next bot action.
//
//   Session s("quick", 1, seed);
//   s.startHand();
//   loop: events = s.drainEvents();  play them;
//         if (s.isHumanTurn()) wait for input -> s.humanAct(type, to, thinkMs)
//         else if (s.handRunning()) { plan = s.prepareBot(); show it thinking for
//                                     plan.thinkMs; s.stepBot(); }
//         else { maybe s.humanShow(...); s.finishHand(); if (!s.finished()) s.startHand(); }
//
// Table talk (docs/06-mind-games.md) can be sent at any time with humanSignal().
class Session {
public:
    static constexpr int kHuman = 0;

    // format: "quick" | "standard" | "classic"; difficulty: 0 easy, 1 normal, 2 hard.
    Session(const std::string& format, int difficulty, unsigned seed);

    bool finished() const { return tournament_->finished(); }
    bool handRunning() const;
    bool isHumanTurn() const;
    int toAct() const;

    void startHand();
    // The bot to act decides how long it thinks (and lets slip its tells meanwhile).
    // Returns {"seat":s,"thinkMs":n}, or {} when it is not a bot's turn.
    std::string prepareBot();
    bool stepBot();  // one bot action; false if it is not a bot's turn
    // type: "fold" | "check" | "call" | "bet" | "raise"; `to` for bet/raise.
    // thinkMs: how long the human took (thinking time is part of the mind game).
    bool humanAct(const std::string& type, double to, int thinkMs);
    // Table talk from the human. kind: 0 line, 1 expression, 2 gesture; code per talk.hpp;
    // target: a seat or -1. False when rate-limited or invalid.
    bool humanSignal(int kind, int code, int target);
    // After winning uncontested the human may show cards: mask 1 = first, 2 = second, 3 = both.
    bool canHumanShow() const;
    bool humanShow(int mask);
    void finishHand();

    // New events visible to the human since the last call, as a JSON array.
    std::string drainEvents();
    // Public table state plus the human's cards, as a JSON object.
    std::string state() const;
    // The human's legal actions (JSON); all false when it is not the human's turn.
    std::string legal() const;
    // Seat roster: personality preset index per seat (-1 for the human), as JSON.
    std::string roster() const;
    std::string standings() const;

private:
    void collect();
    std::string eventJson(const Event& e);
    void emitSignal(const Signal& sig);
    void emitTalk(int seat, const ai::Talk& talk);
    bool inPlay(int seat) const;
    void recordThink(int seat, int thinkMs, const Action& a);
    void revealVoluntary(int seat, int mask);
    std::string handInfo(int seat, const std::vector<Card>& cards, Strength s) const;

    struct TellUse {
        int seat;
        int tell;
    };

    std::unique_ptr<Xoshiro256> rng_;
    std::unique_ptr<Tournament> tournament_;
    std::vector<std::unique_ptr<ai::Bot>> bots_;
    std::vector<int> personality_;
    std::vector<std::string> pending_;
    std::size_t converted_ = 0;  // engine events of the current hand already converted
    bool handSettled_ = false;   // finishHand() already ran for the current hand
    bool finalsSent_ = false;    // "finalHands" already emitted for the current hand
    std::vector<Card> board_;    // board as seen so far while converting
    std::vector<std::array<Card, 2>> revealed_;
    std::vector<bool> isRevealed_;

    // --- mind games ---
    std::vector<std::vector<int>> features_;      // per seat: signals + timing tells this hand
    std::vector<std::vector<int>> thinkHistory_;  // per seat: every decision time so far
    std::vector<std::array<int, 3>> talkCount_;   // per seat: lines / expressions / gestures this street
    Street talkStreet_ = Street::Preflop;
    std::vector<TellUse> tellUses_;
    std::vector<int> actThink_;       // thinking time of each action this hand, in order
    std::size_t actConverted_ = 0;
    std::optional<ai::Plan> plan_;
    std::size_t planKey_ = 0;         // engine event count when plan_ was made
    std::vector<bool> fullyShown_;    // voluntarily showed both cards this hand
    bool humanShowed_ = false;
    std::vector<bool> provoked_;      // folded to someone who then showed a bluff
};

// Showdown equity of known hands on a partial board (exact when at most two board
// cards are missing, Monte Carlo otherwise). Index = position in `hands`.
std::vector<double> runoutEquity(const std::vector<std::array<Card, 2>>& hands, const std::vector<Card>& board,
                                 Rng& rng);

// The five cards making up the best hand out of `cards` (5..7 cards).
std::vector<Card> bestFive(const std::vector<Card>& cards);

}  // namespace poker::app
