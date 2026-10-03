// Procedural placeholder art, painted once into canvases and used as textures.
// Every piece here is replaced automatically when a matching PNG is dropped into
// web/public/art/ (see assets.ts and docs/08 §6). The look follows docs/07: warm
// coral casino light, a teal table as the only cool colour, soft haze and bloom.

export type Pose = 'idle' | 'smug' | 'nervous' | 'angry' | 'shock' | 'cry' | 'win';
export type HairStyle = 'bob' | 'long' | 'twin' | 'short' | 'fox';

export interface Look {
  color: number; // the character's main colour
  hair: HairStyle;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
function mix(c: number, to: number, t: number): string {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const R = (to >> 16) & 255, G = (to >> 8) & 255, B = to & 255;
  return `rgb(${Math.round(r + (R - r) * t)},${Math.round(g + (G - g) * t)},${Math.round(b + (B - b) * t)})`;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

/** The casino around the table (or the lobby): warm light, light strips converging
 *  on a vanishing point, blurred slot machines and bokeh, haze. */
export function paintRoom(w: number, h: number, vp: { x: number; y: number }, seed = 7): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const rnd = seeded(seed);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#FFD9BC');
  bg.addColorStop(0.38, '#F69375');
  bg.addColorStop(0.72, '#9E595E');
  bg.addColorStop(1, '#3A1015');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // Ceiling: rows of glowing panels in perspective.
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let row = 0; row < 7; row++) {
    const t0 = row / 7, t1 = (row + 0.55) / 7;
    for (let col = -6; col <= 6; col++) {
      const x0 = col * 400, x1 = col * 400 + 250;
      const pt = (x: number, t: number): [number, number] => [lerp(vp.x + x, vp.x, t), lerp(-40, vp.y - 50, t)];
      g.beginPath();
      g.moveTo(...pt(x0, t0));
      g.lineTo(...pt(x1, t0));
      g.lineTo(...pt(x1, t1));
      g.lineTo(...pt(x0, t1));
      g.closePath();
      g.fillStyle = `rgba(255,246,236,${0.72 - row * 0.08})`;
      g.shadowColor = '#FFF4EA';
      g.shadowBlur = 30;
      g.fill();
    }
  }
  g.shadowBlur = 0;

  // Pillars of light
  for (const x of [w * 0.12, w * 0.88]) {
    const gr = g.createLinearGradient(x - 70, 0, x + 70, 0);
    gr.addColorStop(0, 'rgba(255,240,225,0)');
    gr.addColorStop(0.5, 'rgba(255,240,225,0.5)');
    gr.addColorStop(1, 'rgba(255,240,225,0)');
    g.fillStyle = gr;
    g.fillRect(x - 70, h * 0.1, 140, h * 0.5);
  }

