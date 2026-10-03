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
  delete(): void;
}

export interface PokerModule {
  Session: new (format: string, difficulty: number, seed: number) => WasmSession;
}

declare const createPokerModule: () => Promise<PokerModule>;
export default createPokerModule;
