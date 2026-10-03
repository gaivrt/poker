cmake_minimum_required(VERSION 3.20)
project(anime_poker LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

if(MSVC)
  add_compile_options(/W4 /permissive- /utf-8)
else()
  add_compile_options(-Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
endif()

# ---- core: rules engine (no dependencies, shared by client / server / AI) ----
add_library(poker_core
  core/src/card.cpp
  core/src/rng.cpp
  core/src/hand_eval.cpp
  core/src/pot.cpp
  core/src/hand.cpp
  core/src/tournament.cpp
)
target_include_directories(poker_core PUBLIC core/include)

# ---- ai: single-player bots ----
add_library(poker_ai
  ai/src/equity.cpp
  ai/src/bot.cpp
)
target_include_directories(poker_ai PUBLIC ai/include)
target_link_libraries(poker_ai PUBLIC poker_core)

# ---- tools ----
add_executable(poker_cli tools/cli/main.cpp)
target_link_libraries(poker_cli PRIVATE poker_ai)

add_executable(poker_sim tools/sim/main.cpp)
target_link_libraries(poker_sim PRIVATE poker_ai)

# ---- tests ----
enable_testing()
add_executable(poker_tests
  tests/test_main.cpp
  tests/test_hand_eval.cpp
  tests/test_pot.cpp
  tests/test_hand.cpp
  tests/test_tournament.cpp
  tests/test_ai.cpp
)
target_link_libraries(poker_tests PRIVATE poker_ai)
add_test(NAME poker_tests COMMAND poker_tests)
