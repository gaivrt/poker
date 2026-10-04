// Procedural placeholder art, painted once into canvases and used as textures.
// Every piece here is replaced automatically when a matching PNG is dropped into
// web/public/art/ (see assets.ts and docs/08 §6).
//
// The look follows docs/10: a warm, quiet private card room in dark neutrals, soft
// light, a dark sage table, beige trim and a single terracotta accent.
// Until the character art arrives, the players are silhouettes with rim light.

export type Pose = 'idle' | 'smug' | 'nervous' | 'angry' | 'shock' | 'cry' | 'win';
export type HairStyle = 'bob' | 'long' | 'twin' | 'short' | 'fox';

export interface Look {
  color: number; // the character's main colour
  hair: HairStyle;
}

/** The palette (docs/10 §2): warm dark neutrals, beige frames, one terracotta accent. */
export const PAL = {
  night: 0x1a1918,   // warm near-black
  plum: 0x262624,    // container
  wine: 0x33302c,    // walls
  leather: 0x1f1e1d,
  terracotta: 0xd97757, // the one loud colour: calls to action, all-in, danger
  beige: 0xe4dbcd,   // frames, thin lines
  paper: 0xfaf9f5,   // main text and highlights
  muted: 0x8f877b,   // secondary
  ivory: 0xf2ece0,   // card faces
  blue: 0x6a9ccd,
  sage: 0xbdd2cb,
  felt: 0x2c4a41,    // dark sage felt
  feltHi: 0x47695e,
};

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
function mix(c: number, to: number, t: number): string {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const R = (to >> 16) & 255, G = (to >> 8) & 255, B = to & 255;
  return `rgb(${Math.round(r + (R - r) * t)},${Math.round(g + (G - g) * t)},${Math.round(b + (B - b) * t)})`;
}
function rgba(c: number, a: number): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
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

/** A dark casino lounge: wine walls with gilded art-deco pilasters, velvet curtains,
 *  chandeliers glowing above, warm bokeh far away. `vp` is where the eye rests. */
