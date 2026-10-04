// Types for the Emscripten module built from web/wasm/bindings.cpp.
export interface WasmSession {
  finished(): boolean;
  handRunning(): boolean;
  isHumanTurn(): boolean;
  toAct(): number;
  startHand(): void;
  prepareBot(): string;
  stepBot(): boolean;
  humanAct(type: string, to: number, thinkMs: number): boolean;
  humanSignal(kind: number, code: number, target: number): boolean;
  canHumanShow(): boolean;
  humanShow(mask: number): boolean;
  finishHand(): void;
  drainEvents(): string;
  state(): string;
  legal(): string;
  roster(): string;
  standings(): string;
  // online: several human seats
  isHuman(seat: number): boolean;
  signalFrom(seat: number, kind: number, code: number, target: number): boolean;
  canShow(seat: number): boolean;
  show(seat: number, mask: number): boolean;
  drainAll(): string;
  stateFor(seat: number): string;
  delete(): void;
}

export interface PokerModule {
  Session: {
    new (format: string, difficulty: number, seed: number): WasmSession;
    new (format: string, difficulty: number, seed: number, humanMask: number): WasmSession;
  };
}

declare const createPokerModule: () => Promise<PokerModule>;
export default createPokerModule;
