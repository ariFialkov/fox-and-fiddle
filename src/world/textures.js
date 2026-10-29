/** Procedural canvas textures so the bar looks detailed without shipping assets. */
import * as THREE from 'three';

const cache = new Map();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// small deterministic PRNG so textures are the same every load
function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function noiseFill(ctx, w, h, rnd, alpha = 0.08, grain = 2) {
  for (let i = 0; i < (w * h) / (grain * grain) * 0.35; i++) {
    const x = rnd() * w, y = rnd() * h;
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(x, y, grain, grain);
  }
}

function make(key, w, h, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h, prng(hash(key)));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  cache.set(key, t);
  return t;
}
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function woodPlanks(repeat = [4, 4], tone = '#5a3a22') {
  return make('planks' + tone + repeat, 512, 512, (ctx, w, h, rnd) => {
    ctx.fillStyle = tone; ctx.fillRect(0, 0, w, h);
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = (r * h) / rows;
      const off = (r % 2) * 150;
      for (let seg = -1; seg < 3; seg++) {
        const x = seg * 256 + off;
        const shade = 0.82 + rnd() * 0.3;
        ctx.fillStyle = shadeHex(tone, shade);
        ctx.fillRect(x + 2, y + 2, 252, h / rows - 4);
        // grain lines
        ctx.strokeStyle = `rgba(0,0,0,${0.12 + rnd() * 0.1})`;
        ctx.lineWidth = 1;
        for (let g = 0; g < 9; g++) {
          ctx.beginPath();
          const gy = y + 6 + rnd() * (h / rows - 12);
          ctx.moveTo(x, gy);
          for (let k = 0; k <= 8; k++) ctx.lineTo(x + k * 32, gy + (rnd() - 0.5) * 6);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y, 2, h / rows);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, y, w, 2);
    }
    noiseFill(ctx, w, h, rnd, 0.06);
  }, { repeat });
}

export function brick(repeat = [3, 2]) {
  return make('brick' + repeat, 512, 512, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#3b2a22'; ctx.fillRect(0, 0, w, h);
    const bw = 64, bh = 32;
    for (let r = 0; r < h / bh; r++) {
      const off = (r % 2) * bw / 2;
      for (let c = -1; c < w / bw + 1; c++) {
        const x = c * bw + off, y = r * bh;
        const t = 0.75 + rnd() * 0.5;
        ctx.fillStyle = `rgb(${Math.floor(120 * t)},${Math.floor(62 * t)},${Math.floor(45 * t)})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.25})`;
        ctx.fillRect(x + 2 + rnd() * 30, y + 2 + rnd() * 10, 10 + rnd() * 20, 4 + rnd() * 8);
      }
    }
    noiseFill(ctx, w, h, rnd, 0.1);
  }, { repeat });
}

export function plaster(repeat = [2, 1], base = '#4a3a30') {
  return make('plaster' + base + repeat, 512, 512, (ctx, w, h, rnd) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
      ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 80, 10 + rnd() * 40, rnd() * 3, 0, 7); ctx.fill();
    }
    noiseFill(ctx, w, h, rnd, 0.09, 3);
  }, { repeat });
}

export function tiles(repeat = [8, 8]) {
  return make('tiles' + repeat, 256, 256, (ctx, w, h, rnd) => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const dark = (r + c) % 2 === 0;
      const t = 0.85 + rnd() * 0.2;
      ctx.fillStyle = dark ? `rgb(${30 * t},${26 * t},${24 * t})` : `rgb(${190 * t},${175 * t},${150 * t})`;
      ctx.fillRect(c * 64 + 1, r * 64 + 1, 62, 62);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (let i = 0; i <= 4; i++) { ctx.fillRect(i * 64 - 1, 0, 2, h); ctx.fillRect(0, i * 64 - 1, w, 2); }
    noiseFill(ctx, w, h, rnd, 0.1);
  }, { repeat });
}

export function felt(color = '#1f6b3a') {
  return make('felt' + color, 256, 256, (ctx, w, h, rnd) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    noiseFill(ctx, w, h, rnd, 0.07, 1);
  }, { repeat: [4, 2] });
}