export function paintRoom(w: number, h: number, vp: { x: number; y: number }, seed = 7): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const rnd = seeded(seed);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#161514');
  bg.addColorStop(0.35, '#2b2825');
  bg.addColorStop(0.62, '#23211e');
  bg.addColorStop(1, '#100f0e');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // warm glow behind the focus
  const glow = g.createRadialGradient(vp.x, vp.y, 20, vp.x, vp.y, w * 0.55);
  glow.addColorStop(0, 'rgba(250,240,220,0.20)');
  glow.addColorStop(0.4, 'rgba(217,119,87,0.06)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  // Back wall: gilded pilasters and arches, slightly out of focus.
  g.filter = 'blur(3px)';
  const wallTop = h * 0.12, wallBot = h * 0.62;
  for (let i = 0; i < 9; i++) {
    const x = (i + 0.5) * (w / 9);
    const gr = g.createLinearGradient(x - 18, 0, x + 18, 0);
    gr.addColorStop(0, rgba(PAL.muted, 0));
    gr.addColorStop(0.5, rgba(PAL.beige, 0.28));
    gr.addColorStop(1, rgba(PAL.muted, 0));
    g.fillStyle = gr;
    g.fillRect(x - 18, wallTop, 36, wallBot - wallTop);
    // fluting
    g.strokeStyle = rgba(PAL.paper, 0.12);
    g.lineWidth = 2;
    for (const dx of [-8, 0, 8]) {
      g.beginPath();
      g.moveTo(x + dx, wallTop + 20);
      g.lineTo(x + dx, wallBot - 20);
      g.stroke();
    }
    // arch between pilasters
    if (i < 8) {
      const ax = x + w / 18;
      g.strokeStyle = rgba(PAL.beige, 0.16);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(ax, wallTop + 120, w / 18 - 26, Math.PI, 0);
      g.stroke();
      // sunburst inside the arch
      g.strokeStyle = rgba(PAL.beige, 0.07);
      g.lineWidth = 2;
      for (let k = 1; k < 8; k++) {
        const a = Math.PI + (k / 8) * Math.PI;
        g.beginPath();
        g.moveTo(ax, wallTop + 120);
        g.lineTo(ax + Math.cos(a) * (w / 18 - 30), wallTop + 120 + Math.sin(a) * (w / 18 - 30));
        g.stroke();
      }
    }
  }
  // a gold cornice line
  g.fillStyle = rgba(PAL.beige, 0.2);
  g.fillRect(0, wallTop - 6, w, 4);
  g.filter = 'none';

  // Far away: tables, people and slot lights, all bokeh.
  g.filter = 'blur(14px)';
  for (let i = 0; i < 12; i++) {
    g.globalAlpha = 0.5;
    g.fillStyle = i % 2 ? '#34302b' : '#1c1b19';
    g.beginPath();
    g.ellipse(rnd() * w, h * 0.6 + rnd() * h * 0.08, 90 + rnd() * 80, 40 + rnd() * 30, 0, 0, Math.PI * 2);
    g.fill();
  }
  const bokeh = ['#F0E6D2', '#E4DBCD', '#D9C7A8', '#D97757', '#BDD2CB', '#FAF9F5'];
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = 0.18 + rnd() * 0.4;
    g.fillStyle = bokeh[Math.floor(rnd() * bokeh.length)];
    g.beginPath();
    g.arc(rnd() * w, h * 0.3 + rnd() * h * 0.32, 6 + rnd() * 30, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.filter = 'none';

  // Chandeliers: a warm halo, a crown of crystals, sparkle.
  const chands = [0.18, 0.5, 0.82].map((t) => ({ x: w * t + (rnd() - 0.5) * 60, y: h * (0.06 + rnd() * 0.05) }));
  for (const ch of chands) {
    const halo = g.createRadialGradient(ch.x, ch.y, 4, ch.x, ch.y, 260);
    halo.addColorStop(0, 'rgba(250,244,230,0.55)');
    halo.addColorStop(0.25, 'rgba(228,219,205,0.16)');
    halo.addColorStop(1, 'rgba(228,219,205,0)');
    g.fillStyle = halo;
    g.fillRect(ch.x - 280, ch.y - 280, 560, 560);
    g.filter = 'blur(1.5px)';
    for (let k = 0; k < 40; k++) {
      const a = rnd() * Math.PI;
      const r = 20 + rnd() * 90;
      g.fillStyle = rnd() < 0.3 ? '#FFFFFF' : '#F0E6D2';
      g.globalAlpha = 0.5 + rnd() * 0.5;
      g.beginPath();
      g.arc(ch.x + Math.cos(a) * r, ch.y + Math.sin(a) * r * 0.55, 1.5 + rnd() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.filter = 'none';
  }

  // Velvet curtains at both edges.
  for (const side of [0, 1]) {
    const x0 = side ? w - 210 : 0;
    for (let f = 0; f < 6; f++) {
      const fx = x0 + f * 35;
      const gr = g.createLinearGradient(fx, 0, fx + 35, 0);
      gr.addColorStop(0, '#1d1c1a');
      gr.addColorStop(0.5, f % 2 ? '#3d3833' : '#332f2b');
      gr.addColorStop(1, '#171614');
      g.fillStyle = gr;
      g.fillRect(fx, 0, 36, h);
    }
    const fade = g.createLinearGradient(side ? w - 210 : 210, 0, side ? w - 320 : 320, 0);
    fade.addColorStop(0, 'rgba(16,15,14,0.55)');
    fade.addColorStop(1, 'rgba(16,15,14,0)');
    g.fillStyle = fade;
    g.fillRect(side ? w - 320 : 210, 0, 110, h);
  }

  // haze and a darker floor
  const floor = g.createLinearGradient(0, h * 0.55, 0, h);
  floor.addColorStop(0, 'rgba(14,13,12,0)');
  floor.addColorStop(1, 'rgba(14,13,12,0.85)');
  g.fillStyle = floor;
  g.fillRect(0, h * 0.55, w, h * 0.45);
  return c;
}

/** A soft cone of light from above onto the table (drawn additively). */
export function paintBeam(w: number, h: number, x: number, top: number, bottom: number, spread: number): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const gr = g.createLinearGradient(0, top, 0, bottom);
  gr.addColorStop(0, 'rgba(255,230,180,0.0)');
  gr.addColorStop(0.25, 'rgba(250,240,222,0.08)');
  gr.addColorStop(1, 'rgba(250,240,222,0.14)');
  g.filter = 'blur(30px)';
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x - 120, top);
  g.lineTo(x + 120, top);
  g.lineTo(x + spread, bottom);
  g.lineTo(x - spread, bottom);
  g.closePath();
  g.fill();
  g.filter = 'none';
  return c;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export const TABLE = { cx: 960, cy: 1010, rx: 1180, ry: 470 };

/** The table seen from the player's seat: black leather rail with a gold inlay,
 *  emerald felt lit by a spotlight over the board, a gilded betting line. */
export function paintTable(w: number, h: number): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const { cx, cy, rx, ry } = TABLE;
  const ell = (dx: number, dy: number, a0 = 0, a1 = Math.PI * 2, oy = 0) => {
    g.beginPath();
    g.ellipse(cx, cy + oy, rx - dx, ry - dy, 0, a0, a1);
  };
  // shadow on the floor
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.filter = 'blur(24px)';
  ell(-40, -40, 0, Math.PI * 2, -10);
  g.fill();
  g.filter = 'none';

  // leather rail
  const rim = g.createLinearGradient(0, cy - ry, 0, cy - ry + 110);
  rim.addColorStop(0, '#45403a');
  rim.addColorStop(0.18, '#2a2724');
  rim.addColorStop(1, '#0e0d0c');
  g.fillStyle = rim;
  ell(0, 0);
  g.fill();
  // stitching and specular along the rail
  g.strokeStyle = 'rgba(255,235,210,0.28)';
  g.lineWidth = 3;
  ell(10, 8, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  g.setLineDash([7, 9]);
  g.strokeStyle = rgba(PAL.beige, 0.25);
  g.lineWidth = 1.5;
  ell(26, 22, Math.PI * 1.03, Math.PI * 1.97);
  g.stroke();
  g.setLineDash([]);

  // gold inlay between rail and felt
  g.strokeStyle = rgba(PAL.beige, 0.6);
  g.lineWidth = 5;
  g.shadowColor = rgba(PAL.paper, 0.8);
  g.shadowBlur = 14;
  ell(40, 47, 0, Math.PI * 2, 6);
  g.stroke();
  g.shadowBlur = 0;

  // felt with the spotlight pool over the board
  const felt = g.createRadialGradient(cx, cy - 250, 30, cx, cy - 120, rx * 0.95);
  felt.addColorStop(0, hex(0x5d8073));
  felt.addColorStop(0.22, hex(PAL.feltHi));
  felt.addColorStop(0.55, hex(PAL.felt));
  felt.addColorStop(1, '#121c19');
  g.fillStyle = felt;
  ell(45, 52, 0, Math.PI * 2, 6);
  g.fill();

  // felt fibre
  const rnd = seeded(11);
  g.save();
  ell(45, 52, 0, Math.PI * 2, 6);
  g.clip();
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,20,15,0.08)';
    g.fillRect(rnd() * w, cy - ry + rnd() * ry * 2, 2, 1.5);
  }
  // the rail's shadow falling on the felt edge
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 40;
  g.filter = 'blur(14px)';
  ell(45, 52, 0, Math.PI * 2, 6);
  g.stroke();
  g.filter = 'none';
  g.restore();

  // gilded betting line, double
  g.strokeStyle = rgba(PAL.beige, 0.55);
  g.lineWidth = 2.5;
  g.beginPath();
  g.ellipse(cx, cy + 20, rx * 0.74, ry * 0.62, 0, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();
  g.strokeStyle = rgba(PAL.beige, 0.25);
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(cx, cy + 20, rx * 0.74 - 14, ry * 0.62 - 10, 0, Math.PI * 1.09, Math.PI * 1.91);
  g.stroke();

  // the house crest, printed in gold leaf
  g.save();
  g.translate(cx, cy - ry * 0.21);
  g.scale(1, 0.55);
  g.fillStyle = rgba(PAL.beige, 0.22);
  g.font = 'italic 700 46px Georgia, "Noto Serif SC", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('HOLD\u2019EM', 0, 0);
  g.strokeStyle = rgba(PAL.beige, 0.2);
  g.lineWidth = 2;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 210, 0);
    g.lineTo(s * 330, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(s * 196, -8);
    g.lineTo(s * 204, 0);
    g.lineTo(s * 196, 8);
    g.lineTo(s * 188, 0);
    g.closePath();
    g.fillStyle = rgba(PAL.beige, 0.22);
    g.fill();
  }
  g.restore();
  return c;
}

