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

# ---- app: single-player session facade (the web client's API) ----
add_library(poker_session app/src/session.cpp)
target_include_directories(poker_session PUBLIC app/include)
target_link_libraries(poker_session PUBLIC poker_ai)

if(EMSCRIPTEN)
  # WebAssembly module for the web client: an ES module with the .wasm inlined,
  # written next to the TypeScript sources (see scripts/build-wasm.sh).
  add_executable(poker_wasm web/wasm/bindings.cpp)
  target_link_libraries(poker_wasm PRIVATE poker_session)
  target_link_options(poker_wasm PRIVATE
    -lembind
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPokerModule
    -sSINGLE_FILE=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,node)
  set_target_properties(poker_wasm PROPERTIES
    OUTPUT_NAME poker
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/web/src/wasm)
  return()
endif()

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
  tests/test_session.cpp
)
target_link_libraries(poker_tests PRIVATE poker_session)
add_test(NAME poker_tests COMMAND poker_tests)
