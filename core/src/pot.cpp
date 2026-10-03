#include "poker/pot.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>

namespace poker {

std::vector<Pot> buildPots(const std::vector<Chips>& contributed, const std::vector<bool>& folded,
                           Chips deadMoney) {
    const int n = static_cast<int>(contributed.size());
    if (static_cast<int>(folded.size()) != n) throw std::invalid_argument("buildPots: size mismatch");

    std::vector<Chips> remaining = contributed;
    std::vector<Pot> pots;
    Chips level = 0;

    for (;;) {
        // The next layer is capped by the smallest stake still in play among live seats.
        Chips cap = std::numeric_limits<Chips>::max();
        for (int s = 0; s < n; ++s)
            if (!folded[s] && remaining[s] > 0) cap = std::min(cap, remaining[s]);
        if (cap == std::numeric_limits<Chips>::max()) break;

        Pot pot;
        for (int s = 0; s < n; ++s) {
            const Chips take = std::min(remaining[s], cap);
            pot.amount += take;
            remaining[s] -= take;
        }
        level += cap;
        for (int s = 0; s < n; ++s)
            if (!folded[s] && contributed[s] >= level) pot.eligible.push_back(s);

        if (!pots.empty() && pots.back().eligible == pot.eligible) pots.back().amount += pot.amount;
        else pots.push_back(std::move(pot));
    }

    // Folded chips above every live stake (cannot happen once uncalled bets are returned,
    // but never lose chips): they go to the last pot.
    Chips leftover = 0;
    for (Chips r : remaining) leftover += r;
    if (leftover > 0) {
        if (pots.empty()) throw std::logic_error("buildPots: chips but no live seat");
        pots.back().amount += leftover;
    }

    if (deadMoney > 0) {
        if (pots.empty()) {
            Pot pot;
            for (int s = 0; s < n; ++s)
                if (!folded[s]) pot.eligible.push_back(s);
            pots.push_back(std::move(pot));
        }
        pots.front().amount += deadMoney;
    }
    return pots;
}

std::vector<Chips> awardPots(const std::vector<Pot>& pots, const std::vector<HandValue>& values, int button,
                             std::vector<PotResult>* results) {
    const int n = static_cast<int>(values.size());
    std::vector<Chips> won(static_cast<std::size_t>(n), 0);

    for (const Pot& pot : pots) {
        if (pot.eligible.empty()) throw std::logic_error("awardPots: pot with no eligible seat");
        HandValue best{};
        for (int s : pot.eligible) best = std::max(best, values[static_cast<std::size_t>(s)]);

        // Winners in odd-chip order: clockwise starting left of the button.
        std::vector<int> winners;
        for (int k = 1; k <= n; ++k) {
            const int s = (button + k) % n;
            if (std::find(pot.eligible.begin(), pot.eligible.end(), s) != pot.eligible.end() &&
                values[static_cast<std::size_t>(s)] == best)
                winners.push_back(s);
        }

        const auto count = static_cast<Chips>(winners.size());
        const Chips share = pot.amount / count;
        Chips odd = pot.amount % count;
        for (int s : winners) {
            won[static_cast<std::size_t>(s)] += share + (odd > 0 ? 1 : 0);
            if (odd > 0) --odd;
        }
        if (results) results->push_back(PotResult{pot.amount, winners, best});
    }
    return won;
}

}  // namespace poker