// ---------------------------------------------------------------------------
// Characters: silhouettes with rim light (until the illustrations arrive)
// ---------------------------------------------------------------------------

function hairPath(p: Path2D, style: HairStyle) {
  // crown and sides
  p.moveTo(-96, 14);
  p.bezierCurveTo(-110, -118, -50, -150, 0, -150);
  p.bezierCurveTo(50, -150, 110, -118, 96, 14);
  const sideLen = style === 'long' ? 360 : style === 'short' ? 30 : style === 'bob' || style === 'fox' ? 70 : 120;
  p.bezierCurveTo(104, sideLen * 0.5, 112, sideLen, 86, sideLen + 20);
  p.lineTo(62, sideLen);
  p.lineTo(60, 0);
  p.lineTo(-60, 0);
  p.lineTo(-62, sideLen);
  p.lineTo(-86, sideLen + 20);
  p.bezierCurveTo(-112, sideLen, -104, sideLen * 0.5, -96, 14);
  p.closePath();
  if (style === 'bob' || style === 'fox') {
    const tall = style === 'fox' ? 210 : 190;
    const tilt = style === 'fox' ? 20 : 0;
    p.moveTo(-84, -100); p.lineTo(-78 - tilt, -tall); p.lineTo(-34, -138); p.closePath();
    p.moveTo(84, -100); p.lineTo(78 + tilt, -tall); p.lineTo(34, -138); p.closePath();
  }
  if (style === 'twin') {
    p.moveTo(-90, -70); p.bezierCurveTo(-230, -50, -220, 220, -150, 330); p.bezierCurveTo(-180, 160, -160, 10, -92, -20); p.closePath();
    p.moveTo(90, -70); p.bezierCurveTo(230, -50, 220, 220, 150, 330); p.bezierCurveTo(180, 160, 160, 10, 92, -20); p.closePath();
  }
  if (style === 'short') {
    for (let i = -3; i <= 3; i++) {
      p.moveTo(i * 26 - 14, -128);
      p.lineTo(i * 30, -172 + Math.abs(i) * 4);
      p.lineTo(i * 26 + 14, -128);
      p.closePath();
    }
  }
}

