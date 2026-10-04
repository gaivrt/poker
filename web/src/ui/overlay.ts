// HTML overlay on top of the canvas: menus, HUD, action panel, results.
// It lives in the same 1920x1080 design space as the canvas (scaled together).
import { sfx } from '../audio/sfx';
import type { Difficulty, Format, Legal, SignalKindName, Standing } from '../engine';
import { CAST, type Character, GESTURE_LABEL, LINE_LABEL, STICKER_LABEL } from '../characters';
import type { Quality } from '../fx/post';
import { type Profile, TIERS, tierOf } from '../profile';
import { fmt } from '../table/layout';
import { TELL_COUNT, TELL_UNLOCK, loadTells } from '../tells';

export type Presentation = 'full' | 'simple' | 'off';
export interface Settings {
  presentation: Presentation;
  fast: boolean;
  sound: boolean;
  quality: Quality;
}
export interface HomeHandlers {
  start: (format: Format, difficulty: Difficulty, ranked: boolean) => void;
  rename: (name: string) => void;
}
export interface Choice {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  to: number;
  thinkMs: number;
}
export interface Clock {
  perActionMs: number;
  bankMs: number; // shared across the game; ask() spends from it
}
export interface TalkSeat {
  seat: number;
  name: string;
  color: number;
  live: boolean;
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

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

const SETTINGS_KEY = 'poker.settings.v1';
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '');
    if (s && (s.presentation === 'full' || s.presentation === 'simple' || s.presentation === 'off'))
      return {
        presentation: s.presentation,
        fast: !!s.fast,
        sound: s.sound !== false,
        quality: s.quality === 'medium' || s.quality === 'low' ? s.quality : 'high',
      };
  } catch {
    /* storage unavailable or empty */
  }
  return { presentation: 'full', fast: false, sound: true, quality: 'high' };
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
  /** M15: the action clock is running low ('low') or eating the time bank ('bank'). */
  onClock: (mode: 'off' | 'low' | 'bank') => void = () => {};
  onQuit: () => void = () => {};
  onSkip: () => void = () => {};
  /** Sends table talk; returns false when it was refused (said too much this street). */
  onTalk: (kind: SignalKindName, code: number, target: number) => boolean = () => false;
  onNotes: () => string = () => '';

  private hud = el('div', 'hud');
  private topRight = el('div', 'top-right');
  private panel = el('div', 'action-panel hidden');
  private pre = el('div', 'pre-actions hidden');
  private spectate = el('div', 'spectate hidden');
  private modal = el('div', 'modal hidden');
  private home = el('div', 'home hidden');
  private loader = el('div', 'loader hidden', '<div class="spin"><i></i><i></i><i></i></div><div class="t">洗牌中…</div>');
  private talk = el('div', 'talk-panel hidden');
  private talkBtns = el('div', 'talk-btns hidden');
  private talkOpen = false;
  private showPrompt = el('div', 'show-prompt hidden');
  private notes = el('div', 'notes hidden');
  private toastBox = el('div', 'toast hidden');
  private toastTimer = 0;
  private talkTab: 'line' | 'act' = 'line';
  /** Picture of each sticker (data URLs rendered by the canvas), for the buttons. */
  stickerPreviews: string[] = [];
  private nextBox = el('div', 'next-hand hidden');
  private talkSeats: TalkSeat[] = [];
  target = -1;
  private pending: ((c: Choice | null) => void) | null = null;
  private clockTimer = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  preCheckFold = false;
  preCallAny = false;

  constructor(root: HTMLElement) {
    this.root = root;
    root.append(this.home, this.hud, this.topRight, this.talkBtns, this.talk, this.panel, this.pre, this.showPrompt, this.spectate, this.notes, this.toastBox, this.nextBox, this.modal, this.loader);
    this.talkBtns.innerHTML = `<button data-tab="line" class="tb"><b>台词</b></button><button data-tab="act" class="tb"><b>表情</b></button>`;
    this.talkBtns.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      (b.onclick = () => {
        const tab = b.dataset.tab as 'line' | 'act';
        this.openTalk(!(this.talkOpen && this.talkTab === tab), tab);
      }));
    const notesBtn = el('button', 'round', '笔记');
    const settingsBtn = el('button', 'round', '设置');
    const quitBtn = el('button', 'round', '离开');
    notesBtn.onclick = () => this.toggleNotes();
    settingsBtn.onclick = () => this.openSettings();
    quitBtn.onclick = () => this.confirmQuit();
    this.topRight.append(notesBtn, settingsBtn, quitBtn);
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
    this.talkBtns.classList.toggle('hidden', !on);
    this.openTalk(false);
    if (on) this.home.classList.add('hidden');
    if (!on) {
      this.panel.classList.add('hidden');
      this.spectate.classList.add('hidden');
      this.notes.classList.add('hidden');
      this.showPrompt.classList.add('hidden');
      this.nextBox.classList.add('hidden');
      this.target = -1;
    }
  }

  // ---------- table talk ----------
  setTalkSeats(seats: TalkSeat[]) {
    this.talkSeats = seats;
    if (this.target >= 0 && !seats.find((s) => s.seat === this.target && s.live)) this.target = -1;
    this.renderTalk();
  }

  setTarget(seat: number) {
    this.target = this.target === seat ? -1 : seat;
    this.renderTalk();
  }

  hideTalk() {
    this.openTalk(false);
    this.talkBtns.classList.add('hidden');
  }

  /** The talk popover opens above the two round buttons next to your character. */
  private openTalk(on: boolean, tab = this.talkTab) {
    this.talkOpen = on;
    this.talkTab = tab;
    this.talk.classList.toggle('hidden', !on);
    this.talkBtns.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', on && b.dataset.tab === tab));
    if (on) this.renderTalk();
  }

  private renderTalk() {
    const tabs: ['line' | 'act', string][] = [['line', '台词'], ['act', '表情动作']];
    // One button list per tab: [signal kind, code, label, picture?]
    type Item = [SignalKindName, number, string, string?];
    const items: Item[] =
      this.talkTab === 'line'
        ? Object.entries(LINE_LABEL).map(([k, v]) => ['line', Number(k), v] as Item)
        : [
            ...Object.entries(STICKER_LABEL).map(([k, v]) => ['sticker', Number(k), v, this.stickerPreviews[Number(k)]] as Item),
            ...Object.entries(GESTURE_LABEL).map(([k, v]) => ['gesture', Number(k), v] as Item),
          ];
    this.talk.innerHTML = `
      <div class="talk-tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === this.talkTab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="talk-grid ${this.talkTab}">${items
        .map(([kind, , label, pic], i) =>
          `<button data-i="${i}" class="${kind}">${pic ? `<img src="${pic}" alt="">` : ''}<span>${label}</span></button>`)
        .join('')}</div>
      <div class="talk-target"><span>对象</span><button data-seat="-1" class="${this.target < 0 ? 'on' : ''}">全桌</button>${this.talkSeats
        .filter((s) => s.live)
        .map((s) => `<button data-seat="${s.seat}" class="${s.seat === this.target ? 'on' : ''}" style="--c:${hex(s.color)}">${s.name}</button>`)
        .join('')}</div>`;
    this.talk.querySelectorAll<HTMLButtonElement>('.talk-tabs button').forEach((b) =>
      (b.onclick = () => {
        this.talkTab = b.dataset.tab as 'line' | 'act';
        this.renderTalk();
      }));
    this.talk.querySelectorAll<HTMLButtonElement>('.talk-target button').forEach((b) =>
      (b.onclick = () => {
        this.target = Number(b.dataset.seat);
        this.renderTalk();
      }));
    const grid = this.talk.querySelector('.talk-grid') as HTMLElement;
    grid.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      (b.onclick = () => {
        const [kind, code] = items[Number(b.dataset.i)];
        const ok = this.onTalk(kind, code, this.target);
        if (!ok) this.toast('这条街已经说得够多了，等下一条街吧');
        else this.openTalk(false);
        grid.classList.add('cooldown');
        setTimeout(() => grid.classList.remove('cooldown'), 1200);
      }));
  }

  // ---------- pacing ----------
  /** Pause between hands so the result can sink in; "下一手" (or Space) skips ahead. */
  waitNext(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const start = performance.now();
      this.nextBox.classList.remove('hidden');
      this.nextBox.innerHTML = `<button>下一手 <b></b></button>`;
      const label = this.nextBox.querySelector('b') as HTMLElement;
      const done = () => {
        window.clearInterval(timer);
        window.removeEventListener('keydown', onKey);
        this.nextBox.classList.add('hidden');
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') done();
      };
      const timer = window.setInterval(() => {
        const left = ms - (performance.now() - start);
        if (left <= 0) done();
        else label.textContent = `${Math.ceil(left / 1000)}`;
      }, 100);
      label.textContent = `${Math.ceil(ms / 1000)}`;
      (this.nextBox.querySelector('button') as HTMLButtonElement).onclick = done;
      window.addEventListener('keydown', onKey);
    });
  }

  // ---------- show or muck ----------
  askShow(cards: string[]): Promise<0 | 1 | 2 | 3> {
    return new Promise((resolve) => {
      this.showPrompt.classList.remove('hidden');
      this.showPrompt.innerHTML = `<div class="q">赢下底池。要亮牌给他们看吗？</div>
        <div class="row4"><button data-m="0" class="ghost-s">不亮</button><button data-m="1">亮 ${cards[0]}</button>
        <button data-m="2">亮 ${cards[1]}</button><button data-m="3" class="hot">全部亮出</button></div><div class="bar"><i></i></div>`;
      let done = false;
      const finish = (m: 0 | 1 | 2 | 3) => {
        if (done) return;
        done = true;
        this.showPrompt.classList.add('hidden');
        resolve(m);
      };
      this.showPrompt.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => finish(Number(b.dataset.m) as 0 | 1 | 2 | 3)));
      setTimeout(() => finish(0), 4000);
    });
  }

  // ---------- notes & toasts ----------
  private toggleNotes() {
    const open = this.notes.classList.contains('hidden');
    this.notes.classList.toggle('hidden', !open);
    if (open) this.refreshNotes();
  }

  refreshNotes() {
    if (this.notes.classList.contains('hidden')) return;
    this.notes.innerHTML = `<div class="notes-head"><b>读人笔记</b><button class="x">关闭</button></div><div class="notes-body">${this.onNotes()}</div>`;
    (this.notes.querySelector('.x') as HTMLButtonElement).onclick = () => this.notes.classList.add('hidden');
  }

  /** M16: a collectible "tell card" flips in at the side, then flies into the notes button. */
  tellCard(name: string, color: number, text: string) {
    const card = el('div', 'tell-card');
    card.style.setProperty('--c', hex(color));
    card.innerHTML = `<div class="inner"><div class="back">破绽</div><div class="front">
      <span class="ava">${esc(name.slice(0, 1))}</span><b>发现破绽！</b><em>${esc(name)}</em><p>${esc(text)}</p><i class="shine"></i></div></div>`;
    this.root.append(card);
    sfx.play('chime', 0.7);
    // fly to the notes button after a moment to read it
    window.setTimeout(() => {
      const btn = this.topRight.querySelector('button') as HTMLElement | null;
      if (btn && !this.topRight.classList.contains('hidden')) {
        const b = btn.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const s = c.width / card.offsetWidth || 1; // the #ui scale
        card.style.setProperty('--dx', `${(b.left + b.width / 2 - (c.left + c.width / 2)) / s}px`);
        card.style.setProperty('--dy', `${(b.top + b.height / 2 - (c.top + c.height / 2)) / s}px`);
        btn.classList.add('ping');
        window.setTimeout(() => btn.classList.remove('ping'), 1400);
      }
      card.classList.add('away');
      window.setTimeout(() => card.remove(), 700);
    }, 3200);
  }

  toast(text: string) {
    this.toastBox.textContent = text;
    this.toastBox.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastBox.classList.add('hidden'), 2600);
  }

  resetPreActions() {
    this.preCheckFold = this.preCallAny = false;
    this.pre.querySelectorAll('input').forEach((b) => ((b as HTMLInputElement).checked = false));
  }

  setHud(line1: string, line2: string) {
    this.hud.innerHTML = `<div class="l1">${line1}</div><div class="l2">${line2}</div>`;
  }

  // ---------- home ----------
  showHome(profile: Profile, h: HomeHandlers) {
    this.setInGame(false);
    this.closeModal();
    this.loading(false);
    const t = tierOf(profile.points);
    const tells = loadTells();
    const found = Object.values(tells).filter((r) => r.count >= TELL_UNLOCK).length;
    const total = TELL_COUNT.reduce((a, b) => a + b, 0);
    this.home.classList.remove('hidden');
    this.home.innerHTML = `
      <div class="topbar">
        <button class="me" title="改名"><span class="ava">${esc(profile.name.slice(0, 1))}</span>
          <span class="who"><b>${esc(profile.name)}</b><small>${t.name} · ${profile.points} 分</small></span>
          <span class="prog"><i style="width:${Math.round(t.progress * 100)}%"></i></span></button>
        <div class="daily"><b>今日任务</b><span>打完 1 局段位赛</span><span>发现 1 个破绽</span></div>
        <button class="round gear">设置</button>
      </div>
      <div class="logo"><div class="l1">牌桌心理战</div><div class="l2">ANIME HOLD'EM</div></div>
      <div class="modes">
        <button class="poster ranked"><span class="tape"></span>
          <b>段位赛</b><small>打满手数按筹码排名 · 赢分升段</small>
          <span class="tier"><em>${t.name}</em>${t.next ? `距 ${t.next} 还差 ${t.toNext} 分` : '已是最高段位'}</span></button>
        <div class="poster-row">
          <button class="poster practice"><span class="tape"></span><b>单人练习</b><small>自选赛制和难度</small></button>
          <button class="poster friends" disabled><span class="tape"></span><b>好友房</b><small>开发中</small></button>
        </div>
        <div class="rounds">
          <button data-k="roster"><i>角</i>角色</button>
          <button data-k="tells"><i>鉴</i>图鉴<sup>${found}/${total}</sup></button>
          <button data-k="replays"><i>谱</i>牌谱</button>
          <button data-k="rules"><i>规</i>规则</button>
        </div>
      </div>
      <div class="news"><b>公告</b><span>原型测试中：对手为 AI，角色立绘为占位，联机段位赛正在开发。</span></div>`;
    const q = <T extends HTMLElement>(sel: string) => this.home.querySelector(sel) as T;
    q<HTMLButtonElement>('.gear').onclick = () => this.openSettings();
    q<HTMLButtonElement>('.me').onclick = () => this.renameDialog(profile.name, (n) => {
      h.rename(n);
      this.showHome({ ...profile, name: n }, h);
    });
    q<HTMLButtonElement>('.ranked').onclick = () => this.formatDialog(true, (f, d) => h.start(f, d, true), profile);
    q<HTMLButtonElement>('.practice').onclick = () => this.formatDialog(false, (f, d) => h.start(f, d, false), profile);
    this.home.querySelectorAll<HTMLButtonElement>('.rounds button').forEach((b) =>
      (b.onclick = () => {
        const k = b.dataset.k;
        if (k === 'roster') this.rosterDialog();
        else if (k === 'tells') this.tellsDialog();
        else if (k === 'rules') this.rulesDialog();
        else this.toast('牌谱回放正在开发');
      }));
  }

  /** Full-screen "shuffling" curtain while a table loads. */
  loading(on: boolean) {
    if (on) this.home.classList.add('hidden');
    this.loader.classList.toggle('hidden', !on);
  }

  private dialog(cls: string, html: string) {
    this.modal.className = 'modal';
    this.modal.innerHTML = `<div class="card ${cls}">${html}</div>`;
    const close = this.modal.querySelector('.close') as HTMLButtonElement | null;
    if (close) close.onclick = () => this.closeModal();
    return this.modal;
  }

  private bindSeg() {
    this.modal.querySelectorAll('.seg').forEach((seg) =>
      seg.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => {
          seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
        })));
  }

  private picked(name: string) {
    return (this.modal.querySelector(`.seg[data-name="${name}"] button.on`) as HTMLElement).dataset.v!;
  }

  private formatDialog(ranked: boolean, go: (f: Format, d: Difficulty) => void, profile: Profile) {
    // Ranked opponents get tougher from 黄金 up; practice lets you choose.
    const rankedDiff: Difficulty = tierOf(profile.points).index >= 3 ? 2 : 1;
    this.dialog('small', `
      <div class="title2">${ranked ? '段位赛' : '单人练习'}</div>
      <div class="group"><div class="label">赛制</div>
        <div class="seg" data-name="format">
          <button data-v="quick" class="on">快速赛<small>18 手 · 约 9 分钟</small></button>
          <button data-v="standard">标准赛<small>30 手 · 约 15 分钟</small></button>
          ${ranked ? '' : '<button data-v="classic">淘汰赛<small>打到只剩 1 人</small></button>'}
        </div></div>
      ${ranked
        ? `<div class="hint">名次得分：${PLACE_POINTS.map((p, i) => `第${i + 1} ${p > 0 ? '+' : ''}${p}`).join(' · ')}</div>`
        : `<div class="group"><div class="label">AI 难度</div>
        <div class="seg" data-name="diff">
          <button data-v="0">简单</button><button data-v="1" class="on">普通</button><button data-v="2">困难</button>
        </div></div>`}
      <div class="row"><button class="ghost close">返回</button><button class="primary go">开始</button></div>`);
    this.bindSeg();
    (this.modal.querySelector('.go') as HTMLButtonElement).onclick = () => {
      const f = this.picked('format') as Format;
      const d = ranked ? rankedDiff : (Number(this.picked('diff')) as Difficulty);
      this.closeModal();
      go(f, d);
    };
  }

  private renameDialog(name: string, done: (n: string) => void) {
    this.dialog('small', `
      <div class="title2">昵称</div>
      <input class="name" maxlength="8" value="${esc(name)}">
      <div class="row"><button class="ghost close">取消</button><button class="primary ok">确定</button></div>`);
    const input = this.modal.querySelector('input.name') as HTMLInputElement;
    input.focus();
    input.select();
    const ok = () => {
      const n = input.value.trim().slice(0, 8);
      this.closeModal();
      if (n) done(n);
    };
    input.onkeydown = (e) => e.key === 'Enter' && ok();
    (this.modal.querySelector('.ok') as HTMLButtonElement).onclick = ok;
  }

  private rosterDialog() {
    const tells = loadTells();
    this.dialog('wide', `
      <div class="title2">角色</div>
      <div class="roster">${CAST.map((c, i) => {
        const got = Object.values(tells).filter((t) => t.character === c.name && t.count >= TELL_UNLOCK).length;
        return `<div class="who" style="--c:${hex(c.color)}"><span class="ava">${c.name}</span>
          <b>${c.name}</b><small>${c.style}</small><q>${esc(c.lines.win[0] ?? '')}</q>
          <em>破绽 ${got}/${TELL_COUNT[i]}</em></div>`;
      }).join('')}</div>
      <div class="hint center">立绘为占位，角色设计确定后替换。</div>
      <button class="primary close">关闭</button>`);
  }

  private tellsDialog() {
    const tells = loadTells();
    const found = (name: string) => Object.values(tells).filter((t) => t.character === name);
    this.dialog('wide', `
      <div class="title2">破绽图鉴</div>
      <div class="hint center">对局中同一个破绽被你看到 ${TELL_UNLOCK} 次，就会收进图鉴。</div>
      <div class="tellbook">${CAST.map((c, i) => {
        const recs = found(c.name);
        const slots = Array.from({ length: TELL_COUNT[i] }, (_, k) => {
          const r = recs.filter((t) => t.count >= TELL_UNLOCK)[k];
          return r ? `<li class="got">${esc(r.text)}</li>` : `<li>？？？</li>`;
        });
        return `<section style="--c:${hex(c.color)}"><h4>${c.name}<small>${c.style}</small></h4><ul>${slots.join('')}</ul></section>`;
      }).join('')}</div>
      <button class="primary close">关闭</button>`);
  }

  private rulesDialog() {
    this.dialog('wide rules', `
      <div class="title2">规则</div>
      <div class="cols">
        <div><h4>一手牌怎么打</h4>
          <p>每人 2 张底牌，桌面依次发出 3 张翻牌、1 张转牌、1 张河牌。每一轮都可以弃牌、过牌、跟注或加注。</p>
          <p>最后用 7 张里最好的 5 张比大小，或者让其他人都弃牌，赢下底池。</p>
          <h4>赛制</h4>
          <p>6 人桌，每人 2000 筹码，盲注随手数上涨。快速赛 18 手、标准赛 30 手，打满后按筹码排名；淘汰赛打到只剩 1 人。</p>
          <h4>心理战</h4>
          <p>可以说台词、发表情、做动作，也会看到对手的下注快慢和大小。每个 AI 都有自己的破绽，记在笔记里。</p></div>
        <div><h4>牌型（从大到小）</h4><ol class="ranks">
          <li><b>同花顺</b>A♠K♠Q♠J♠10♠</li><li><b>四条</b>9 9 9 9 K</li><li><b>葫芦</b>Q Q Q 7 7</li>
          <li><b>同花</b>五张同花色</li><li><b>顺子</b>5 6 7 8 9</li><li><b>三条</b>8 8 8 A 4</li>
          <li><b>两对</b>J J 4 4 9</li><li><b>一对</b>10 10 A 6 2</li><li><b>高牌</b>以上都没有</li></ol></div>
      </div>
      <button class="primary close">关闭</button>`);
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
        <div class="group"><div class="label">音效</div>
          <div class="seg" data-name="sound"><button data-v="1">开</button><button data-v="0">关</button></div></div>
        <div class="group"><div class="label">画质</div>
          <div class="seg" data-name="quality"><button data-v="high">高</button><button data-v="medium">中</button><button data-v="low">低</button></div>
          <div class="hint">低：关闭泛光和胶片颗粒，适合旧手机。</div></div>
        <button class="primary close">完成</button>
      </div>`;
    const mark = (name: string, v: string) =>
      this.modal.querySelectorAll(`.seg[data-name="${name}"] button`).forEach((b) =>
        (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.v === v));
    mark('pres', s.presentation);
    mark('speed', s.fast ? '1' : '0');
    mark('sound', s.sound ? '1' : '0');
    mark('quality', s.quality);
    this.modal.querySelectorAll('.seg button').forEach((b) =>
      b.addEventListener('click', () => {
        const seg = (b.parentElement as HTMLElement).dataset.name!;
        const v = (b as HTMLElement).dataset.v!;
        if (seg === 'pres') s.presentation = v as Presentation;
        else if (seg === 'speed') s.fast = v === '1';
        else if (seg === 'sound') s.sound = v === '1';
        else s.quality = v as Quality;
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
        <div class="title2">放弃这局，回到主页？</div>
        <div class="row"><button class="ghost no">继续打</button><button class="primary yes">回到主页</button></div>
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
  ask(legal: Legal, ctx: BetContext, clock: Clock): Promise<Choice | null> {
    // Pre-actions answer immediately (and that instant answer is itself a timing tell).
    if (this.preCheckFold) return Promise.resolve(legal.canCheck ? { type: 'check', to: 0, thinkMs: 300 } : { type: 'fold', to: 0, thinkMs: 300 });
    if (this.preCallAny) return Promise.resolve(legal.canCall ? { type: 'call', to: 0, thinkMs: 300 } : { type: 'check', to: 0, thinkMs: 300 });

    const started = performance.now();
    return new Promise((resolve) => {
      this.pending = (c) => {
        window.clearInterval(this.clockTimer);
        if (c) {
          const used = performance.now() - started;
          clock.bankMs = Math.max(0, clock.bankMs - Math.max(0, used - clock.perActionMs));
          c.thinkMs = used;
        }
        resolve(c);
      };
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
        <div class="clock"></div>
        ${canAggro ? `<div class="presets">${presets.map((p, i) => `<button data-i="${i}">${p.label}</button>`).join('')}</div>
        <div class="slider-row"><input type="range" min="${minTo}" max="${maxTo}" step="${unit}" value="${clamp(minTo)}">
          <input type="number" class="amount" min="${minTo}" max="${maxTo}" step="${unit}" value="${clamp(minTo)}"></div>` : ''}
        <div class="buttons">
          <button class="act fold" ${legal.canFold ? '' : 'disabled'}>弃牌<kbd>F</kbd></button>
          <button class="act call">${legal.canCheck ? '过牌' : `跟注 ${fmt(legal.toCall ?? 0)}`}<kbd>C</kbd></button>
          <button class="act raise" ${canAggro ? '' : 'disabled'}><span class="rl"></span><kbd>R</kbd></button>
        </div>`;
      this.panel.classList.remove('hidden');
      this.pre.classList.add('hidden');

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
      const doFold = () => legal.canFold && finish({ type: 'fold', to: 0, thinkMs: 0 });
      const doCall = () => finish(legal.canCheck ? { type: 'check', to: 0, thinkMs: 0 } : { type: 'call', to: 0, thinkMs: 0 });
      const doRaise = () => canAggro && finish({ type: legal.canBet ? 'bet' : 'raise', to: amount, thinkMs: 0 });

      // Action clock: per-action time, then the game's time bank, then check/fold.
      const clockEl = this.panel.querySelector('.clock') as HTMLElement;
      let mode: 'off' | 'low' | 'bank' = 'off';
      let lastSec = -1;
      const tickClock = () => {
        const used = performance.now() - started;
        const left = clock.perActionMs - used;
        const bankLeft = clock.bankMs + Math.min(0, left);
        let next: typeof mode = 'off';
        if (left > 0) {
          const sec = Math.ceil(left / 1000);
          clockEl.innerHTML = `⏱ <b>${sec}</b> 秒`;
          clockEl.className = `clock${left < 5000 ? ' low' : ''}`;
          if (left < 5000) {
            next = 'low';
            if (sec !== lastSec) sfx.play('heartbeat', 0.9);
          }
          lastSec = sec;
        } else if (bankLeft > 0) {
          const half = Math.ceil(bankLeft / 500);
          clockEl.innerHTML = `时间银行 <b>${Math.ceil(bankLeft / 1000)}</b> 秒`;
          clockEl.className = 'clock bank';
          next = 'bank';
          if (half !== lastSec) sfx.play('tick', 1.4);
          lastSec = half;
        } else {
          finish(legal.canCheck ? { type: 'check', to: 0, thinkMs: 0 } : { type: 'fold', to: 0, thinkMs: 0 });
          return;
        }
        if (next !== mode) {
          mode = next;
          this.onClock(mode);
        }
      };
      tickClock();
      this.clockTimer = window.setInterval(tickClock, 200);
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
    window.clearInterval(this.clockTimer);
    this.onClock('off');
    this.panel.classList.add('hidden');
    if (!this.spectate.classList.contains('hidden')) this.pre.classList.add('hidden');
    else if (!this.hud.classList.contains('hidden')) this.pre.classList.remove('hidden');
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

  // ---------- results (M17) ----------
  /** Portraits per seat (data URLs from the canvas): the resting pose and the victory pose. */
  portraits: { idle: string; win: string }[] = [];

  /** The final ranking: cards turn over from last place to first, then the rank points roll in. */
  showResults(standings: Standing[], cast: Character[], onAgain: () => void, onMenu: () => void, rank?: { before: number; after: number }) {
    this.panel.classList.add('hidden');
    this.spectate.classList.add('hidden');
    this.openTalk(false);
    const points = (s: Standing) => {
      let sum = 0;
      for (let p = s.place; p <= s.placeTo; p++) sum += PLACE_POINTS[p - 1] ?? 0;
      return sum / (s.placeTo - s.place + 1);
    };
    const byPlace = [...standings].sort((a, b) => a.place - b.place || a.seat - b.seat);
    // podium order on screen: 6 4 2 1 3 5 (first place in the middle)
    const slots = [5, 3, 1, 0, 2, 4].filter((i) => i < byPlace.length);
    const me = standings.find((s) => s.seat === 0)!;
    const cards = slots
      .map((i) => {
        const st = byPlace[i];
        const c = cast[st.seat];
        const first = i === 0;
        const pic = this.portraits[st.seat]?.[first ? 'win' : 'idle'];
        const pts = points(st);
        const place = st.place === st.placeTo ? `${st.place}` : `${st.place}-${st.placeTo}`;
        return `<div class="rc${first ? ' first' : ''}${st.seat === 0 ? ' me' : ''}" data-i="${i}" style="--c:${hex(c.color)}">
          <div class="inner"><div class="back"><span>?</span></div><div class="front">
            <div class="pl">${place}<small>${first ? 'ST' : st.place === 2 ? 'ND' : st.place === 3 ? 'RD' : 'TH'}</small></div>
            ${pic ? `<img src="${pic}" alt="">` : `<span class="ava">${esc(c.name.slice(0, 1))}</span>`}
            <div class="info"><b>${esc(c.name)}${st.seat === 0 && c.name !== '你' ? '<em>你</em>' : ''}</b>
            <span class="chips">${fmt(st.chips)}${rank ? ` · <span class="pts ${pts > 0 ? 'up' : pts < 0 ? 'down' : ''}">${pts > 0 ? '+' : ''}${pts}</span>` : ''}</span></div>
          </div></div></div>`;
      })
      .join('');
    let rankHtml = '';
    if (rank) {
      const a = tierOf(rank.before);
      const b = tierOf(rank.after);
      rankHtml = `<div class="rankbox hidden">
        <span class="badge old">${a.name}</span>${b.index !== a.index ? `<span class="badge new">${b.name}</span>` : ''}
        <span class="pts"><span class="num">${rank.before}</span> 分 <b class="${rank.after > rank.before ? 'up' : rank.after < rank.before ? 'down' : ''}">${rank.after >= rank.before ? '+' : ''}${rank.after - rank.before}</b></span>
        <span class="prog"><i style="width:${Math.round(a.progress * 100)}%"></i></span>
        <small>${b.index > a.index ? `升段！${a.name} → ${b.name}` : b.index < a.index ? `降至 ${b.name}` : b.next ? `距 ${b.next} 还差 ${b.toNext} 分` : `最高段位 ${TIERS[TIERS.length - 1].name}`}</small></div>`;
    }
    this.modal.className = 'modal finale';
    this.modal.innerHTML = `
      <div class="fin">
        <div class="fin-title">最终排名</div>
        <div class="cards">${cards}</div>
        <div class="fin-me">${me.place === 1 ? '你是第 1 名！' : `你获得第 ${me.place} 名`}</div>
        ${rankHtml}
        <div class="row hidden"><button class="ghost menu">回到主页</button><button class="primary again">再来一局</button></div>
        <div class="confetti"></div>
        <div class="skip-hint">点击跳过</div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => this.modal.querySelector(sel) as T;
    const cardEl = (i: number) => this.modal.querySelector(`.rc[data-i="${i}"]`) as HTMLElement | null;

    // the timeline (every step can be fast-forwarded by a click)
    const steps: [number, () => void][] = [];
    let t = 400;
    for (let i = byPlace.length - 1; i >= 0; i--) {
      const first = i === 0;
      if (first) t += 600; // a breath before the winner
      steps.push([t, () => {
        cardEl(i)?.classList.add('open');
        sfx.play('flip', first ? 1 : 0.7);
        if (first) {
          sfx.play('impact', 0.8);
          sfx.play('cheer', 0.9);
          this.modal.querySelector('.fin')!.classList.add('crowned');
          const box = q<HTMLElement>('.confetti');
          const colors = ['#ffd36b', '#f69375', '#e04fb0', '#52c0cf', '#b9a7f0', '#fff'];
          box.innerHTML = Array.from({ length: 70 }, (_, k) =>
            `<i style="left:${Math.random() * 100}%;background:${colors[k % colors.length]};animation-delay:${Math.random() * 0.8}s;animation-duration:${2.2 + Math.random() * 1.6}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
        }
      }]);
      t += first ? 900 : 520 + (5 - i) * 40;
    }
    if (rank) {
      steps.push([t, () => q<HTMLElement>('.rankbox').classList.remove('hidden')]);
      steps.push([t + 300, () => this.rollPoints(rank)]);
      t += 1700;
    }
    steps.push([t, () => {
      q<HTMLElement>('.row').classList.remove('hidden');
      q<HTMLElement>('.skip-hint').remove();
    }]);
    const timers = steps.map(([ms, fn]) => window.setTimeout(fn, ms));
    const skip = (e: Event) => {
      if ((e.target as HTMLElement).closest('button')) return;
      timers.forEach((id) => window.clearTimeout(id));
      this.modal.classList.add('instant');
      for (const [, fn] of steps) fn();
      this.modal.removeEventListener('pointerdown', skip);
    };
    this.modal.addEventListener('pointerdown', skip);
    q<HTMLButtonElement>('.again').onclick = () => {
      this.closeModal();
      onAgain();
    };
    q<HTMLButtonElement>('.menu').onclick = () => {
      this.closeModal();
      onMenu();
    };
  }

  /** Rank points count up (or down); a promotion shatters the old badge and forges the new one. */
  private rollPoints(rank: { before: number; after: number }) {
    const box = this.modal.querySelector('.rankbox') as HTMLElement | null;
    if (!box || box.dataset.rolled) return;
    box.dataset.rolled = '1';
    const num = box.querySelector('.num') as HTMLElement;
    const bar = box.querySelector('.prog i') as HTMLElement;
    const a = tierOf(rank.before);
    const b = tierOf(rank.after);
    const instant = this.modal.classList.contains('instant');
    const ms = instant ? 0 : 1100;
    const t0 = performance.now();
    const step = () => {
      const p = ms ? Math.min(1, (performance.now() - t0) / ms) : 1;
      const v = Math.round(rank.before + (rank.after - rank.before) * (1 - Math.pow(1 - p, 3)));
      num.textContent = String(v);
      const tv = tierOf(v);
      bar.style.width = `${Math.round((tv.index === a.index ? tv.progress : tv.index > a.index ? 1 : 0) * 100)}%`;
      if (p < 1) requestAnimationFrame(step);
      else {
        bar.style.width = `${Math.round(b.progress * 100)}%`;
        if (b.index !== a.index) {
          box.classList.add(b.index > a.index ? 'promoted' : 'demoted');
          sfx.play(b.index > a.index ? 'glass' : 'thud', 0.8);
          if (b.index > a.index) window.setTimeout(() => sfx.play('bell', 0.9), instant ? 0 : 350);
        }
      }
    };
    step();
  }
}
