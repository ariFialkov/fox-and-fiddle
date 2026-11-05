// Renders the asset catalog: images and catalog.json in asset-catalog/.
// Starts a Vite dev server, opens catalog-studio/ in headless Chromium, and asks it to build,
// photograph and measure every asset from the real game code.
//
//   npm run catalog            (needs Playwright: npm i -D playwright && npx playwright install chromium)
//   npm run catalog -- dart    (re-render just the listed asset ids)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'asset-catalog');
const imgDir = path.join(outDir, 'images');
fs.mkdirSync(imgDir, { recursive: true });
const only = process.argv.slice(2);

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'catalog-studio/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.studio && window.studio.ready, null, { timeout: 120000 }).catch(() => { throw new Error('studio did not start: ' + errors.join(' | ')); });

const list = await page.evaluate(() => window.studio.list());
const catPath = path.join(outDir, 'catalog.json');
const previous = fs.existsSync(catPath) ? JSON.parse(fs.readFileSync(catPath, 'utf8')) : { assets: [] };
const entries = [];
const t0 = Date.now();
for (const { id, views } of list) {
  if (only.length && !only.includes(id)) { const prev = previous.assets.find((a) => a.id === id); if (prev) entries.push(prev); continue; }
  try {
    const files = {};
    for (const view of views) {
      const dataUrl = await page.evaluate(([id, view]) => window.studio.render(id, view), [id, view]);
      if (!dataUrl) continue;
      const file = `${id}-${view}.webp`;
      fs.writeFileSync(path.join(imgDir, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
      files[view] = `images/${file}`;
    }
    const meta = await page.evaluate((id) => window.studio.meta(id), id);
    meta.views = meta.views.map((v) => ({ ...v, file: files[v.view] }));
    if (meta.kind === 'file') {
      const ext = path.extname(meta.file);
      fs.copyFileSync(path.join(root, meta.file), path.join(imgDir, `${id}${ext}`));
      meta.views = [{ view: 'image', label: 'Image', file: `images/${id}${ext}` }];
    }
    entries.push(meta);
    process.stdout.write(`  ${id} (${views.length} view${views.length > 1 ? 's' : ''})\n`);
  } catch (e) {
    console.error(`  ${id}: FAILED ${e.message}`);
    errors.push(`${id}: ${e.message}`);
  }
}
const categories = await page.evaluate(() => window.studio.categories);
fs.writeFileSync(catPath, JSON.stringify({
  title: 'Fox and Fiddle asset catalog',
  generated: new Date().toISOString(),
  conventions: { units: 'metres (1 unit = 1 m)', up: '+Y', front: '+Z (the side you see in the Front view)', images: 'transparent WebP, rendered from the game code' },
  categories, assets: entries,
}, null, 1));
await browser.close();
await server.close();
console.log(`\n${entries.length} assets in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${path.relative(root, catPath)}`);
if (errors.length) { console.error('\nerrors:\n' + errors.join('\n')); process.exitCode = 1; }
