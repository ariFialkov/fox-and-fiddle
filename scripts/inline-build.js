// Post-build: fold the JS bundle and stylesheet into dist/index.html so the game is a single page
// that starts without fetching anything else. That makes it work on hosts that serve files from
// odd paths, embed the page in a sandboxed frame, or load it from a blob/data URL.
// Icons and sw.js stay as separate optional files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpackAll, MODEL_EXT } from './unpack-glb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');
const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const used = [];

const local = (ref) => path.join(dist, ref.replace(/^\.\//, '').replace(/^\//, '').replace(/^.*?assets\//, 'assets/'));

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/g, (m, href) => {
  const f = local(href); used.push(f);
  return `<style>\n${fs.readFileSync(f, 'utf8')}\n</style>`;
});
html = html.replace(/<script type="module"[^>]*src="([^"]+\.js)"[^>]*><\/script>/g, (m, src) => {
  const f = local(src); used.push(f);
  // keep "</script" inside the code from closing the tag early
  const code = fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${code}\n</script>`;
});
// the module script must run after the page body exists; move it to the end of <body>
const mod = html.match(/<script type="module">[\s\S]*?<\/script>/);
if (mod) { html = html.replace(mod[0], () => ''); html = html.replace('</body>', () => `${mod[0]}\n</body>`); } // function form: the bundle contains $' and $& sequences

fs.writeFileSync(htmlPath, html);
for (const f of used) fs.rmSync(f, { force: true });
const assetsDir = path.join(dist, 'assets');
if (fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length === 0) fs.rmdirSync(assetsDir);
// review material unpacked with the art drops is not part of the game
for (const d of ['preview', 'screens', '__MACOSX']) fs.rmSync(path.join(dist, 'western', d), { recursive: true, force: true });
// file types some hosting platforms refuse: notes (.md) and web manifests are not loaded by the game
const refused = /\.(md|webmanifest)$/i;
const sweep = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) sweep(f); else if (refused.test(e.name)) fs.rmSync(f, { force: true }); } };
sweep(dist);
// hosts that refuse .glb: every model as glTF JSON plus its texture images (lossless; see unpack-glb.js)
const conv = unpackAll(path.join(dist, 'western'));
if (conv.files) console.log(`models: ${conv.files} .glb -> .${MODEL_EXT} + images (${(conv.before / 1e6).toFixed(1)} MB -> ${(conv.after / 1e6).toFixed(1)} MB)`);
console.log(`inlined ${used.length} file(s) into index.html (${(fs.statSync(htmlPath).size / 1024).toFixed(0)} KB)`);
