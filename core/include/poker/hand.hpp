#pragma once

#include <array>
#include <string>
#include <vector>

#include "poker/card.hpp"
#include "poker/hand_eval.hpp"
#include "poker/pot.hpp"
#include "poker/rng.hpp"

namespace poker {

// One hand of No-Limit Texas Hold'em.
//
// The engine is a pure state machine: no I/O, no clock, no randomness beyond the
// deck it is given. Server, client prediction, AI simulation and replays all run
// the same code. See docs/04-rules-engine-spec.md for the exact rules.

enum class Street : std::uint8_t { Preflop, Flop, Turn, River, Complete };

enum class ActionType : std::uint8_t { Fold, Check, Call, Bet, Raise };

struct Action {
    ActionType type = ActionType::Fold;
    Chips to = 0;  // Bet/Raise only: the seat's total bet on this street after acting ("raise to")

    static Action fold() { return {ActionType::Fold, 0}; }
    static Action check() { return {ActionType::Check, 0}; }
    static Action call() { return {ActionType::Call, 0}; }
    static Action bet(Chips to) { return {ActionType::Bet, to}; }
    static Action raise(Chips to) { return {ActionType::Raise, to}; }
};

struct LegalActions {
    int seat = -1;
    Chips toCall = 0;  // chips a call puts in (already capped by the stack)
    bool canFold = false;
    bool canCheck = false;
    bool canCall = false;
    bool canBet = false;    // no bet yet on this street
    bool canRaise = false;  // there is a bet; raising is allowed (betting is open to this seat)
    Chips minTo = 0;        // bet/raise "to" range; minTo == maxTo when only an all-in is possible
    Chips maxTo = 0;
};

enum class EventType : std::uint8_t {
    HandStarted,    // amount = big blind
    PostSmallBlind, // seat, amount
    PostBigBlind,   // seat, amount
    PostAnte,       // seat (the big blind), amount (dead money)
    DealHole,       // seat, cards; visibleTo = seat
    Act,            // seat, action, amount (chips moved), total (street total), allIn
    BoardDealt,     // street, cards (only the new ones)
    UncalledReturn, // seat, amount
    AllInRunout,    // betting is over; remaining board is dealt without action
    ShowCards,      // seat, cards, value
    WinPot,         // seat, amount, potIndex, value (value.raw == 0 when uncontested)
    HandEnded,
};

struct Event {
    EventType type = EventType::HandStarted;
    int seat = -1;
    int visibleTo = -1;  // -1: everyone. Otherwise only this seat may see the event.
    Street street = Street::Preflop;
    ActionType action = ActionType::Fold;
    Chips amount = 0;
    Chips total = 0;
    bool allIn = false;
    int potIndex = -1;
    std::vector<Card> cards;
    HandValue value{};
};

struct HandConfig {
    std::vector<Chips> stacks;  // one entry per seat; 0 = empty / eliminated seat
    int button = 0;             // must be a seat with chips
    Chips smallBlind = 10;
    Chips bigBlind = 20;
    Chips ante = 0;  // big-blind ante: paid once per hand by the big blind, dead money
};

struct SeatState {
    bool inHand = false;  // dealt into this hand
    bool folded = false;
    bool allIn = false;
    bool acted = false;  // voluntarily acted on this street (posting a blind is not acting)
    Chips stack = 0;
    Chips street = 0;  // chips put in on the current street
    Chips total = 0;   // chips put in this hand, excluding the ante
    Chips levelAfterAction = 0;  // the street's bet level right after this seat last acted
    std::array<Card, 2> hole{};
};

// Public part of a seat, safe to show to anyone.
struct SeatPublic {
    bool inHand = false;
    bool folded = false;
    bool allIn = false;
    Chips stack = 0;
    Chips street = 0;
    Chips total = 0;
};

// Everything one seat is allowed to know. Bots and network clients receive only this.
struct PlayerView {
    int seat = -1;
    std::array<Card, 2> hole{};
    std::vector<Card> board;
    Street street = Street::Preflop;
    std::vector<SeatPublic> seats;
    int button = -1;
    Chips smallBlind = 0;
    Chips bigBlind = 0;
    Chips pot = 0;  // everything in the middle, including this street's bets and the ante
    Chips currentBet = 0;
    LegalActions legal;
    std::vector<Event> history;  // events visible to this seat, in order
};

class Hand {
public:
    // `deck` must already be shuffled (or stacked for tests / replays).
    Hand(HandConfig config, Deck deck);

    bool complete() const { return street_ == Street::Complete; }
    int toAct() const { return toAct_; }
    LegalActions legal() const;

    // Applies an action for toAct(). Returns false (and leaves the state untouched)
    // if the action is illegal; `error` explains why.
    bool act(const Action& action, std::string* error = nullptr);

    // --- observation ---
    int numSeats() const { return static_cast<int>(seats_.size()); }
    const SeatState& seat(int s) const { return seats_[static_cast<std::size_t>(s)]; }
    const std::vector<Card>& board() const { return board_; }
    Street street() const { return street_; }
    int button() const { return config_.button; }
    int smallBlindSeat() const { return sbSeat_; }
    int bigBlindSeat() const { return bbSeat_; }
    Chips currentBet() const { return currentBet_; }
    Chips pot() const;
    const HandConfig& config() const { return config_; }
    const std::vector<Event>& events() const { return events_; }
    PlayerView view(int seat) const;

    // --- results (valid once complete) ---
    // Chips each seat won from the pots (includes its own returned share).
    const std::vector<Chips>& winnings() const { return winnings_; }
    std::vector<Chips> finalStacks() const;
    bool wentToShowdown() const { return showdown_; }

private:
    int nextSeat(int from) const;  // next dealt-in seat clockwise
    int liveCount() const;         // not folded
    int canActCount() const;       // not folded, not all-in
    bool needsAction(int s) const;
    int findNextToAct(int after) const;
    void commit(int s, Chips amount);
    void progress(int lastActor);
    void returnUncalled();
    void dealStreet();
    void revealAll(EventType why);
    void finishUncontested();
    void showdown();
    void endEvent();
    void push(Event e) { events_.push_back(std::move(e)); }

    HandConfig config_;
    Deck deck_;
    std::vector<SeatState> seats_;
    std::vector<Card> board_;
    Street street_ = Street::Preflop;
    int sbSeat_ = -1;
    int bbSeat_ = -1;
    int toAct_ = -1;
    Chips currentBet_ = 0;
    Chips lastRaiseSize_ = 0;  // size of the last full bet/raise on this street (min-raise step)
    int lastAggressor_ = -1;   // last seat to bet/raise on the current street
    Chips deadMoney_ = 0;
    bool revealed_ = false;
    bool showdown_ = false;
    std::vector<Chips> winnings_;
    std::vector<Event> events_;
};

const char* streetNameZh(Street s);
const char* actionNameZh(ActionType a);

}  // namespace poker
