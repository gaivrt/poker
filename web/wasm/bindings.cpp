// WebAssembly bindings: exposes poker::app::Session to JavaScript.
#include <emscripten/bind.h>

#include "poker/app/session.hpp"

using poker::app::Session;

EMSCRIPTEN_BINDINGS(poker) {
    emscripten::class_<Session>("Session")
        .constructor<std::string, int, unsigned>()
        .function("finished", &Session::finished)
        .function("handRunning", &Session::handRunning)
        .function("isHumanTurn", &Session::isHumanTurn)
        .function("toAct", &Session::toAct)
        .function("startHand", &Session::startHand)
        .function("prepareBot", &Session::prepareBot)
        .function("stepBot", &Session::stepBot)
        .function("humanAct", &Session::humanAct)
        .function("humanSignal", &Session::humanSignal)
        .function("canHumanShow", &Session::canHumanShow)
        .function("humanShow", &Session::humanShow)
        .function("finishHand", &Session::finishHand)
        .function("drainEvents", &Session::drainEvents)
        .function("state", &Session::state)
        .function("legal", &Session::legal)
        .function("roster", &Session::roster)
        .function("standings", &Session::standings);
}
