import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Lists everything under public/art/ so the game can swap placeholder art for real
// PNGs (and audio) without code changes: `import files from 'virtual:art-manifest'`.
function artManifest(): Plugin {
  const id = 'virtual:art-manifest';
  const root = join(__dirname, 'public', 'art');
  const walk = (dir: string): string[] => {
    let out: string[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const name of entries) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out = out.concat(walk(p));
      else if (/\.(png|jpe?g|webp|mp3|ogg|wav)$/i.test(name)) out.push(relative(root, p).split('\\').join('/'));
    }
    return out;
  };
  return {
    name: 'art-manifest',
    resolveId: (source) => (source === id ? '\0' + id : null),
    load: (source) => (source === '\0' + id ? `export default ${JSON.stringify(walk(root))};` : null),
    configureServer(server) {
      // New art dropped in while the dev server runs: reload with a fresh manifest.
      server.watcher.add(root);
      const reload = (file: string) => {
        if (!file.startsWith(root)) return;
        const mod = server.moduleGraph.getModuleById('\0' + id);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
    },
  };
}

// Relative base so the built game runs from any folder or static host.
export default defineConfig({
  base: './',
  plugins: [artManifest()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