export function dartboard() {
  return make('dartboard3', 2048, 2048, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, R = w * 0.40;   // R = outer edge of the double ring
    ctx.clearRect(0, 0, w, h);
    // black surround with the number ring
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, 7); ctx.fillStyle = '#121212'; ctx.fill();
    const grd = ctx.createRadialGradient(cx, cy, R * 1.0, cx, cy, R * 1.2);
    grd.addColorStop(0, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, 7); ctx.fillStyle = grd; ctx.fill();
    const nums = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    const rings = [[0.094, 0.58, 'single'], [0.58, 0.63, 'treble'], [0.63, 0.95, 'single'], [0.95, 1.0, 'double']];
    for (let i = 0; i < 20; i++) {
      const a0 = -Math.PI / 2 - Math.PI / 20 + (i * Math.PI) / 10, a1 = a0 + Math.PI / 10;
      for (const [r0, r1, kind] of rings) {
        const even = i % 2 === 0;
        const col = kind === 'single' ? (even ? '#1c1a17' : '#efe4c9') : (even ? '#c8202a' : '#1f8a45');
        ctx.beginPath(); ctx.arc(cx, cy, R * r1, a0, a1); ctx.arc(cx, cy, R * r0, a1, a0, true); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
      }
      // sisal texture hint on the cream segments
      ctx.fillStyle = '#f4ebd6'; ctx.font = 'bold 120px Arial, Helvetica, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const am = (a0 + a1) / 2;
      ctx.save(); ctx.translate(cx + Math.cos(am) * R * 1.1, cy + Math.sin(am) * R * 1.1); ctx.rotate(am + Math.PI / 2);
      ctx.fillText(String(nums[i]), 0, 0); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.094, 0, 7); ctx.fillStyle = '#1f8a45'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.037, 0, 7); ctx.fillStyle = '#c8202a'; ctx.fill();
    // wires
    ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 5; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
    for (const r of [0.037, 0.094, 0.58, 0.63, 0.95, 1.0]) { ctx.beginPath(); ctx.arc(cx, cy, R * r, 0, 7); ctx.stroke(); }
    for (let i = 0; i < 20; i++) {
      const a = -Math.PI / 2 - Math.PI / 20 + (i * Math.PI) / 10;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.094, cy + Math.sin(a) * R * 0.094); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // outer rim
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(cx, cy, R * 1.195, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, R * 1.19, 0, 7); ctx.stroke();
  });
}

export function neonText(text, color = '#ff5a8c', w = 1024, h = 256, font = 'italic 150px Georgia') {
  return make('neon' + text + color, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = color; ctx.shadowBlur = 40;
    ctx.lineWidth = 8; ctx.strokeStyle = color;
    ctx.strokeText(text, w / 2, h / 2);
    ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
    ctx.strokeText(text, w / 2, h / 2);
  });
}

export function poster(title, sub, bg = '#7a2d1e', fg = '#f4e0b0') {
  return make('poster' + title, 256, 384, (ctx, w, h, rnd) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.font = 'bold 40px Georgia'; ctx.textAlign = 'center';
    wrapText(ctx, title, w / 2, 110, w - 30, 46);
    ctx.font = '22px Georgia';
    wrapText(ctx, sub, w / 2, 260, w - 40, 28);
    ctx.strokeStyle = fg; ctx.lineWidth = 4; ctx.strokeRect(12, 12, w - 24, h - 24);
    noiseFill(ctx, w, h, rnd, 0.15, 3);
  });
}

export function label(text, bg = '#eee', fg = '#222', w = 256, h = 128) {
  return make('label' + text + bg, w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.font = `bold ${Math.floor(h * 0.42)}px Georgia`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
  });
}

export function chalkboard() {
  return make('chalk', 512, 384, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#1e2a24'; ctx.fillRect(0, 0, w, h);
    noiseFill(ctx, w, h, rnd, 0.18, 2);
    ctx.fillStyle = '#e8e4d8'; ctx.textAlign = 'center';
    ctx.font = 'bold 44px Georgia'; ctx.fillText('TONIGHT', w / 2, 70);
    ctx.font = '30px Georgia';
    ['Pool · Darts · Foosball', 'Drinking contest 9pm', 'House always wins', '(96% of the time)'].forEach((l, i) => ctx.fillText(l, w / 2, 140 + i * 52));
    ctx.strokeStyle = '#a0762a'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, w - 14, h - 14);
  });
}

export function foosballPitch() {
  return make('pitch', 512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#2f7a43'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.beginPath(); ctx.moveTo(14, h / 2); ctx.lineTo(w - 14, h / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 90, 0, 7); ctx.stroke();
    ctx.strokeRect(w * 0.25, 14, w * 0.5, 120); ctx.strokeRect(w * 0.25, h - 134, w * 0.5, 120);
  });
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '';
  for (const wd of words) {
    const t = line + wd + ' ';
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = wd + ' '; y += lh; } else line = t;
  }
  ctx.fillText(line, x, y);
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
