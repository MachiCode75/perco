// World module — procedural CanvasTextures (cached in ctx.textures under 'world:<key>').
// Most "detail" maps are near-white greyscale so that vertex colours give the hue (one material
// serves every house colour). UVs produced by the Builder are in world units, so `repeat` = 1/tile size.
import * as THREE from 'three';
import { mulberry32 } from './core.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** tileable value noise on a grid of `cells` (returns fn(x,y) for x,y in [0,1)) */
function tileNoise(seed, cells) {
  const r = mulberry32(seed); const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (i, j) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
  return (x, y) => {
    const fx = x * cells, fy = y * cells; const i = Math.floor(fx), j = Math.floor(fy); const tx = fx - i, ty = fy - j;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbm(seed, x, y, oct = 4, base = 4) {
  if (!fbm.cache) fbm.cache = new Map();
  let v = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) {
    const k = seed * 31 + o; let f = fbm.cache.get(k + ':' + base); if (!f) { f = tileNoise(k, base << o); fbm.cache.set(k + ':' + base, f); }
    v += f(x, y) * amp; tot += amp; amp *= 0.5;
  }
  return v / tot;
}
/** per-pixel noise pass: fn(x,y,u,v) -> [r,g,b] or grey number */
function pixels(c, fn) {
  const g = c.getContext('2d'); const img = g.getImageData(0, 0, c.width, c.height); const d = img.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4; const res = fn(x, y, d[i], d[i + 1], d[i + 2]);
    if (typeof res === 'number') { d[i] = d[i + 1] = d[i + 2] = res; d[i + 3] = 255; } else { d[i] = res[0]; d[i + 1] = res[1]; d[i + 2] = res[2]; d[i + 3] = res.length > 3 ? res[3] : 255; }
  }
  g.putImageData(img, 0, 0);
}
const clamp255 = (v) => Math.max(0, Math.min(255, v | 0));

function finish(ctx, key, c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = o.aniso || 4;
  if (o.nearest) { t.magFilter = THREE.NearestFilter; }
  t.needsUpdate = true;
  ctx.textures.set('world:' + key, t);
  return t;
}

