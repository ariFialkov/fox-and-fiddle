// Vite plugin: indexes the reskin art unpacked into public/western/ and exposes it to the game as
// `virtual:reskin-files`. The game asks for files by name (as the art drops name them), wherever
// they sit inside the folder. Unpack the drops in order (W1 art, W1 models, W2, W4.4, W5, W6) so a
// later drop overwrites a repeated file name; if the same name still exists in two subfolders, the
// path that sorts last wins and a warning is printed.
import fs from 'node:fs';
import path from 'node:path';
import { MODEL_EXT } from './unpack-glb.js';

const VIRTUAL = 'virtual:reskin-files';
const RESOLVED = '\0' + VIRTUAL;
const SKIP_DIRS = new Set(['preview', 'screens', '__MACOSX']);   // review material, not game assets
const EXT = /\.(glb|gltf|png|jpe?g|webp|webm|mp4|json)$/i;

export function scanReskin(root) {
  const base = path.join(root, 'public', 'western');
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); }
      else if (EXT.test(e.name)) files.push(path.relative(path.join(root, 'public'), full).split(path.sep).join('/'));
    }
  };
  walk(base);
  const byName = {}, warnings = [];
  for (const f of files) {
    const name = f.split('/').pop().toLowerCase();
    if (byName[name] && byName[name] !== f) warnings.push(`${name}: using ${f} over ${byName[name]}`);
    byName[name] = f;
  }
  return { files, byName, warnings };
}

export default function reskinFiles() {
  let root = process.cwd(), building = false;
  return {
    name: 'reskin-files',
    configResolved(cfg) { root = cfg.root; building = cfg.command === 'build'; },
    resolveId(id) { return id === VIRTUAL ? RESOLVED : null; },
    load(id) {
      if (id !== RESOLVED) return null;
      const scan = scanReskin(root);
      for (const w of scan.warnings) this.warn(`reskin: two files share a name, ${w}`);
      // a build ships the models as glTF JSON (scripts/unpack-glb.js): same names to ask for, new files to fetch
      if (building) {
        const ext = '.' + MODEL_EXT;
        scan.files = scan.files.map((f) => f.replace(/\.glb$/i, ext));
        for (const k of Object.keys(scan.byName)) scan.byName[k] = scan.byName[k].replace(/\.glb$/i, ext);
      }
      return `export default ${JSON.stringify({ files: scan.files, byName: scan.byName })};`;
    },
  };
}