/** Head, neck, bare shoulders and arms of a woman in an evening dress (or arms raised). */
function bodyPath(p: Path2D, pose: Pose) {
  // head
  p.ellipse(0, 10, 68, 80, 0, 0, Math.PI * 2);
  // neck and shoulders down to the table edge
  p.moveTo(-26, 70);
  p.lineTo(-24, 118);
  p.bezierCurveTo(-60, 132, -130, 136, -158, 168);
  if (pose === 'win') {
    // arms up
    p.bezierCurveTo(-190, 120, -220, 0, -250, -150);
    p.bezierCurveTo(-262, -200, -232, -230, -206, -196);
    p.bezierCurveTo(-180, -120, -150, 40, -120, 140);
    p.bezierCurveTo(-140, 300, -150, 420, -150, 520);
    p.lineTo(150, 520);
    p.bezierCurveTo(150, 420, 140, 300, 120, 140);
    p.bezierCurveTo(150, 40, 180, -120, 206, -196);
    p.bezierCurveTo(232, -230, 262, -200, 250, -150);
    p.bezierCurveTo(220, 0, 190, 120, 158, 168);
  } else {
    p.bezierCurveTo(-182, 196, -188, 300, -182, 520);
    p.lineTo(182, 520);
    p.bezierCurveTo(188, 300, 182, 196, 158, 168);
  }
  p.bezierCurveTo(130, 136, 60, 132, 24, 118);
  p.lineTo(26, 70);
  p.closePath();
}