const GEN = {
  // ---------------------------------------------------------------- exterior
  siding(ctx) { // 4x4 units, 10 boards of 0.4
    const S = 256, c = canvas(S, S); const boards = 10, bh = S / boards;
    pixels(c, (x, y) => {
      const yy = y % bh; const t = yy / bh; // 0 top .. 1 bottom of a board
      let v = 236 + 14 * (1 - t) - 8 * t;
      if (yy > bh - 2.2) v = 150; else if (yy < 1.2) v = 255;
      v += (fbm(3, x / S, y / S, 3, 8) - 0.5) * 10;
      return clamp255(v);
    });
    return finish(ctx, 'siding', c, { repeat: [0.25, 0.25] });
  },
  shingle(ctx) { // 4x4 units, rows of 0.5
    const S = 256, c = canvas(S, S); const g = c.getContext('2d'); const r = mulberry32(11);
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S);
    const rows = 8, rh = S / rows;
    for (let j = 0; j < rows; j++) {
      let x = (j % 2) * 14 - 20;
      while (x < S + 20) {
        const w = 22 + r() * 24; const v = 200 + r() * 40;
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 1.5, j * rh + 1, w - 3, rh - 1);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 1.5, j * rh + rh - 4, w - 3, 3);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 1.5, j * rh + 1, w - 3, 2);
        x += w;
      }
    }
    pixels(c, (x, y, R) => clamp255(R + (fbm(5, x / S, y / S, 3, 8) - 0.5) * 22));
    return finish(ctx, 'shingle', c, { repeat: [0.25, 0.25] });
  },
  planks(ctx) { // 4x4 units; boards run along u, 0.66 wide
    const S = 256, c = canvas(S, S); const r = mulberry32(21); const boards = 6, bh = S / boards;
    const tone = [], joint = [];
    for (let j = 0; j < boards; j++) { tone.push(0.82 + r() * 0.2); joint.push(r() * S); }
    pixels(c, (x, y) => {
      const j = Math.floor(y / bh); const yy = y - j * bh;
      const grain = fbm(7, x / S * 0.5, y / S * 8 + j * 0.37, 4, 4);
      let v = 215 * tone[j] + (grain - 0.5) * 70;
      if (yy < 1.5 || yy > bh - 1.5) v *= 0.45;
      const jx = (x - joint[j] + S) % S; if (jx < 1.5) v *= 0.5;
      return clamp255(v);
    });
    return finish(ctx, 'planks', c, { repeat: [0.25, 0.25] });
  },
  brick(ctx) { // colour baked; 4x4 units, brick 0.8 x 0.33
    const S = 256, c = canvas(S, S); const g = c.getContext('2d'); const r = mulberry32(31);
    g.fillStyle = '#d8cfc4'; g.fillRect(0, 0, S, S);
    const rows = 12, rh = S / rows, bw = S / 5;
    for (let j = 0; j < rows; j++) for (let i = -1; i < 6; i++) {
      const x = i * bw + (j % 2) * bw / 2; const k = 0.8 + r() * 0.3;
      g.fillStyle = `rgb(${clamp255(166 * k)},${clamp255(64 * k)},${clamp255(48 * k)})`;
      g.fillRect(x + 2, j * rh + 2, bw - 4, rh - 4);
    }
    pixels(c, (x, y, R, G, B) => { const n = (fbm(33, x / S, y / S, 3, 16) - 0.5) * 30; return [clamp255(R + n), clamp255(G + n), clamp255(B + n)]; });
    return finish(ctx, 'brick', c, { repeat: [0.25, 0.25] });
  },
  asphalt(ctx) { // colour baked; 10x10 units
    const S = 256, c = canvas(S, S); const r = mulberry32(41);
    pixels(c, (x, y) => { const n = fbm(43, x / S, y / S, 4, 8); const sp = r() < 0.08 ? (r() - 0.5) * 60 : 0; const v = 74 + (n - 0.5) * 26 + sp; return [clamp255(v), clamp255(v + 2), clamp255(v + 6)]; });
    return finish(ctx, 'asphalt', c, { repeat: [0.1, 0.1] });
  },
  concrete(ctx) { // grey detail; 4x4 units slab with joints
    const S = 128, c = canvas(S, S);
    pixels(c, (x, y) => { let v = 232 + (fbm(51, x / S, y / S, 3, 8) - 0.5) * 22; if (x < 1 || y < 1) v = 170; return clamp255(v); });
    return finish(ctx, 'concrete', c, { repeat: [0.25, 0.25] });
  },
  grass(ctx) { // colour baked; 14x14 units
    const S = 256, c = canvas(S, S); const r = mulberry32(61);
    pixels(c, (x, y) => {
      const n = fbm(63, x / S, y / S, 4, 4); const fine = r();
      const k = 0.86 + (n - 0.5) * 0.35 + (fine - 0.5) * 0.12;
      return [clamp255(96 * k), clamp255(168 * k), clamp255(62 * k)];
    });
    return finish(ctx, 'grass', c, { repeat: [1 / 14, 1 / 14] });
  },
  sand(ctx) { // colour baked; 10x10
    const S = 128, c = canvas(S, S); const r = mulberry32(71);
    pixels(c, (x, y) => { const n = fbm(73, x / S, y / S, 3, 4); const k = 0.92 + (n - 0.5) * 0.25 + (r() - 0.5) * 0.08; return [clamp255(200 * k), clamp255(186 * k), clamp255(150 * k)]; });
    return finish(ctx, 'sand', c, { repeat: [0.1, 0.1] });
  },
  dirt(ctx) {
    const S = 128, c = canvas(S, S); const r = mulberry32(75);
    pixels(c, (x, y) => { const n = fbm(77, x / S, y / S, 3, 4); const k = 0.9 + (n - 0.5) * 0.3 + (r() - 0.5) * 0.1; return [clamp255(150 * k), clamp255(118 * k), clamp255(82 * k)]; });
    return finish(ctx, 'dirt', c, { repeat: [0.125, 0.125] });
  },
  stone(ctx) { // grey detail, irregular blocks; 4x4
    const S = 128, c = canvas(S, S); const g = c.getContext('2d'); const r = mulberry32(81);
    g.fillStyle = '#888'; g.fillRect(0, 0, S, S);
    for (let j = 0; j < 4; j++) { let x = -r() * 20; while (x < S) { const w = 20 + r() * 26; const v = 190 + r() * 50; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 2, j * 32 + 2, w - 4, 28); x += w; } }
    return finish(ctx, 'stone', c, { repeat: [0.25, 0.25] });
  },
  water_normal(ctx) {
    const S = 256, c = canvas(S, S); const H = new Float32Array(S * S);
    const waves = [[3, 1, 0.5, 0.3], [-2, 4, 0.35, 1.7], [5, -3, 0.25, 2.1], [1, 6, 0.2, 0.7], [-7, -2, 0.12, 4.4], [9, 5, 0.08, 1.2]];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S; let h = 0;
      for (const [a, b, amp, ph] of waves) h += amp * Math.sin(2 * Math.PI * (a * u + b * v) + ph);
      h += (fbm(91, u, v, 4, 8) - 0.5) * 1.4;
      H[y * S + x] = h;
    }
    const at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
    pixels(c, (x, y) => {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 4, dy = (at(x, y + 1) - at(x, y - 1)) * 4;
      const l = Math.hypot(dx, dy, 1);
      return [clamp255((-dx / l * 0.5 + 0.5) * 255), clamp255((-dy / l * 0.5 + 0.5) * 255), clamp255((1 / l * 0.5 + 0.5) * 255)];
    });
    return finish(ctx, 'water_normal', c, { linear: true });
  },
  // ---------------------------------------------------------------- windows (atlas 4x2 tiles of 128)
  window_day(ctx) { return windowAtlas(ctx, false); },
  window_glow(ctx) { return windowAtlas(ctx, true); },
  door(ctx) { // greyscale panelled door 128x256 (unit uv)
    const c = canvas(128, 256); const g = c.getContext('2d');
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 128, 256);
    const panel = (x, y, w, h) => { g.fillStyle = '#b8b8b8'; g.fillRect(x, y, w, h); g.fillStyle = '#f4f4f4'; g.fillRect(x + 4, y + 4, w - 8, h - 8); g.fillStyle = '#d0d0d0'; g.fillRect(x + 8, y + h - 8, w - 12, 3); };
    g.fillStyle = '#26323e'; g.fillRect(22, 18, 84, 56); g.fillStyle = '#e8e8e8'; g.fillRect(62, 18, 4, 56); g.fillRect(22, 44, 84, 4);
    panel(16, 92, 44, 70); panel(68, 92, 44, 70); panel(16, 172, 44, 70); panel(68, 172, 44, 70);
    g.fillStyle = '#d4b040'; g.beginPath(); g.arc(104, 150, 5, 0, 7); g.fill();
    return finish(ctx, 'door', c, { clamp: true });
  },
  louvre(ctx) { // horizontal slats for vents & shutters
    const c = canvas(64, 128);
    pixels(c, (x, y) => { const t = (y % 10) / 10; let v = 245 - t * 70; if (x < 4 || x > 59 || y < 4 || y > 123) v = 255; return clamp255(v); });
    return finish(ctx, 'louvre', c, { clamp: true });
  },
  // ---------------------------------------------------------------- interior
  woodpanel(ctx) { // vertical boards, warm grey detail, 4x4
    const S = 256, c = canvas(S, S); const r = mulberry32(101); const n = 8, bw = S / n; const tone = []; for (let i = 0; i < n; i++) tone.push(0.85 + r() * 0.2);
    pixels(c, (x, y) => { const i = Math.floor(x / bw); const xx = x - i * bw; const gr = fbm(103, x / S * 6 + i, y / S * 0.6, 4, 4); let v = 225 * tone[i] + (gr - 0.5) * 60; if (xx < 2) v *= 0.55; return clamp255(v); });
    return finish(ctx, 'woodpanel', c, { repeat: [0.25, 0.25] });
  },
  floorwood(ctx) { // floor boards (along u), 6x6
    const S = 256, c = canvas(S, S); const r = mulberry32(111); const n = 10, bh = S / n; const tone = [], j0 = [];
    for (let i = 0; i < n; i++) { tone.push(0.8 + r() * 0.25); j0.push(r() * S); }
    pixels(c, (x, y) => { const j = Math.floor(y / bh); const yy = y - j * bh; const gr = fbm(113, x / S * 0.7 + j, y / S * 9, 4, 4); let v = 220 * tone[j] + (gr - 0.5) * 80; if (yy < 1.4) v *= 0.55; if (((x - j0[j] + S) % (S / 2)) < 1.4) v *= 0.6; return clamp255(v); });
    return finish(ctx, 'floorwood', c, { repeat: [1 / 6, 1 / 6] });
  },
  tile(ctx) { // large tiles 2.5 units, 5x5
    const S = 128, c = canvas(S, S);
    pixels(c, (x, y) => { let v = 238 + (fbm(121, x / S, y / S, 3, 8) - 0.5) * 16; if (x % 64 < 1.5 || y % 64 < 1.5) v = 196; return clamp255(v); });
    return finish(ctx, 'tile', c, { repeat: [0.2, 0.2] });
  },
  fabric(ctx) {
    const S = 64, c = canvas(S, S); const r = mulberry32(131);
    pixels(c, (x, y) => clamp255(226 + ((x + y) % 4 < 2 ? 10 : -6) + (r() - 0.5) * 16));
    return finish(ctx, 'fabric', c, { repeat: [0.5, 0.5] });
  },
  wallpaper(ctx) {
    const S = 128, c = canvas(S, S); const g = c.getContext('2d');
    pixels(c, (x, y) => clamp255(240 + (fbm(141, x / S, y / S, 3, 8) - 0.5) * 8 + (x % 32 < 2 ? -8 : 0)));
    g.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * 32 + 16 + (j % 2) * 8, j * 32 + 16, 3, 0, 7); g.fill(); }
    return finish(ctx, 'wallpaper', c, { repeat: [0.25, 0.25] });
  },
  rug(ctx) { // colour baked, unit uv
    const S = 256, c = canvas(S, S); const g = c.getContext('2d');
    g.fillStyle = '#9c2c24'; g.fillRect(0, 0, S, S); g.fillStyle = '#d9c7a0'; g.fillRect(14, 14, S - 28, S - 28);
    g.strokeStyle = '#9c2c24'; g.lineWidth = 3; g.strokeRect(26, 26, S - 52, S - 52);
    pixels(c, (x, y, R, G, B) => { const n = ((x + y) % 3 === 0 ? 8 : 0) + (fbm(151, x / S, y / S, 2, 8) - 0.5) * 14; return [clamp255(R + n), clamp255(G + n), clamp255(B + n)]; });
    return finish(ctx, 'rug', c, { clamp: true });
  },
  art(ctx) { // 2x2 atlas of paintings
    const S = 256, c = canvas(S, S); const g = c.getContext('2d'); const h = S / 2;
    // 0: coloured candles on teal (like the reference painting)
    g.fillStyle = '#8ab6c2'; g.fillRect(0, 0, h, h); const cols = ['#d23a2a', '#f2c230', '#2f7fd0', '#3aa05a', '#e07ab0', '#f08a30'];
    cols.forEach((cc, i) => { g.fillStyle = cc; g.fillRect(14 + i * 18, 50 + (i % 2) * 10, 12, 60 - (i % 2) * 10); g.fillStyle = '#ffd860'; g.fillRect(17 + i * 18, 40 + (i % 2) * 10, 6, 8); });
    // 1: landscape
    g.fillStyle = '#9fd0f0'; g.fillRect(h, 0, h, h); g.fillStyle = '#5b9b4c'; g.beginPath(); g.moveTo(h, 80); g.lineTo(h + 50, 46); g.lineTo(h + 90, 70); g.lineTo(S, 40); g.lineTo(S, h); g.lineTo(h, h); g.fill();
    g.fillStyle = '#3d7fc0'; g.fillRect(h, 96, h, 32); g.fillStyle = '#fff0a0'; g.beginPath(); g.arc(h + 96, 26, 12, 0, 7); g.fill();
    // 2: sailboat
    g.fillStyle = '#e8dcc0'; g.fillRect(0, h, h, h); g.fillStyle = '#2b5f9e'; g.fillRect(0, h + 86, h, 42); g.fillStyle = '#7a4a2a'; g.fillRect(36, h + 80, 56, 10);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(64, h + 20); g.lineTo(64, h + 78); g.lineTo(98, h + 78); g.fill(); g.fillStyle = '#d33'; g.beginPath(); g.moveTo(60, h + 30); g.lineTo(60, h + 78); g.lineTo(38, h + 78); g.fill();
    // 3: flowers
    g.fillStyle = '#f3ead0'; g.fillRect(h, h, h, h); g.fillStyle = '#4b8a3e'; g.fillRect(h + 60, h + 60, 6, 60);
    [['#e04a6a', 40, 50], ['#f2b630', 80, 40], ['#7a5ad0', 60, 76]].forEach(([cc, x, y]) => { g.fillStyle = cc; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(h + x + Math.cos(k) * 10, h + y + Math.sin(k) * 10, 8, 0, 7); g.fill(); } g.fillStyle = '#ffe070'; g.beginPath(); g.arc(h + x, h + y, 6, 0, 7); g.fill(); });
    return finish(ctx, 'art', c, { clamp: true });
  },
  books(ctx) { // spines row, unit uv on shelf fronts (one shelf height)
    const c = canvas(256, 64); const g = c.getContext('2d'); const r = mulberry32(161); const pal = ['#8e2b2b', '#2b4f8e', '#2f7a43', '#c9a23a', '#5a3d7a', '#d96c2c', '#ece2c8', '#333'];
    g.fillStyle = '#5b3a22'; g.fillRect(0, 0, 256, 64);
    let x = 2; while (x < 250) { const w = 6 + r() * 8; const hh = 40 + r() * 22; g.fillStyle = pal[Math.floor(r() * pal.length)]; g.fillRect(x, 64 - hh, w - 1, hh); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 1, 64 - hh + 6, w - 3, 2); x += w; if (r() < 0.08) x += 10; }
    return finish(ctx, 'books', c, { clamp: true });
  },
  chalkboard(ctx) {
    const c = canvas(512, 256); const g = c.getContext('2d');
    g.fillStyle = '#2e4a3a'; g.fillRect(0, 0, 512, 256);
    pixels(c, (x, y, R, G, B) => { const n = (fbm(171, x / 512, y / 256, 3, 8) - 0.5) * 18; return [clamp255(R + n), clamp255(G + n), clamp255(B + n)]; });
    g.fillStyle = 'rgba(240,240,230,0.85)'; g.font = 'bold 44px sans-serif'; g.fillText('A B C', 40, 80); g.fillText('2 + 2 = 4', 40, 150);
    g.strokeStyle = 'rgba(240,240,230,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(300, 60); g.bezierCurveTo(360, 20, 420, 120, 470, 60); g.stroke(); g.beginPath(); g.arc(380, 170, 40, 0, 7); g.stroke();
    return finish(ctx, 'chalkboard', c, { clamp: true });
  },
  screen(ctx) {
    const c = canvas(128, 80); const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 80); gr.addColorStop(0, '#6fb6ff'); gr.addColorStop(1, '#2a5aa0'); g.fillStyle = gr; g.fillRect(0, 0, 128, 80);
    g.fillStyle = '#4caf50'; g.fillRect(0, 56, 128, 24); g.fillStyle = '#ffeb3b'; g.beginPath(); g.arc(100, 20, 10, 0, 7); g.fill();
    return finish(ctx, 'screen', c, { clamp: true });
  },
  // ---------------------------------------------------------------- fx
  ripple(ctx) {
    const S = 128, c = canvas(S, S);
    pixels(c, (x, y) => { const d = Math.hypot(x - 64, y - 64) / 64; let a = 0; for (const rr of [0.42, 0.7, 0.95]) a += Math.exp(-Math.pow((d - rr) / 0.035, 2)) * (1.1 - rr); return [255, 255, 255, clamp255(a * 255)]; });
    return finish(ctx, 'ripple', c, { clamp: true });
  },
  glow(ctx) {
    const S = 64, c = canvas(S, S); const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return finish(ctx, 'glow', c, { clamp: true });
  },
  flake(ctx) {
    const S = 32, c = canvas(S, S); const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return finish(ctx, 'flake', c, { clamp: true });
  },
};

