// HTML overlay on top of the canvas: menus, HUD, action panel, results.
// It lives in the same 1920x1080 design space as the canvas (scaled together).
import type { Difficulty, Format, Legal, Standing } from '../engine';
import type { Character } from '../characters';
import { fmt } from '../table/layout';

export type Presentation = 'full' | 'simple' | 'off';
export interface Settings {
  presentation: Presentation;
  fast: boolean;
}
export interface Choice {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  to: number;
}
export interface BetContext {
  pot: number;
  currentBet: number;
  bb: number;
  sb: number;
  preflop: boolean;
}

// Example ranked points by place (1st..6th); see docs/04 §2.3.
export const PLACE_POINTS = [60, 30, 10, 0, -15, -30];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const SETTINGS_KEY = 'poker.settings.v1';
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '');
    if (s && (s.presentation === 'full' || s.presentation === 'simple' || s.presentation === 'off'))
      return { presentation: s.presentation, fast: !!s.fast };
  } catch {
    /* storage unavailable or empty */
  }
  return { presentation: 'full', fast: false };
}
function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export class Overlay {
  readonly root: HTMLElement;
  readonly settings = loadSettings();
  onSettings: () => void = () => {};
  onQuit: () => void = () => {};
  onSkip: () => void = () => {};

  private hud = el('div', 'hud');
  private topRight = el('div', 'top-right');
  private panel = el('div', 'action-panel hidden');
  private pre = el('div', 'pre-actions hidden');
  private spectate = el('div', 'spectate hidden');
  private modal = el('div', 'modal hidden');
  private pending: ((c: Choice | null) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  preCheckFold = false;
  preCallAny = false;

  constructor(root: HTMLElement) {
    this.root = root;
    root.append(this.hud, this.topRight, this.panel, this.pre, this.spectate, this.modal);
    const settingsBtn = el('button', 'round', '设置');
    const quitBtn = el('button', 'round', '菜单');
    settingsBtn.onclick = () => this.openSettings();
    quitBtn.onclick = () => this.confirmQuit();
    this.topRight.append(settingsBtn, quitBtn);
    this.pre.innerHTML = `
      <label><input type="checkbox" data-k="cf"> 自动过牌/弃牌</label>
      <label><input type="checkbox" data-k="ca"> 跟任何注</label>`;
    this.pre.querySelectorAll('input').forEach((box) => {
      box.addEventListener('change', () => {
        const on = (box as HTMLInputElement).checked;
        if ((box as HTMLElement).dataset.k === 'cf') this.preCheckFold = on;
        else this.preCallAny = on;
      });
    });
    this.setInGame(false);
  }

  setInGame(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
    this.topRight.classList.toggle('hidden', !on);
    this.pre.classList.toggle('hidden', !on);
    if (!on) {
      this.panel.classList.add('hidden');
      this.spectate.classList.add('hidden');
    }
  }

  resetPreActions() {
    this.preCheckFold = this.preCallAny = false;
    this.pre.querySelectorAll('input').forEach((b) => ((b as HTMLInputElement).checked = false));
  }

  setHud(line1: string, line2: string) {
    this.hud.innerHTML = `<div class="l1">${line1}</div><div class="l2">${line2}</div>`;
  }

  // ---------- menu ----------
  showMenu(onStart: (f: Format, d: Difficulty) => void) {
    this.setInGame(false);
    this.modal.className = 'modal menu';
    this.modal.innerHTML = `
      <div class="card">
        <div class="title">二次元德州扑克</div>
        <div class="subtitle">原型 M1 · 你 vs 5 名 AI</div>
        <div class="group"><div class="label">赛制</div>
          <div class="seg" data-name="format">
            <button data-v="quick" class="on">快速赛<small>18 手 · 约 9 分钟</small></button>
            <button data-v="standard">标准赛<small>30 手 · 约 15 分钟</small></button>
            <button data-v="classic">经典淘汰赛<small>打到只剩 1 人</small></button>
          </div></div>
        <div class="group"><div class="label">AI 难度</div>
          <div class="seg" data-name="diff">
            <button data-v="0">简单</button><button data-v="1" class="on">普通</button><button data-v="2">困难</button>
          </div></div>
        <button class="primary start">开始对局</button>
        <div class="note">角色、美术、台词均为占位。限定手数赛：打满手数后按筹码排名，中途出局的排在后面。</div>
      </div>`;
    this.modal.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => {
          seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
        }),
      );
    });
    const pickedValue = (name: string) =>
      (this.modal.querySelector(`.seg[data-name="${name}"] button.on`) as HTMLElement).dataset.v!;
    (this.modal.querySelector('.start') as HTMLButtonElement).onclick = () => {
      const format = pickedValue('format') as Format;
      const diff = Number(pickedValue('diff')) as Difficulty;
      this.closeModal();
      onStart(format, diff);
    };
  }

  closeModal() {
    this.modal.className = 'modal hidden';
    this.modal.innerHTML = '';
  }

  // ---------- settings ----------
  private openSettings() {
    const s = this.settings;
    this.modal.className = 'modal';
    this.modal.innerHTML = `
      <div class="card small">
        <div class="title2">设置</div>
        <div class="group"><div class="label">演出</div>
          <div class="seg" data-name="pres">
            <button data-v="full">完整</button><button data-v="simple">简略</button><button data-v="off">关闭</button>
          </div>
          <div class="hint">简略：只保留基础动画和全下摊牌；关闭：只保留基础动画。</div></div>
        <div class="group"><div class="label">速度</div>
          <div class="seg" data-name="speed"><button data-v="0">正常</button><button data-v="1">快速</button></div></div>
        <button class="primary close">完成</button>
      </div>`;
    const mark = (name: string, v: string) =>
      this.modal.querySelectorAll(`.seg[data-name="${name}"] button`).forEach((b) =>
        (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.v === v));
    mark('pres', s.presentation);
    mark('speed', s.fast ? '1' : '0');
    this.modal.querySelectorAll('.seg button').forEach((b) =>
      b.addEventListener('click', () => {
        const seg = (b.parentElement as HTMLElement).dataset.name!;
        const v = (b as HTMLElement).dataset.v!;
        if (seg === 'pres') s.presentation = v as Presentation;
        else s.fast = v === '1';
        mark(seg, v);
        saveSettings(s);
        this.onSettings();
      }),
    );
    (this.modal.querySelector('.close') as HTMLButtonElement).onclick = () => this.closeModal();
  }

  private confirmQuit() {
    this.modal.className = 'modal';
    this.modal.innerHTML = `
      <div class="card small">
        <div class="title2">放弃这局，回到菜单？</div>
        <div class="row"><button class="ghost no">继续打</button><button class="primary yes">回到菜单</button></div>
      </div>`;
    (this.modal.querySelector('.no') as HTMLButtonElement).onclick = () => this.closeModal();
    (this.modal.querySelector('.yes') as HTMLButtonElement).onclick = () => {
      this.closeModal();
      this.onQuit();
    };
  }

  // ---------- spectating after elimination ----------
  showSpectate(place: string) {
    this.spectate.classList.remove('hidden');
    this.spectate.innerHTML = `<span>你已出局（${place}），正在观战</span><button class="primary">直接看结果</button>`;
    (this.spectate.querySelector('button') as HTMLButtonElement).onclick = () => this.onSkip();
    this.pre.classList.add('hidden');
  }

  // ---------- action panel ----------
  ask(legal: Legal, ctx: BetContext): Promise<Choice | null> {
    // Pre-actions answer immediately.
    if (this.preCheckFold) return Promise.resolve(legal.canCheck ? { type: 'check', to: 0 } : { type: 'fold', to: 0 });
    if (this.preCallAny) return Promise.resolve(legal.canCall ? { type: 'call', to: 0 } : { type: 'check', to: 0 });

    return new Promise((resolve) => {
      this.pending = resolve;
      const canAggro = legal.canBet || legal.canRaise;
      const minTo = legal.minTo ?? 0;
      const maxTo = legal.maxTo ?? 0;
      const unit = Math.max(1, ctx.sb);
      const clamp = (v: number) => Math.min(maxTo, Math.max(minTo, Math.round(v / unit) * unit));

      const presets: { label: string; to: number }[] = [];
      if (canAggro) {
        if (ctx.preflop) {
          if (ctx.currentBet <= ctx.bb) [2, 2.5, 3].forEach((k) => presets.push({ label: `${k}BB`, to: ctx.bb * k }));
          else [2.5, 3].forEach((k) => presets.push({ label: `${k}x`, to: ctx.currentBet * k }));
        } else {
          const toCall = legal.toCall ?? 0;
          ([['1/3池', 1 / 3], ['1/2池', 1 / 2], ['2/3池', 2 / 3], ['底池', 1]] as [string, number][]).forEach(([l, f]) =>
            presets.push({ label: l, to: legal.canBet ? ctx.pot * f : ctx.currentBet + (ctx.pot + toCall) * f }));
        }
        presets.push({ label: '全下', to: maxTo });
      }

      const verb = legal.canBet ? '下注' : '加注到';
      this.panel.innerHTML = `
        ${canAggro ? `<div class="presets">${presets.map((p, i) => `<button data-i="${i}">${p.label}</button>`).join('')}</div>
        <div class="slider-row"><input type="range" min="${minTo}" max="${maxTo}" step="${unit}" value="${clamp(minTo)}">
          <input type="number" class="amount" min="${minTo}" max="${maxTo}" step="${unit}" value="${clamp(minTo)}"></div>` : ''}
        <div class="buttons">
          <button class="act fold" ${legal.canFold ? '' : 'disabled'}>弃牌<kbd>F</kbd></button>
          <button class="act call">${legal.canCheck ? '过牌' : `跟注 ${fmt(legal.toCall ?? 0)}`}<kbd>C</kbd></button>
          <button class="act raise" ${canAggro ? '' : 'disabled'}><span class="rl"></span><kbd>R</kbd></button>
        </div>`;
      this.panel.classList.remove('hidden');

      const range = this.panel.querySelector('input[type=range]') as HTMLInputElement | null;
      const num = this.panel.querySelector('input.amount') as HTMLInputElement | null;
      const rl = this.panel.querySelector('.rl') as HTMLElement;
      let amount = clamp(minTo);
      const setAmount = (v: number) => {
        amount = clamp(v);
        if (range) range.value = String(amount);
        if (num) num.value = String(amount);
        rl.textContent = canAggro ? (amount >= maxTo ? `全下 ${fmt(maxTo)}` : `${verb} ${fmt(amount)}`) : '加注';
      };
      setAmount(minTo);
      range?.addEventListener('input', () => setAmount(Number(range.value)));
      num?.addEventListener('change', () => setAmount(Number(num.value)));
      this.panel.querySelectorAll('.presets button').forEach((b) =>
        b.addEventListener('click', () => setAmount(presets[Number((b as HTMLElement).dataset.i)].to)));

      const finish = (c: Choice) => this.resolve(c);
      const doFold = () => legal.canFold && finish({ type: 'fold', to: 0 });
      const doCall = () => finish(legal.canCheck ? { type: 'check', to: 0 } : { type: 'call', to: 0 });
      const doRaise = () => canAggro && finish({ type: legal.canBet ? 'bet' : 'raise', to: amount });
      (this.panel.querySelector('.fold') as HTMLButtonElement).onclick = doFold;
      (this.panel.querySelector('.call') as HTMLButtonElement).onclick = doCall;
      (this.panel.querySelector('.raise') as HTMLButtonElement).onclick = doRaise;
      this.keyHandler = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement && e.target.type === 'number') return;
        const k = e.key.toLowerCase();
        if (k === 'f') doFold();
        else if (k === 'c') doCall();
        else if (k === 'r') doRaise();
      };
      window.addEventListener('keydown', this.keyHandler);
    });
  }

  private resolve(c: Choice | null) {
    this.panel.classList.add('hidden');
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    const p = this.pending;
    this.pending = null;
    p?.(c);
  }

  /** Abandon a pending question (quitting the game). */
  cancelAsk() {
    if (this.pending) this.resolve(null);
  }

  // ---------- results ----------
  showResults(standings: Standing[], cast: Character[], onAgain: () => void, onMenu: () => void) {
    this.panel.classList.add('hidden');
    this.spectate.classList.add('hidden');
    const points = (s: Standing) => {
      let sum = 0;
      for (let p = s.place; p <= s.placeTo; p++) sum += PLACE_POINTS[p - 1] ?? 0;
      return sum / (s.placeTo - s.place + 1);
    };
    const rows = standings
      .map((s) => {
        const c = cast[s.seat];
        const pts = points(s);
        const place = s.place === s.placeTo ? `${s.place}` : `${s.place}-${s.placeTo}`;
        return `<tr class="${s.seat === 0 ? 'me' : ''}">
          <td class="place p${s.place}">${place}</td>
          <td><span class="dot" style="background:#${c.color.toString(16).padStart(6, '0')}"></span>${c.name}<small>${c.style}</small></td>
          <td class="num">${fmt(s.chips)}</td>
          <td class="num ${pts > 0 ? 'up' : pts < 0 ? 'down' : ''}">${pts > 0 ? '+' : ''}${pts}</td></tr>`;
      })
      .join('');
    const me = standings.find((s) => s.seat === 0)!;
    this.modal.className = 'modal';
    this.modal.innerHTML = `
      <div class="card results">
        <div class="title2">${me.place === 1 ? '🏆 第 1 名！' : `你获得第 ${me.place} 名`}</div>
        <table><thead><tr><th>名次</th><th>玩家</th><th>筹码</th><th>段位分</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="row"><button class="ghost menu">回到菜单</button><button class="primary again">再来一局</button></div>
      </div>`;
    (this.modal.querySelector('.again') as HTMLButtonElement).onclick = () => {
      this.closeModal();
      onAgain();
    };
    (this.modal.querySelector('.menu') as HTMLButtonElement).onclick = () => {
      this.closeModal();
      onMenu();
    };
  }
}