/** Eyes glowing in the dark, shaped by the mood. */
function eyes(g: CanvasRenderingContext2D, pose: Pose, color: number) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.shadowColor = hex(color);
  g.shadowBlur = 18;
  g.fillStyle = mix(color, 0xffffff, 0.55);
  g.strokeStyle = mix(color, 0xffffff, 0.55);
  g.lineCap = 'round';
  g.lineWidth = 5;
  for (const s of [-1, 1]) {
    const x = s * 27;
    g.beginPath();
    switch (pose) {
      case 'smug': g.moveTo(x - 15, 10); g.quadraticCurveTo(x, 4, x + 15, 10); g.stroke(); break;
      case 'angry': g.moveTo(x - 14, s < 0 ? 2 : 13); g.lineTo(x + 14, s < 0 ? 13 : 2); g.stroke(); break;
      case 'win':
      case 'cry': g.moveTo(x - 14, 12); g.quadraticCurveTo(x, -2, x + 14, 12); g.stroke(); break;
      case 'shock': g.arc(x, 8, 5, 0, Math.PI * 2); g.fill(); break;
      case 'nervous': g.ellipse(x, 8, 9, 5, 0, 0, Math.PI * 2); g.fill(); break;
      default: g.ellipse(x, 8, 13, 4.5, s * 0.08, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

/** A half-body placeholder (600×800, bottom = waist): a silhouette against the light,
 *  rim-lit in the character's colour, gold at the throat, eyes catching the light. */
export function paintBust(look: Look, pose: Pose): HTMLCanvasElement {
  const W = 600, H = 800, OX = W / 2, OY = 290;
  const shape = new Path2D();
  hairPath(shape, look.hair);
  bodyPath(shape, pose);

  // 1. the solid figure (one union of hair, head and body), with a satin dress
  const [fig, f] = canvas(W, H);
  f.translate(OX, OY);
  const fill = f.createLinearGradient(0, -220, 0, 520);
  fill.addColorStop(0, mix(look.color, 0x08050a, 0.78));
  fill.addColorStop(0.45, mix(look.color, 0x08050a, 0.88));
  fill.addColorStop(1, '#060407');
  f.fillStyle = fill;
  f.fill(shape, 'nonzero');
  f.save();
  f.globalCompositeOperation = 'source-atop';
  const dress = new Path2D();
  dress.moveTo(-200, 232);
  dress.bezierCurveTo(-90, 196, -60, 300, 0, 252);
  dress.bezierCurveTo(60, 300, 90, 196, 200, 232);
  dress.lineTo(200, 560);
  dress.lineTo(-200, 560);
  dress.closePath();
  const silk = f.createLinearGradient(-200, 0, 200, 0);
  silk.addColorStop(0, mix(look.color, 0x000000, 0.88));
  silk.addColorStop(0.4, mix(look.color, 0x000000, 0.58));
  silk.addColorStop(0.52, mix(look.color, 0x000000, 0.72));
  silk.addColorStop(1, mix(look.color, 0x000000, 0.92));
  f.fillStyle = silk;
  f.fill(dress);
  // soft light on the hair crown and the shoulders, from the lamps above
  const top = f.createRadialGradient(-30, -150, 10, -10, -80, 220);
  top.addColorStop(0, rgba(look.color, 0.35));
  top.addColorStop(1, rgba(look.color, 0));
  f.fillStyle = top;
  f.fillRect(-300, -300, 600, 400);
  f.restore();

  // 2. the same shape as a flat colour, for the glow and the rim
  const [lit, l] = canvas(W, H);
  l.drawImage(fig, 0, 0);
  l.globalCompositeOperation = 'source-in';
  l.fillStyle = mix(look.color, 0xffffff, 0.45);
  l.fillRect(0, 0, W, H);

  const [c, g] = canvas(W, H);
  // halo behind her, in her colour
  g.save();
  g.shadowColor = hex(look.color);
  g.shadowBlur = 46;
  g.globalAlpha = 0.85;
  g.drawImage(lit, 0, 0);
  g.restore();
  // a thin rim of light along the top and the sides (back light from above)
  g.drawImage(lit, -3, -4);
  g.drawImage(lit, 3, -4);
  g.globalAlpha = 0.6;
  g.drawImage(lit, 0, -6);
  g.globalAlpha = 1;
  // the figure itself on top: only the rim stays visible around it
  g.drawImage(fig, 0, 0);
  // fade the bottom into the dark (she sits behind the table)
  g.globalCompositeOperation = 'destination-out';
  const fade = g.createLinearGradient(0, H - 160, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = fade;
  g.fillRect(0, H - 160, W, 160);
  g.globalCompositeOperation = 'source-over';

  // gold necklace and earrings
  g.translate(OX, OY);
  g.save();
  g.shadowColor = 'rgba(255,255,255,0.8)';
  g.shadowBlur = 10;
  g.fillStyle = hex(PAL.paper);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    g.beginPath();
    g.arc(-46 + t * 92, 128 + Math.sin(t * Math.PI) * 26, i === 6 ? 7 : 3, 0, Math.PI * 2);
    g.fill();
  }
  if (pose !== 'win') {
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(sx * 66, 54, 4, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  eyes(g, pose, look.color);
  return c;
}

// ---------------------------------------------------------------------------
// Chips and small textures
// ---------------------------------------------------------------------------

/** Chip colours: face, edge spots. */
export const CHIP_COLORS: [number, number][] = [
  [0x2b2a27, PAL.beige],     // black and gold
  [PAL.terracotta, PAL.ivory], // crimson
  [PAL.ivory, PAL.terracotta], // ivory
  [0x4a2a7a, PAL.beige],     // violet
];

/** A chip seen from above (flying chips, particles). */
export function paintChip(size = 64, face = 0x2b2a27, stripe = PAL.beige): HTMLCanvasElement {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  g.translate(r, r);
  const body = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  body.addColorStop(0, mix(face, 0xffffff, 0.25));
  body.addColorStop(1, hex(face));
  g.fillStyle = body;
  g.beginPath(); g.arc(0, 0, r - 1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hex(stripe);
  g.lineWidth = r * 0.2;
  g.setLineDash([r * 0.34, r * 0.4]);
  g.beginPath(); g.arc(0, 0, r * 0.82, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = rgba(stripe, 0.8);
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, r * 0.55, 0, Math.PI * 2); g.stroke();
  g.fillStyle = rgba(stripe, 0.25);
  g.beginPath(); g.arc(0, 0, r * 0.5, 0, Math.PI * 2); g.fill();
  return c;
}

export function paintGlow(size = 128, color = '#FAF9F5'): HTMLCanvasElement {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Darkened edges. */
export function paintVignette(w: number, h: number, color = '8,3,8'): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const v = g.createRadialGradient(w / 2, h * 0.5, h * 0.32, w / 2, h / 2, w * 0.6);
  v.addColorStop(0, `rgba(${color},0)`);
  v.addColorStop(0.55, `rgba(${color},0.18)`);
  v.addColorStop(1, `rgba(${color},0.9)`);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return c;
}

/** Dark spectators in the foreground, used to frame big moments. */
export function paintForeground(w: number, h: number): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const rnd = seeded(5);
  g.fillStyle = '#0e0d0c';
  g.beginPath(); g.ellipse(w * 0.13, h * 1.03, w * 0.18, h * 0.21, 0, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(w * 0.08 + rnd() * w * 0.11, h * 0.74 + rnd() * h * 0.12, 34 + rnd() * 20, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.ellipse(w * 0.88, h * 1.04, w * 0.19, h * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(w * 0.885, h * 0.77, 130, 150, 0, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba(PAL.beige, 0.45);
  g.lineWidth = 5;
  g.shadowColor = hex(PAL.beige);
  g.shadowBlur = 25;
  g.beginPath(); g.arc(w * 0.885, h * 0.77, 140, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
  g.beginPath(); g.arc(w * 0.135, h * 0.8, 120, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  return c;
}