// window atlas: 4 columns x 2 rows (128px tiles). Variants:
// 0 muntin 2x2 + white curtains, 1 cross + reflection, 2 yellow curtains, 3 interior: hanging plant & table,
// 4 interior: bookshelf & lamp, 5 interior: kitchen, 6 blinds half down, 7 plain dark pane
function windowAtlas(ctx, glow) {
  const T = 128, c = canvas(T * 4, T * 2); const g = c.getContext('2d');
  const tiles = [];
  for (let k = 0; k < 8; k++) tiles.push([(k % 4) * T, Math.floor(k / 4) * T]);
  const glass = (x, y, w, h) => {
    if (glow) { const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#ffe6a0'); gr.addColorStop(1, '#ffc96a'); g.fillStyle = gr; }
    else { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#c9dcec'); gr.addColorStop(0.45, '#7e98b0'); gr.addColorStop(0.55, '#a8c0d6'); gr.addColorStop(1, '#5e7890'); g.fillStyle = gr; }
    g.fillRect(x, y, w, h);
  };
  const mull = (x, y, w, h, nx, ny) => { g.fillStyle = glow ? '#6a5030' : '#f4f4f0'; for (let i = 1; i < nx; i++) g.fillRect(x + (w * i) / nx - 2, y, 4, h); for (let j = 1; j < ny; j++) g.fillRect(x, y + (h * j) / ny - 2, w, 4); };
  const curtains = (x, y, w, h, colr) => { g.fillStyle = glow ? 'rgba(255,214,140,0.9)' : colr; g.fillRect(x, y, w * 0.2, h); g.fillRect(x + w * 0.8, y, w * 0.2, h); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 3; i++) { g.fillRect(x + 4 + i * 8, y, 2, h); g.fillRect(x + w * 0.8 + 4 + i * 8, y, 2, h); } };
  const room = (x, y, w, h, wall, extra) => {
    g.fillStyle = glow ? '#ffd890' : wall; g.fillRect(x, y, w, h);
    g.fillStyle = glow ? '#d8a860' : '#b08a60'; g.fillRect(x, y + h * 0.78, w, h * 0.22);
    extra(x, y, w, h);
    if (!glow) { g.fillStyle = 'rgba(200,225,245,0.28)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.5, y); g.lineTo(x, y + h * 0.6); g.fill(); }
  };
  const P = 4; // padding
  // 0
  let [x, y] = tiles[0]; glass(x + P, y + P, T - 2 * P, T - 2 * P); curtains(x + P, y + P, T - 2 * P, T - 2 * P, '#f3efe6'); mull(x + P, y + P, T - 2 * P, T - 2 * P, 2, 2);
  // 1
  [x, y] = tiles[1]; glass(x + P, y + P, T - 2 * P, T - 2 * P); mull(x + P, y + P, T - 2 * P, T - 2 * P, 2, 2);
  // 2 yellow curtains (closed-ish)
  [x, y] = tiles[2]; glass(x + P, y + P, T - 2 * P, T - 2 * P); g.fillStyle = glow ? '#ffd070' : '#e9c64a'; g.fillRect(x + P, y + P, 40, T - 2 * P); g.fillRect(x + T - P - 40, y + P, 40, T - 2 * P); g.fillStyle = 'rgba(0,0,0,0.1)'; for (let i = 0; i < 5; i++) { g.fillRect(x + P + 6 + i * 7, y + P, 2, T); g.fillRect(x + T - P - 36 + i * 7, y + P, 2, T); } mull(x + P, y + P, T - 2 * P, T - 2 * P, 2, 1);
  // 3 interior hanging plant & table
  [x, y] = tiles[3]; room(x + P, y + P, T - 2 * P, T - 2 * P, '#efe3c4', (X, Y, W, H) => {
    g.fillStyle = glow ? '#a87838' : '#8a5a34'; g.fillRect(X + 20, Y + H * 0.6, W - 40, 6); g.fillRect(X + 26, Y + H * 0.6, 5, H * 0.3); g.fillRect(X + W - 31, Y + H * 0.6, 5, H * 0.3);
    g.fillStyle = '#3f8a3a'; g.beginPath(); g.arc(X + W * 0.5, Y + 30, 13, 0, 7); g.fill(); g.fillStyle = '#c06a3a'; g.fillRect(X + W * 0.5 - 8, Y + 34, 16, 10); g.fillStyle = '#555'; g.fillRect(X + W * 0.5 - 1, Y, 2, 20);
    g.fillStyle = glow ? '#c89850' : '#7a9ab8'; g.fillRect(X + 12, Y + 14, 22, 26);
  });
  mull(x + P, y + P, T - 2 * P, T - 2 * P, 1, 1);
  // 4 interior bookshelf & lamp
  [x, y] = tiles[4]; room(x + P, y + P, T - 2 * P, T - 2 * P, '#dfe6d0', (X, Y, W, H) => {
    g.fillStyle = glow ? '#a06830' : '#6a4026'; g.fillRect(X + 10, Y + 20, 40, H * 0.58);
    const bc = ['#c33', '#36c', '#3a3', '#cc3', '#939']; for (let s = 0; s < 3; s++) for (let i = 0; i < 6; i++) { g.fillStyle = bc[(i + s) % 5]; g.fillRect(X + 13 + i * 6, Y + 24 + s * 22, 5, 16); }
    g.fillStyle = glow ? '#fff2c0' : '#f0e0b0'; g.fillRect(X + W - 44, Y + 34, 24, 16); g.fillStyle = '#444'; g.fillRect(X + W - 33, Y + 50, 3, 40);
    g.fillStyle = glow ? '#b0502a' : '#8e3a2a'; g.fillRect(X + 56, Y + H * 0.62, 40, 18);
  });
  mull(x + P, y + P, T - 2 * P, T - 2 * P, 1, 1);
  // 5 interior kitchen
  [x, y] = tiles[5]; room(x + P, y + P, T - 2 * P, T - 2 * P, '#f1ead6', (X, Y, W, H) => {
    g.fillStyle = glow ? '#3a6a5a' : '#2c5a52'; g.fillRect(X, Y + 14, W, 24); g.fillRect(X, Y + H * 0.55, W, H * 0.25);
    g.fillStyle = '#d9d2c0'; g.fillRect(X, Y + H * 0.53, W, 4); g.fillStyle = '#2c5a52'; g.beginPath(); g.moveTo(X + W * 0.5 - 12, Y + 58); g.lineTo(X + W * 0.5 + 12, Y + 58); g.lineTo(X + W * 0.5 + 8, Y + 48); g.lineTo(X + W * 0.5 - 8, Y + 48); g.fill();
  });
  mull(x + P, y + P, T - 2 * P, T - 2 * P, 1, 1);
  // 6 blinds half down
  [x, y] = tiles[6]; glass(x + P, y + P, T - 2 * P, T - 2 * P); g.fillStyle = glow ? '#f6d898' : '#f1ece0'; g.fillRect(x + P, y + P, T - 2 * P, 50); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 8; i++) g.fillRect(x + P, y + P + i * 6, T - 2 * P, 1.5); mull(x + P, y + P, T - 2 * P, T - 2 * P, 2, 2);
  // 7 plain
  [x, y] = tiles[7]; glass(x + P, y + P, T - 2 * P, T - 2 * P); mull(x + P, y + P, T - 2 * P, T - 2 * P, 1, 2);
  return finish(ctx, glow ? 'window_glow' : 'window_day', c, { clamp: true });
}
/** uvRect of a window atlas variant (0..7) */
export function windowRect(k) { const cI = k % 4, r = Math.floor(k / 4) % 2; return [cI / 4 + 0.004, 1 - (r + 1) / 2 + 0.008, (cI + 1) / 4 - 0.004, 1 - r / 2 - 0.008]; }
export function artRect(k) { const cI = k % 2, r = Math.floor(k / 2) % 2; return [cI / 2, 1 - (r + 1) / 2, (cI + 1) / 2, 1 - r / 2]; }

export function getTexture(ctx, key) {
  const t = ctx.textures.get('world:' + key);
  if (t) return t;
  if (!GEN[key]) throw new Error('unknown texture ' + key);
  return GEN[key](ctx);
}

/** text sign texture (white board, marker letters), cached per text */
export function signTexture(ctx, text = 'HELLO', o = {}) {
  const key = 'sign:' + text + ':' + (o.bg || '') + (o.colors || []).join(',');
  const cached = ctx.textures.get('world:' + key); if (cached) return cached;
  const c = canvas(512, 256); const g = c.getContext('2d');
  g.fillStyle = o.bg || '#f4f1e8'; g.fillRect(0, 0, 512, 256);
  const words = String(text).split(/\s+/); const pal = o.colors || ['#1f4fd6', '#e0261e', '#1d9a3a', '#f0a020'];
  let size = 150; g.font = `900 ${size}px "Comic Sans MS", "DejaVu Sans", sans-serif`;
  while (g.measureText(text).width > 470 && size > 30) { size -= 6; g.font = `900 ${size}px "Comic Sans MS", "DejaVu Sans", sans-serif`; }
  g.textBaseline = 'middle'; let x = 256 - g.measureText(text).width / 2;
  words.forEach((w, i) => { g.fillStyle = pal[i % pal.length]; g.save(); g.translate(x, 128); g.rotate((i % 2 ? 1 : -1) * 0.04); g.fillText(w, 0, 0); g.restore(); x += g.measureText(w + ' ').width; });
  if (o.underline !== false) { g.strokeStyle = pal[2 % pal.length]; g.lineWidth = 6; g.beginPath(); g.moveTo(90, 215); g.quadraticCurveTo(256, 205, 430, 218); g.stroke(); }
  return finish(ctx, key, c, { clamp: true });
}
