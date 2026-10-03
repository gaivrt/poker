#!/usr/bin/env bash
# Builds the C++ engine to WebAssembly: web/src/wasm/poker.js (ES module, .wasm inlined).
# Requires the Emscripten SDK on PATH (source emsdk_env.sh first).
set -euo pipefail
cd "$(dirname "$0")/.."
emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release
cmake --build build-wasm --target poker_wasm
ls -la web/src/wasm/poker.js
