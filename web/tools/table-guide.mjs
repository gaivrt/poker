// Renders the composition guide for painting the table (docs/11 §4.3): the room
// background as the game places it, with flat shapes exactly where the table,
// rail and felt are. Upload it to the image tool and repaint it in place.
//
//   node tools/table-guide.mjs [out.png]
import sharp from 'sharp';
import { existsSync } from 'node:fs';

const out = process.argv[2] ?? '../art-src/guides/table-guide.png';
// Same numbers as TABLE in src/stage/painter.ts.
const T = { cx: 960, cy: 1010, rx: 1180, ry: 470 };
const W = 1920, H = 1080;

const bgPath = ['public/art/backgrounds/table.webp', 'public/art/backgrounds/table.png'].find(existsSync);
// The game stretches the background to 2000×1130 at (-40, -25).
const base = bgPath
  ? sharp(await sharp(bgPath).resize(2000, 1130, { fit: 'fill' }).extract({ left: 40, top: 25, width: W, height: H }).toBuffer())
  : sharp({ create: { width: W, height: H, channels: 3, background: '#2a2622' } });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="pool" cx="${T.cx}" cy="${T.cy - 250}" r="${T.rx * 0.9}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4e7266"/><stop offset="0.5" stop-color="#2c4a41"/><stop offset="1" stop-color="#14201c"/>
    </radialGradient>
  </defs>
  <ellipse cx="${T.cx}" cy="${T.cy}" rx="${T.rx}" ry="${T.ry}" fill="#1b1714"/>
  <ellipse cx="${T.cx}" cy="${T.cy + 6}" rx="${T.rx - 40}" ry="${T.ry - 47}" fill="none" stroke="#9c8a6a" stroke-width="5"/>
  <ellipse cx="${T.cx}" cy="${T.cy + 6}" rx="${T.rx - 45}" ry="${T.ry - 52}" fill="url(#pool)"/>
</svg>`;

await base.composite([{ input: Buffer.from(svg) }]).png().toFile(out);
console.log(`${out}${bgPath ? '' : ' (no background art yet: plain backdrop)'}`);
