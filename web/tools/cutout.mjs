// Cuts a character off its flat background (docs/11 §1: solid #808080) and
// writes a transparent WebP for web/public/art/.
//
//   node tools/cutout.mjs <in> <out.webp> [--height N] [--bottom FRACTION]
//
// --bottom keeps only the top FRACTION of the image (e.g. 0.75 to crop a
// half-body portrait at the hips); --height resizes the result to N pixels tall.
// Only background pixels connected to the image border are removed, so grey
// details inside the figure survive; edge pixels get partial alpha with the
// background colour taken back out of them.
import sharp from 'sharp';

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/cutout.mjs <in> <out.webp> [--height N] [--bottom FRACTION]');
  process.exit(1);
}
const opt = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? Number(rest[i + 1]) : undefined;
};
const NEAR = 18; // colour distance that is surely background
const FAR = 64;  // colour distance that is surely figure

const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];

// Background colour: median of the border pixels.
const border = [];
for (let x = 0; x < w; x++) border.push(px(x), px((h - 1) * w + x));
for (let y = 0; y < h; y++) border.push(px(y * w), px(y * w + w - 1));
const bg = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1]);
const dist = (i) => Math.hypot(data[i * 3] - bg[0], data[i * 3 + 1] - bg[1], data[i * 3 + 2] - bg[2]);

// Flood fill from the border through background-like pixels.
const alpha = new Float32Array(w * h).fill(1);
const seen = new Uint8Array(w * h);
const stack = [];
for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
while (stack.length) {
  const i = stack.pop();
  if (seen[i]) continue;
  seen[i] = 1;
  const d = dist(i);
  if (d >= FAR) continue;
  alpha[i] = Math.max(0, (d - NEAR) / (FAR - NEAR));
  const x = i % w, y = (i / w) | 0;
  if (x > 0) stack.push(i - 1);
  if (x < w - 1) stack.push(i + 1);
  if (y > 0) stack.push(i - w);
  if (y < h - 1) stack.push(i + w);
}

const out = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) {
  const a = alpha[i];
  for (let c = 0; c < 3; c++) {
    // take the background back out of semi-transparent edge pixels
    const v = a > 0 ? (data[i * 3 + c] - (1 - a) * bg[c]) / a : 0;
    out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
  }
  out[i * 4 + 3] = Math.round(a * 255);
}

let img = sharp(out, { raw: { width: w, height: h, channels: 4 } });
const bottom = opt('--bottom');
if (bottom) img = sharp(await img.extract({ left: 0, top: 0, width: w, height: Math.round(h * bottom) }).png().toBuffer());
const height = opt('--height');
if (height) img = img.resize({ height });
await img.webp({ quality: 90, alphaQuality: 100 }).toFile(output);
console.log(`${output}: background rgb(${bg.join(',')})`);
