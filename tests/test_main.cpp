#include <chrono>
#include <cstring>

#include "test.hpp"

int main(int argc, char** argv) {
    const char* filter = argc > 1 ? argv[1] : nullptr;
    int passed = 0, failed = 0;
    for (const auto& c : t::registry()) {
        if (filter && !std::strstr(c.name, filter)) continue;
        const auto start = std::chrono::steady_clock::now();
        try {
            c.fn();
            ++passed;
            const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                                std::chrono::steady_clock::now() - start).count();
            std::cout << "[ OK ] " << c.name << " (" << ms << " ms)\n";
        } catch (const t::Failure& f) {
            ++failed;
            std::cout << "[FAIL] " << c.name << "\n       " << f.message << "\n";
        } catch (const std::exception& e) {
            ++failed;
            std::cout << "[FAIL] " << c.name << "\n       exception: " << e.what() << "\n";
        }
    }
    std::cout << passed << " passed, " << failed << " failed\n";
    return failed ? 1 : 0;
}
