#pragma once

#include <memory>
#include <string>
#include <vector>

#include "poker/ai/bot.hpp"
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
//         if (s.isHumanTurn()) wait for input -> s.humanAct(...)
//         else if (s.handRunning()) s.stepBot();
//         else { s.finishHand(); if (!s.finished()) s.startHand(); }
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
    bool stepBot();  // one bot action; false if it is not a bot's turn
    // type: "fold" | "check" | "call" | "bet" | "raise"; `to` for bet/raise.
    bool humanAct(const std::string& type, double to);
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
};

// Showdown equity of known hands on a partial board (exact when at most two board
// cards are missing, Monte Carlo otherwise). Index = position in `hands`.
std::vector<double> runoutEquity(const std::vector<std::array<Card, 2>>& hands, const std::vector<Card>& board,
                                 Rng& rng);

// The five cards making up the best hand out of `cards` (5..7 cards).
std::vector<Card> bestFive(const std::vector<Card>& cards);

}  // namespace poker::app