  // Far casino: slot machines, neon and bokeh, out of focus.
  g.filter = 'blur(10px)';
  for (let i = 0; i < 9; i++) {
    const x = 40 + i * (w / 9) + rnd() * 30;
    g.globalAlpha = 0.55;
    g.fillStyle = i % 2 ? '#684054' : '#5B2324';
    g.fillRect(x, h * 0.4, 120, h * 0.2);
    g.fillStyle = i % 3 ? '#52C0CF' : '#E04FB0';
    g.fillRect(x + 20, h * 0.42, 80, 46);
  }
  const bokeh = ['#FFE3C8', '#F5E6E7', '#B46997', '#52C0CF', '#FFD36B', '#E04FB0'];
  for (let i = 0; i < 80; i++) {
    g.globalAlpha = 0.3 + rnd() * 0.5;
    g.fillStyle = bokeh[Math.floor(rnd() * bokeh.length)];
    g.beginPath();
    g.arc(rnd() * w, h * 0.22 + rnd() * h * 0.3, 8 + rnd() * 34, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.filter = 'none';

  // Haze around the vanishing point
  const hz = g.createRadialGradient(vp.x, vp.y, 30, vp.x, vp.y, w * 0.45);
  hz.addColorStop(0, 'rgba(255,244,234,0.55)');
  hz.addColorStop(1, 'rgba(255,244,234,0)');
  g.fillStyle = hz;
  g.fillRect(0, 0, w, h);
  return c;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export const TABLE = { cx: 960, cy: 1010, rx: 1180, ry: 470 };

/** The table seen from the player's seat: wooden rim, teal felt, printed line. */
export function paintTable(w: number, h: number): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const { cx, cy, rx, ry } = TABLE;
  g.fillStyle = 'rgba(30,6,8,0.55)';
  g.filter = 'blur(18px)';
  g.beginPath();
  g.ellipse(cx, cy - 10, rx + 30, ry + 30, 0, 0, Math.PI * 2);
  g.fill();
  g.filter = 'none';
  const rim = g.createLinearGradient(0, cy - ry, 0, cy - ry + 120);
  rim.addColorStop(0, '#D06A62');
  rim.addColorStop(0.4, '#943A3F');
  rim.addColorStop(1, '#4A1418');
  g.fillStyle = rim;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  // rim highlight
  g.strokeStyle = 'rgba(255,220,200,0.45)';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(cx, cy, rx - 4, ry - 4, 0, Math.PI * 1.06, Math.PI * 1.94);
  g.stroke();
  const felt = g.createRadialGradient(cx, cy - ry + 160, 40, cx, cy, rx);
  felt.addColorStop(0, '#9BE8EE');
  felt.addColorStop(0.35, '#52C0CF');
  felt.addColorStop(1, '#1D6E7C');
  g.fillStyle = felt;
  g.beginPath();
  g.ellipse(cx, cy + 6, rx - 45, ry - 52, 0, 0, Math.PI * 2);
  g.fill();
  // felt texture
  const rnd = seeded(11);
  g.save();
  g.beginPath();
  g.ellipse(cx, cy + 6, rx - 45, ry - 52, 0, 0, Math.PI * 2);
  g.clip();
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,40,50,0.06)';
    g.fillRect(rnd() * w, cy - ry + rnd() * ry * 2, 2, 2);
  }
  g.restore();
  // printed betting line
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(cx, cy + 20, rx * 0.74, ry * 0.62, 0, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.font = '700 30px "Dela Gothic One", "Noto Sans SC", sans-serif';
  g.textAlign = 'center';
  g.fillText("TEXAS HOLD'EM", cx, cy - ry * 0.22);
  return c;
}

// ---------------------------------------------------------------------------
// Characters (placeholder busts)
// ---------------------------------------------------------------------------

function hairPath(g: CanvasRenderingContext2D, style: HairStyle) {
  g.beginPath();
  // crown and sides
  g.moveTo(-100, 10);
  g.bezierCurveTo(-112, -120, -50, -150, 0, -150);
  g.bezierCurveTo(50, -150, 112, -120, 100, 10);
  const sideLen = style === 'long' ? 330 : style === 'short' ? 20 : 75;
  g.lineTo(100, sideLen);
  g.quadraticCurveTo(84, sideLen + 18, 66, sideLen);
  g.lineTo(66, -6);
  g.lineTo(-66, -6);
  g.lineTo(-66, sideLen);
  g.quadraticCurveTo(-84, sideLen + 18, -100, sideLen);
  g.closePath();
  if (style === 'bob' || style === 'fox') {
    const tall = style === 'fox' ? 200 : 180;
    g.moveTo(-86, -96); g.lineTo(-74, -tall); g.lineTo(-36, -136); g.closePath();
    g.moveTo(86, -96); g.lineTo(74, -tall); g.lineTo(36, -136); g.closePath();
  }
  if (style === 'twin') {
    g.moveTo(-96, -60); g.bezierCurveTo(-210, -40, -200, 180, -150, 260); g.bezierCurveTo(-170, 120, -150, 0, -96, -20); g.closePath();
    g.moveTo(96, -60); g.bezierCurveTo(210, -40, 200, 180, 150, 260); g.bezierCurveTo(170, 120, 150, 0, 96, -20); g.closePath();
  }
  if (style === 'short') {
    for (let i = -3; i <= 3; i++) { g.moveTo(i * 26 - 14, -130); g.lineTo(i * 30, -175 - Math.abs(i) * -4); g.lineTo(i * 26 + 14, -130); g.closePath(); }
  }
}

function drawFace(g: CanvasRenderingContext2D, pose: Pose) {
  const skin = g.createRadialGradient(-20, -10, 10, 0, 10, 80);
  skin.addColorStop(0, '#FFF1E6');
  skin.addColorStop(1, '#F2B8A0');
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(0, 12, 70, 76, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3A1E2A';
  g.fillStyle = '#3A1E2A';
  g.lineCap = 'round';
  g.lineWidth = 6;
  const arcEyes = (up: boolean) => {
    for (const x of [-28, 28]) {
      g.beginPath();
      g.moveTo(x - 16, up ? 12 : 2);
      g.quadraticCurveTo(x, up ? -8 : 18, x + 16, up ? 12 : 2);
      g.stroke();
    }
  };
  const openEyes = (r = 9, lookUp = 0) => {
    for (const x of [-28, 28]) {
      g.fillStyle = '#FFFFFF';
      g.beginPath(); g.ellipse(x, 6, 15, 17, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3A1E2A';
      g.beginPath(); g.arc(x, 8 - lookUp, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FFFFFF';
      g.beginPath(); g.arc(x - 3, 3 - lookUp, 3, 0, Math.PI * 2); g.fill();
    }
  };
  const mouth = (kind: 'smile' | 'grin' | 'flat' | 'frown' | 'o' | 'wobble' | 'smirk') => {
    g.lineWidth = 5;
    g.beginPath();
    if (kind === 'smile') { g.moveTo(-16, 40); g.quadraticCurveTo(0, 54, 16, 40); g.stroke(); }
    if (kind === 'smirk') { g.moveTo(-14, 44); g.quadraticCurveTo(6, 52, 20, 36); g.stroke(); }
    if (kind === 'flat') { g.moveTo(-12, 46); g.lineTo(12, 44); g.stroke(); }
    if (kind === 'frown') { g.moveTo(-16, 50); g.quadraticCurveTo(0, 38, 16, 50); g.stroke(); }
    if (kind === 'wobble') { g.moveTo(-18, 46); g.quadraticCurveTo(-9, 38, 0, 46); g.quadraticCurveTo(9, 54, 18, 46); g.stroke(); }
    if (kind === 'o') { g.fillStyle = '#5A1020'; g.beginPath(); g.ellipse(0, 48, 11, 15, 0, 0, Math.PI * 2); g.fill(); }
    if (kind === 'grin') {
      g.fillStyle = '#5A1020';
      g.moveTo(-30, 36); g.quadraticCurveTo(0, 90, 30, 36); g.closePath(); g.fill();
      g.fillStyle = '#E0506A'; g.beginPath(); g.ellipse(0, 62, 16, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(14, 37); g.lineTo(22, 37); g.lineTo(18, 48); g.closePath(); g.fill();
    }
  };
  switch (pose) {
    case 'idle': openEyes(); mouth('smile'); break;
    case 'smug':
      g.beginPath(); g.moveTo(-44, 6); g.lineTo(-12, 6); g.moveTo(12, 6); g.lineTo(44, 6); g.stroke();
      mouth('smirk'); break;
    case 'nervous':
      openEyes(7); mouth('wobble');
      g.fillStyle = '#7EC8FF'; g.beginPath(); g.moveTo(66, -30); g.quadraticCurveTo(80, -6, 66, 6); g.quadraticCurveTo(52, -6, 66, -30); g.fill();
      break;
    case 'angry':
      openEyes(8);
      g.lineWidth = 7; g.beginPath(); g.moveTo(-48, -18); g.lineTo(-12, -4); g.moveTo(48, -18); g.lineTo(12, -4); g.stroke();
      mouth('frown');
      g.strokeStyle = '#E0304A'; g.lineWidth = 6; g.beginPath(); g.moveTo(52, -66); g.lineTo(70, -48); g.moveTo(70, -66); g.lineTo(52, -48); g.stroke();
      break;
    case 'shock': openEyes(5); mouth('o'); break;
    case 'cry':
      arcEyes(false); mouth('wobble');
      g.fillStyle = '#7EC8FF';
      g.beginPath(); g.ellipse(-30, 34, 7, 18, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(30, 34, 7, 18, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'win': arcEyes(true); mouth('grin'); break;
  }
  // blush
  g.fillStyle = 'rgba(255,120,150,0.7)';
  for (const x of [-46, 46]) { g.beginPath(); g.ellipse(x, 32, 15, 8, 0, 0, Math.PI * 2); g.fill(); }
}

/** A half-body placeholder (600×800, bottom = waist) or, for 'win', arms raised. */
export function paintBust(look: Look, pose: Pose): HTMLCanvasElement {
  const W = 600, H = 800;
  const [c, g] = canvas(W, H);
  const hairHi = mix(look.color, 0xffffff, 0.55);
  const hairLo = mix(look.color, 0x2a1030, 0.15);
  const suitHi = mix(look.color, 0x1a1030, 0.45);
  const suitLo = mix(look.color, 0x120818, 0.75);
  g.translate(W / 2, 300);

  // torso
  const tg = g.createLinearGradient(-150, 0, 150, 0);
  tg.addColorStop(0, suitLo); tg.addColorStop(0.45, suitHi); tg.addColorStop(1, suitLo);
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(-90, 120);
  g.bezierCurveTo(-150, 260, -170, 420, -175, 520);
  g.lineTo(175, 520);
  g.bezierCurveTo(170, 420, 150, 260, 90, 120);
  g.closePath();
  g.fill();

  // arms
  const skin = g.createLinearGradient(0, -300, 0, 200);
  skin.addColorStop(0, '#FFF3EA'); skin.addColorStop(1, '#F0B49C');
  g.fillStyle = skin;
  for (const dir of [-1, 1]) {
    g.beginPath();
    if (pose === 'win') {
      g.moveTo(dir * 70, 120); g.quadraticCurveTo(dir * 170, -20, dir * 230, -170);
      g.lineTo(dir * 280, -150); g.quadraticCurveTo(dir * 220, 30, dir * 110, 190);
      g.closePath(); g.fill();
      g.beginPath(); g.ellipse(dir * 258, -185, 36, 42, dir * 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#FFFFFF'; g.save(); g.translate(dir * 232, -132); g.rotate(dir * 0.6); g.fillRect(-30, -16, 60, 32); g.restore();
      g.fillStyle = skin;
    } else {
      g.moveTo(dir * 92, 130); g.quadraticCurveTo(dir * 160, 260, dir * 150, 500);
      g.lineTo(dir * 112, 500); g.quadraticCurveTo(dir * 120, 280, dir * 64, 170);
      g.closePath(); g.fill();
    }
  }

  // neck, collar, bow tie
  g.fillStyle = '#F6CDB8';
  g.fillRect(-26, 70, 52, 60);
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.moveTo(-44, 118); g.lineTo(0, 140); g.lineTo(44, 118); g.lineTo(40, 134); g.lineTo(0, 156); g.lineTo(-40, 134); g.closePath(); g.fill();
  g.fillStyle = '#2A1840';
  g.beginPath(); g.moveTo(-32, 122); g.lineTo(0, 136); g.lineTo(-32, 152); g.closePath(); g.moveTo(32, 122); g.lineTo(0, 136); g.lineTo(32, 152); g.closePath(); g.fill();

  // hair behind + face + bangs
  const hg = g.createLinearGradient(0, -200, 0, 120);
  hg.addColorStop(0, hairHi); hg.addColorStop(1, hairLo);
  hairPath(g, look.hair);
  g.fillStyle = hg;
  g.fill();
  drawFace(g, pose);
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(-74, -6);
  g.bezierCurveTo(-66, -98, 66, -98, 74, -6);
  g.lineTo(52, -20); g.lineTo(34, -2); g.lineTo(14, -22); g.lineTo(-8, -2); g.lineTo(-30, -20); g.lineTo(-50, -2);
  g.closePath();
  g.fill();
  // hair shine
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 9;
  g.beginPath(); g.arc(-18, -70, 62, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  // warm rim light along the silhouette
  g.save();
  g.globalCompositeOperation = 'lighter';
  hairPath(g, look.hair);
  g.strokeStyle = 'rgba(255,214,170,0.45)';
  g.lineWidth = 6;
  g.shadowColor = '#FFD6AA';
  g.shadowBlur = 26;
  g.stroke();
  g.restore();
  return c;
}

// ---------------------------------------------------------------------------
// Small textures
// ---------------------------------------------------------------------------

export function paintChip(size = 64, face = 0x1e1a22, stripe = 0xf7f2ee): HTMLCanvasElement {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  g.translate(r, r);
  g.fillStyle = hex(face);
  g.beginPath(); g.arc(0, 0, r - 1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hex(stripe);
  g.lineWidth = r * 0.22;
  g.setLineDash([r * 0.42, r * 0.36]);
  g.beginPath(); g.arc(0, 0, r * 0.74, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, r * 0.45, 0, Math.PI * 2); g.stroke();
  return c;
}

export function paintGlow(size = 128, color = '#FFF4EA'): HTMLCanvasElement {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Darkened edges; `strength` 0..1. */
export function paintVignette(w: number, h: number, color = '48,11,11'): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const v = g.createRadialGradient(w / 2, h * 0.45, h * 0.3, w / 2, h / 2, w * 0.62);
  v.addColorStop(0, `rgba(${color},0)`);
  v.addColorStop(0.6, `rgba(${color},0.12)`);
  v.addColorStop(1, `rgba(${color},0.85)`);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return c;
}

/** Dark spectators in the foreground, used to frame big moments. */
export function paintForeground(w: number, h: number): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const rnd = seeded(5);
  g.fillStyle = '#2A0A0C';
  g.beginPath(); g.ellipse(w * 0.13, h * 1.03, w * 0.18, h * 0.21, 0, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(w * 0.08 + rnd() * w * 0.11, h * 0.74 + rnd() * h * 0.12, 34 + rnd() * 20, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.ellipse(w * 0.88, h * 1.04, w * 0.19, h * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(w * 0.885, h * 0.77, 130, 150, 0, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(246,147,117,0.5)';
  g.lineWidth = 6;
  g.shadowColor = '#F69375';
  g.shadowBlur = 25;
  g.beginPath(); g.arc(w * 0.885, h * 0.77, 140, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
  g.beginPath(); g.arc(w * 0.135, h * 0.8, 120, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  return c;
}
