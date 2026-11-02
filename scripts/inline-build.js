// Post-build: fold the JS bundle and stylesheet into dist/index.html so the game is a single page
// that starts without fetching anything else. That makes it work on hosts that serve files from
// odd paths, embed the page in a sandboxed frame, or load it from a blob/data URL.
// Icons and sw.js stay as separate optional files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
console.log(`inlined ${used.length} file(s) into index.html (${(fs.statSync(htmlPath).size / 1024).toFixed(0)} KB)`);
