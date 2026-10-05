// Builds the offline demo as one HTML page (everything inlined) plus the art files next
// to it: dist-demo/index.html and dist-demo/art/... Used to publish the playable demo.
//
//   node tools/build-demo.mjs
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';

const root = join(import.meta.dirname, '..');
const tmp = join(root, 'dist-demo-tmp');
const out = join(root, 'dist-demo');
process.env.VITE_OFFLINE = '1';

await build({
  root,
  logLevel: 'warn',
  build: {
    outDir: tmp,
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { codeSplitting: false } },
  },
});

const assets = join(tmp, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
if (js.length !== 1) throw new Error(`expected one script, got ${js.join(', ')}`);
const script = readFileSync(join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const title = '牌桌心理战';
const fonts = /<link href="(https:\/\/fonts\.googleapis\.com[^"]+)"/.exec(html)?.[1];
const body = /<body>([\s\S]*?)<script/.exec(html)?.[1].trim() ?? '';

const page = [
  '<!doctype html>',
  '<html lang="zh-CN"><head><meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  `<title>${title}</title>`,
  fonts ? `<link rel="stylesheet" href="${fonts}">` : '',
  `<style>${css}\n:root { color-scheme: dark; }</style>`,
  '</head><body>',
  body,
  `<script type="module">${script}</script>`,
  '</body></html>',
].join('\n');

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'public', 'art'), join(out, 'art'), { recursive: true, filter: (p) => !p.endsWith('README.md') });
writeFileSync(join(out, 'index.html'), page);
rmSync(tmp, { recursive: true, force: true });
console.log(`dist-demo/index.html ${(page.length / 1024).toFixed(0)} KB`);
