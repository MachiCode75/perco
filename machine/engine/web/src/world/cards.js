// World module — text cards (set id `card`): full-frame 9:16 inserts such as notebook pages, signs,
// plaques, notes, phone messages, newspaper, heart monitor, calendar, clock. Each card is a canvas
// texture on a lit 3D object (paper on a table, sign on posts, plaque on a plinth …) so it keeps
// a little light and depth. Text is auto-sized and wrapped. Also exports the drawing helpers used by
// props (plaque, heart monitor, road signs).
import * as THREE from 'three';
import { makeRng, hashStr } from './core.js';

// ------------------------------------------------------------------ fonts (vendored OFL, see fonts/)
const FONT_DIR = new URL('./fonts/', import.meta.url).href;
export const HAND = '"Patrick Hand", "DejaVu Sans", sans-serif';
export const MARKER = '"Permanent Marker", "DejaVu Sans", sans-serif';
export const SERIF = '"Liberation Serif", "DejaVu Serif", serif';
export const SANS = '"Liberation Sans", "DejaVu Sans", sans-serif';
async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
  const list = [['Patrick Hand', 'patrick-hand.woff2'], ['Permanent Marker', 'permanent-marker.woff2']];
  await Promise.all(list.map(async ([fam, file]) => {
    try { const f = new FontFace(fam, `url(${FONT_DIR}${file})`); await f.load(); document.fonts.add(f); } catch (e) { console.warn('[world] font', fam, e.message); }
  }));
}
await Promise.race([loadFonts(), new Promise((r) => setTimeout(r, 4000))]);

// ------------------------------------------------------------------ text layout
/** wrap text into lines that fit maxW (respects \n) */
export function wrap(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean); let line = '';
    if (!words.length) { out.push(''); continue; }
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}
/** largest font size (≤max) so wrapped text fits box {w,h}; returns {size, lines} */
export function fit(g, text, font, w, h, max = 160, min = 18, lh = 1.2) {
  for (let s = max; s >= min; s -= 2) {
    g.font = font(s); const lines = wrap(g, text, w);
    if (lines.length * s * lh <= h && lines.every((l) => g.measureText(l).width <= w)) return { size: s, lines };
  }
  g.font = font(min); return { size: min, lines: wrap(g, text, w) };
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/** subtle paper grain + edge darkening so cards never look flat */
function grain(g, w, h, amt = 10, seed = 1) {
  const img = g.getImageData(0, 0, w, h), d = img.data; const r = makeRng(seed);
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
function vignette(g, w, h, k = 0.18) {
  const gr = g.createRadialGradient(w * 0.45, h * 0.4, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${k})`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
/** handwritten line: per-glyph jitter in rotation/baseline (seeded) */
function handLine(g, text, x, y, r, jitter = 1) {
  let cx = x;
  for (const ch of text) {
    const wch = g.measureText(ch).width;
    g.save(); g.translate(cx, y + (r() - 0.5) * 3 * jitter); g.rotate((r() - 0.5) * 0.06 * jitter); g.fillText(ch, 0, 0); g.restore();
    cx += wch + (r() - 0.5) * 0.8 * jitter;
  }
}
/** crayon stroke along points (multiple jittered passes) */
function crayon(g, pts, color, width, r, closed = false) {
  g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = 0; pass < 3; pass++) {
    g.globalAlpha = 0.55; g.lineWidth = width * (0.7 + r() * 0.5); g.beginPath();
    pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * width * 0.6, jy = y + (r() - 0.5) * width * 0.6; i ? g.lineTo(jx, jy) : g.moveTo(jx, jy); });
    if (closed) g.closePath(); g.stroke();
  }
  g.globalAlpha = 1;
}
const circlePts = (cx, cy, rx, ry, n = 40) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
function hatch(g, cx, cy, rx, ry, color, r, density = 260) {
  g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.clip(); g.strokeStyle = color; g.globalAlpha = 0.5; g.lineWidth = 6;
  for (let i = 0; i < density * 3; i++) { const x = cx + (r() - 0.5) * rx * 2, y = cy + (r() - 0.5) * ry * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + r() * 10, y - 10 - r() * 8); g.stroke(); }
  g.restore(); g.globalAlpha = 1;
}
/** simple child crayon drawings: moon | sun | face | house | eye | tree | family | none */
export function drawCrayon(g, kind, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * 0.38;
  if (kind === 'moon' || kind === 'sun' || kind === 'face') {
    const col = kind === 'sun' ? '#f2b630' : kind === 'face' ? '#f0c98a' : '#e8b840';
    hatch(g, cx, cy, R, R, kind === 'moon' ? '#f3c94a' : col, r); crayon(g, circlePts(cx, cy, R, R), '#e0a030', 9, r, true);
    if (kind === 'sun') for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; crayon(g, [[cx + Math.cos(a) * R * 1.15, cy + Math.sin(a) * R * 1.15], [cx + Math.cos(a) * R * 1.45, cy + Math.sin(a) * R * 1.45]], '#f08a20', 8, r); }
    if (kind === 'moon') ['#d63a2a', '#2f6fd0', '#3aa04a'].forEach((c, i) => { const px = cx - R * 0.45 + i * R * 0.45, py = cy - R * 0.92; crayon(g, [[px, py], [px, py - R * 0.35]], c, 6, r); g.fillStyle = c; g.beginPath(); g.arc(px, py - R * 0.4, R * 0.09, 0, 7); g.fill(); crayon(g, [[px - R * 0.08, py - R * 0.18], [px + R * 0.08, py - R * 0.18]], c, 5, r); });
    g.fillStyle = '#151515'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * R * 0.35, cy - R * 0.12, R * 0.12, 0, 7); g.fill(); }
    crayon(g, [[cx - R * 0.45, cy + R * 0.3], [cx - R * 0.15, cy + R * 0.48], [cx + R * 0.2, cy + R * 0.48], [cx + R * 0.45, cy + R * 0.28]], '#d63a2a', 9, r);
  } else if (kind === 'house') {
    const bw = R * 1.5, bh = R * 1.1, bx = cx - bw / 2, by = cy - bh / 2 + R * 0.3;
    hatch(g, cx, by + bh / 2, bw / 2, bh / 2, '#e07a40', r, 200); crayon(g, [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]], '#a04020', 8, r, true);
    crayon(g, [[bx - R * 0.15, by], [cx, by - R * 0.8], [bx + bw + R * 0.15, by]], '#a02020', 9, r, true);
    crayon(g, [[cx - R * 0.15, by + bh], [cx - R * 0.15, by + bh * 0.45], [cx + R * 0.15, by + bh * 0.45], [cx + R * 0.15, by + bh]], '#5a3020', 7, r);
  } else if (kind === 'eye') {
    crayon(g, [...circlePts(cx, cy, R * 1.2, R * 0.6, 30)], '#222', 9, r, true); hatch(g, cx, cy, R * 0.45, R * 0.45, '#c03030', r, 160);
    g.fillStyle = '#111'; g.beginPath(); g.arc(cx, cy, R * 0.2, 0, 7); g.fill();
  } else if (kind === 'tree') {
    crayon(g, [[cx, cy + R], [cx, cy]], '#6a3a1a', 16, r); hatch(g, cx, cy - R * 0.4, R * 0.7, R * 0.6, '#3a9a3a', r, 220); crayon(g, circlePts(cx, cy - R * 0.4, R * 0.7, R * 0.6), '#2a7a2a', 8, r, true);
  } else if (kind === 'family') {
    const cols = ['#2f6fd0', '#d63a2a', '#f2b630', '#3aa04a'];
    cols.forEach((c, i) => { const px = x + w * (0.2 + i * 0.2), s = i < 2 ? 1 : 0.7, top = cy - R * 0.6 * s; crayon(g, circlePts(px, top, R * 0.16 * s, R * 0.16 * s, 16), '#333', 6, r, true); crayon(g, [[px, top + R * 0.16 * s], [px, top + R * 0.9 * s]], c, 8, r); crayon(g, [[px - R * 0.25 * s, top + R * 0.45 * s], [px + R * 0.25 * s, top + R * 0.45 * s]], c, 7, r); crayon(g, [[px - R * 0.18 * s, top + R * 1.3 * s], [px, top + R * 0.9 * s], [px + R * 0.18 * s, top + R * 1.3 * s]], c, 7, r); });
  }
  // little crayon stars around
  if (kind && kind !== 'none') for (let i = 0; i < 5; i++) { const sx = x + r() * w, sy = y + r() * h * 0.3; if (Math.hypot(sx - cx, sy - cy) < R * 1.3) continue; crayon(g, [[sx - 8, sy], [sx + 8, sy]], '#e8b030', 3, r); crayon(g, [[sx, sy - 8], [sx, sy + 8]], '#e8b030', 3, r); }
}

// ------------------------------------------------------------------ 7-segment digits (clock)
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function sevenSeg(g, text, x, y, h, color) {
  const w = h * 0.55, t = h * 0.13; let cx = x;
  g.fillStyle = color; g.shadowColor = color; g.shadowBlur = h * 0.12;
  const bar = (x0, y0, horiz, len) => { g.beginPath(); if (horiz) { g.moveTo(x0, y0); g.lineTo(x0 + t / 2, y0 - t / 2); g.lineTo(x0 + len - t / 2, y0 - t / 2); g.lineTo(x0 + len, y0); g.lineTo(x0 + len - t / 2, y0 + t / 2); g.lineTo(x0 + t / 2, y0 + t / 2); } else { g.moveTo(x0, y0); g.lineTo(x0 + t / 2, y0 + t / 2); g.lineTo(x0 + t / 2, y0 + len - t / 2); g.lineTo(x0, y0 + len); g.lineTo(x0 - t / 2, y0 + len - t / 2); g.lineTo(x0 - t / 2, y0 + t / 2); } g.closePath(); g.fill(); };
  for (const ch of String(text)) {
    if (ch === ':') { g.beginPath(); g.arc(cx + t, y + h * 0.3, t * 0.6, 0, 7); g.arc(cx + t, y + h * 0.7, t * 0.6, 0, 7); g.fill(); cx += t * 3; continue; }
    const s = SEG[ch]; if (!s) { cx += w * 0.5; continue; }
    const half = h / 2;
    if (s.includes('a')) bar(cx + t * 0.2, y, true, w - t * 0.4); if (s.includes('g')) bar(cx + t * 0.2, y + half, true, w - t * 0.4); if (s.includes('d')) bar(cx + t * 0.2, y + h, true, w - t * 0.4);
    if (s.includes('f')) bar(cx, y + t * 0.2, false, half - t * 0.4); if (s.includes('b')) bar(cx + w, y + t * 0.2, false, half - t * 0.4);
    if (s.includes('e')) bar(cx, y + half + t * 0.2, false, half - t * 0.4); if (s.includes('c')) bar(cx + w, y + half + t * 0.2, false, half - t * 0.4);
    cx += w + t * 2.2;
  }
  g.shadowBlur = 0; return cx - x;
}

// ------------------------------------------------------------------ card faces (canvas)
// Each returns { canvas, emissive?: bool }. W,H in px; card faces are 9:16 unless noted.
export function ecg(g, x, y, w, h, color = '#3dff6a', phase = 0) {
  g.strokeStyle = color; g.lineWidth = Math.max(3, h * 0.035); g.shadowColor = color; g.shadowBlur = 10; g.beginPath();
  const beat = w / 2.6; let first = true;
  for (let px = 0; px <= w; px += 2) {
    const u = ((px + phase) % beat) / beat; let v = 0;
    if (u > 0.1 && u < 0.18) v = 0.12 * Math.sin((u - 0.1) / 0.08 * Math.PI);
    else if (u > 0.26 && u < 0.29) v = -0.15; else if (u > 0.29 && u < 0.33) v = 0.95 * (1 - Math.abs(u - 0.31) / 0.02); else if (u > 0.33 && u < 0.36) v = -0.28;
    else if (u > 0.48 && u < 0.62) v = 0.2 * Math.sin((u - 0.48) / 0.14 * Math.PI);
    const yy = y + h * 0.6 - v * h * 0.55; first ? g.moveTo(x + px, yy) : g.lineTo(x + px, yy); first = false;
  }
  g.stroke(); g.shadowBlur = 0;
}
export function drawMonitor(W, H, o = {}) {
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#04080a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(40,90,60,0.35)'; g.lineWidth = 1; for (let x = 0; x < W; x += W / 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += H / 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const green = '#41ff74';
  ecg(g, W * 0.04, H * 0.12, W * 0.92, H * 0.42, green, o.phase || 0);
  g.fillStyle = green; g.shadowColor = green; g.shadowBlur = 14; g.textBaseline = 'alphabetic';
  const num = String(o.text ?? '72'); g.font = `bold ${Math.round(H * 0.28)}px ${SANS}`; const nw = g.measureText(num).width;
  g.fillText(num, W * 0.94 - nw, H * 0.9);
  g.font = `${Math.round(H * 0.2)}px ${SANS}`; g.fillText('♥', W * 0.94 - nw - H * 0.24, H * 0.86);
  g.font = `bold ${Math.round(H * 0.07)}px ${SANS}`; g.fillText(o.title || 'HR', W * 0.06, H * 0.72);
  g.fillStyle = '#4fd8ff'; g.shadowColor = '#4fd8ff'; g.fillText('SpO2 98', W * 0.06, H * 0.88); g.shadowBlur = 0;
  return c;
}
export function drawPlaque(W, H, o = {}) {
  const c = canvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#6e4a1c'); gr.addColorStop(0.45, '#a87a32'); gr.addColorStop(0.55, '#8a6226'); gr.addColorStop(1, '#5c3c16');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const b = Math.min(W, H) * 0.06; g.strokeStyle = '#d8b46a'; g.lineWidth = b * 0.35; g.strokeRect(b, b, W - 2 * b, H - 2 * b); g.strokeStyle = '#3e2a0e'; g.lineWidth = b * 0.12; g.strokeRect(b * 1.6, b * 1.6, W - 3.2 * b, H - 3.2 * b);
  const engrave = (txt, y, size, font = SERIF) => { g.font = `bold ${size}px ${font}`; g.textAlign = 'center'; g.fillStyle = '#2e1d08'; g.fillText(txt, W / 2 + 2, y + 2); g.fillStyle = '#f0d898'; g.fillText(txt, W / 2, y); };
  const title = o.title ?? (o.text ? '' : 'ELIAS HART'); const text = o.text ?? 'THE ONE WHO NEVER SLEPT';
  const iw = W - 5 * b;
  if (title) {
    const t = fit(g, title.toUpperCase(), (s) => `bold ${s}px ${SERIF}`, iw, H * 0.34, 220, 20, 1.1);
    t.lines.forEach((l, i) => engrave(l, H * 0.2 + (i + 0.85) * t.size * 1.05, t.size));
    const ly = H * 0.2 + t.lines.length * t.size * 1.05 + H * 0.06; g.fillStyle = '#d8b46a'; g.fillRect(W * 0.2, ly, W * 0.6, b * 0.18);
    const s2 = fit(g, text.toUpperCase(), (s) => `${s}px ${SERIF}`, iw, H * 0.74 - ly, 120, 14, 1.2);
    s2.lines.forEach((l, i) => { g.font = `${s2.size}px ${SERIF}`; g.textAlign = 'center'; g.fillStyle = '#2e1d08'; g.fillText(l, W / 2 + 2, ly + H * 0.06 + (i + 0.85) * s2.size * 1.2 + 2); g.fillStyle = '#f0d898'; g.fillText(l, W / 2, ly + H * 0.06 + (i + 0.85) * s2.size * 1.2); });
  } else {
    const t = fit(g, text.toUpperCase(), (s) => `bold ${s}px ${SERIF}`, iw, H - 5 * b, 200, 16, 1.15);
    const top = (H - t.lines.length * t.size * 1.15) / 2; t.lines.forEach((l, i) => engrave(l, top + (i + 0.85) * t.size * 1.15, t.size));
  }
  grain(g, W, H, 14, 7); return c;
}
export function drawRoadSign(kind, o = {}) {
  const c = canvas(256, 256), g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
  if (kind === 'curve' || kind === 'warning') {
    g.fillStyle = '#f2c21a'; g.strokeStyle = '#111'; g.lineWidth = 10; g.beginPath(); g.moveTo(128, 8); g.lineTo(248, 128); g.lineTo(128, 248); g.lineTo(8, 128); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 18; g.beginPath(); g.moveTo(100, 200); g.quadraticCurveTo(100, 110, 150, 100); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.moveTo(140, 70); g.lineTo(180, 100); g.lineTo(140, 130); g.fill();
  } else if (kind === 'stop') {
    g.fillStyle = '#c8161c'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); } g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff'; g.font = `bold 72px ${SANS}`; g.textAlign = 'center'; g.fillText('STOP', 128, 154);
  } else { // speed / generic white
    g.fillStyle = '#f4f4f0'; g.fillRect(28, 4, 200, 248); g.strokeStyle = '#111'; g.lineWidth = 7; g.strokeRect(38, 14, 180, 228);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `bold 36px ${SANS}`; g.fillText(o.top || 'SPEED', 128, 62); g.fillText(o.mid || 'LIMIT', 128, 100); g.font = `bold 110px ${SANS}`; g.fillText(String(o.text || '35'), 128, 214);
  }
  return c;
}

function drawNotebook(W, H, o, r) {
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f7f0dc'; g.fillRect(0, 0, W, H); grain(g, W, H, 9, 3);
  const rule = H / 22; g.strokeStyle = 'rgba(80,130,200,0.45)'; g.lineWidth = 2;
  for (let y = rule * 2.4; y < H; y += rule) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(220,70,70,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.11, 0); g.lineTo(W * 0.11, H); g.stroke();
  const x0 = W * 0.14, tw = W * 0.8; let top = rule * 2.4;
  const drawing = o.drawing && o.drawing !== 'none' ? o.drawing : null;
  if (drawing) { const dh = o.text ? H * 0.5 : H * 0.8; drawCrayon(g, drawing, W * 0.08, top, W * 0.84, dh, r); top += dh + rule * 0.5; top = Math.ceil((top - rule * 2.4) / rule) * rule + rule * 2.4; }
  g.fillStyle = '#1b2a78'; g.textBaseline = 'alphabetic';
  if (o.title) { g.font = `${Math.round(rule * 1.1)}px ${HAND}`; handLine(g, o.title, x0, top + rule * 0.85, r); g.strokeStyle = '#1b2a78'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, top + rule * 1.0); g.lineTo(x0 + g.measureText(o.title).width, top + rule * 1.0); g.stroke(); top += rule * 1.5; }
  if (o.text) {
    const avail = H - top - rule * 0.5; const nl = Math.max(1, Math.floor(avail / rule));
    // font size: multiples of the ruling (1, 1.5 or 2 rules per line), largest that fits
    let best = null;
    for (const k of [2, 1.5, 1]) { const size = rule * k * 0.82; g.font = `${size}px ${HAND}`; const lines = wrap(g, o.text, tw); if (lines.length * k <= nl + 0.01 && lines.every((l) => g.measureText(l).width <= tw)) { best = { k, size, lines }; break; } }
    if (!best) { const f = fit(g, o.text, (s) => `${s}px ${HAND}`, tw, avail, rule, 14, 1.15); best = { k: (f.size * 1.15) / rule, size: f.size, lines: f.lines }; }
    g.font = `${best.size}px ${HAND}`;
    best.lines.forEach((l, i) => handLine(g, l, x0, top + (i + 1) * rule * best.k - rule * 0.18, r));
  }
  vignette(g, W, H, 0.12); return c;
}
function drawNote(W, H, o, r) {
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = o.color || '#fbf3c4'; g.fillRect(0, 0, W, H); grain(g, W, H, 10, 4);
  g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, 0, W, H * 0.06);
  g.fillStyle = o.ink || '#202020'; const pad = W * 0.1; let top = H * 0.1;
  if (o.title) { g.font = `${Math.round(H * 0.07)}px ${MARKER}`; handLine(g, o.title, pad, top + H * 0.07, r, 0.6); top += H * 0.12; }
  const f = fit(g, o.text || '', (s) => `${s}px ${HAND}`, W - 2 * pad, H - top - H * 0.08, 150, 18, 1.15);
  g.font = `${f.size}px ${HAND}`; f.lines.forEach((l, i) => handLine(g, l, pad, top + (i + 0.9) * f.size * 1.15, r));
  if (o.drawing && o.drawing !== 'none') drawCrayon(g, o.drawing, W * 0.55, H * 0.72, W * 0.4, H * 0.25, r);
  vignette(g, W, H, 0.14); return c;
}
function drawSignBoard(W, H, o, metal) {
  const c = canvas(W, H), g = c.getContext('2d'); const r = makeRng(5);
  if (metal) {
    const col = o.color || '#1d6b3c'; g.fillStyle = col; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#f4f4f0'; g.lineWidth = H * 0.035; const m = H * 0.05; g.beginPath(); g.roundRect ? g.roundRect(m, m, W - 2 * m, H - 2 * m, H * 0.07) : g.rect(m, m, W - 2 * m, H - 2 * m); g.stroke();
    grain(g, W, H, 6, 9);
  } else {
    g.fillStyle = o.color || '#4a2f1c'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,220,180'},${0.03 + r() * 0.05})`; g.fillRect(0, y, W, 2); }
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, (i + 1) * H / 6, W, 3); }
    g.strokeStyle = '#2b1a0e'; g.lineWidth = H * 0.05; g.strokeRect(H * 0.025, H * 0.025, W - H * 0.05, H * 0.05 * 0 + H - H * 0.05);
  }
  const ink = metal ? (o.ink || '#f6f6f0') : (o.ink || '#f1e6c8'); const font = metal ? (s) => `bold ${s}px ${SANS}` : (s) => `bold ${s}px ${SERIF}`;
  const pad = W * 0.08; let top = H * 0.12; const avail = H * 0.76;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const title = o.title !== undefined ? o.title : (o.text ? '' : 'WELCOME TO');
  if (title) { const t = fit(g, title.toUpperCase(), font, W - 2 * pad, avail * 0.28, H * 0.16, 12, 1.1); g.font = font(t.size); t.lines.forEach((l, i) => { if (!metal) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(l, W / 2 + 3, top + (i + 0.85) * t.size * 1.1 + 3); } g.fillStyle = ink; g.fillText(l, W / 2, top + (i + 0.85) * t.size * 1.1); }); top += t.lines.length * t.size * 1.1 + H * 0.03; }
  const text = (o.text || 'MAPLE HOLLOW').toUpperCase();
  const t = fit(g, text, font, W - 2 * pad, H * 0.88 - top, H * 0.34, 12, 1.08);
  const y0 = top + (H * 0.88 - top - t.lines.length * t.size * 1.08) / 2;
  g.font = font(t.size); t.lines.forEach((l, i) => { if (!metal) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(l, W / 2 + 4, y0 + (i + 0.85) * t.size * 1.08 + 4); } g.fillStyle = ink; g.fillText(l, W / 2, y0 + (i + 0.85) * t.size * 1.08); });
  if (o.subtitle) { g.font = font(Math.round(H * 0.07)); g.fillStyle = ink; g.fillText(o.subtitle.toUpperCase(), W / 2, H * 0.93); }
  return c;
}
function drawPhone(W, H, o) {
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f2f2f7'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#111'; g.font = `bold ${H * 0.022}px ${SANS}`; g.textAlign = 'left'; g.fillText(o.time || '3:07', W * 0.08, H * 0.04); g.textAlign = 'right'; g.fillText('▮▮▮  87%', W * 0.92, H * 0.04);
  g.fillStyle = '#e8e8ee'; g.fillRect(0, H * 0.06, W, H * 0.09); g.fillStyle = '#c8c8d0'; g.beginPath(); g.arc(W / 2, H * 0.085, H * 0.022, 0, 7); g.fill();
  g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `bold ${H * 0.028}px ${SANS}`; g.fillText(o.title || 'Mom', W / 2, H * 0.135);
  const msgs = String(o.text || 'where are you?\n>at the lake\ncome home NOW').split('\n').filter(Boolean);
  // bubble font: largest size that fits all messages
  const maxBW = W * 0.68; let size = H * 0.04; let layout;
  const lay = (s) => { g.font = `${s}px ${SANS}`; let y = H * 0.18; const out = []; for (const m of msgs) { const me = m.startsWith('>'); const lines = wrap(g, me ? m.slice(1).trim() : m, maxBW - s); const bw = Math.min(maxBW, Math.max(...lines.map((l) => g.measureText(l).width)) + s * 1.2); const bh = lines.length * s * 1.25 + s * 0.8; out.push({ me, lines, bw, bh, y }); y += bh + s * 0.6; } return { out, end: y }; };
  for (; size > H * 0.018; size -= 2) { layout = lay(size); if (layout.end < H * 0.9) break; }
  for (const m of layout.out) {
    const x = m.me ? W * 0.94 - m.bw : W * 0.06; g.fillStyle = m.me ? '#2f7cf6' : '#e2e2e8';
    g.beginPath(); g.roundRect ? g.roundRect(x, m.y, m.bw, m.bh, size * 0.7) : g.rect(x, m.y, m.bw, m.bh); g.fill();
    g.fillStyle = m.me ? '#fff' : '#111'; g.textAlign = 'left'; g.font = `${size}px ${SANS}`; m.lines.forEach((l, i) => g.fillText(l, x + size * 0.6, m.y + size * 0.4 + (i + 0.85) * size * 1.25));
  }
  g.fillStyle = '#fff'; g.fillRect(0, H * 0.92, W, H * 0.08); g.strokeStyle = '#c8c8d0'; g.lineWidth = 3; g.beginPath(); g.roundRect ? g.roundRect(W * 0.06, H * 0.935, W * 0.78, H * 0.045, H * 0.022) : g.rect(W * 0.06, H * 0.935, W * 0.78, H * 0.045); g.stroke();
  g.fillStyle = '#2f7cf6'; g.beginPath(); g.arc(W * 0.9, H * 0.957, H * 0.02, 0, 7); g.fill();
  return c;
}
function drawNewspaper(W, H, o, r) {
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#ece6d6'; g.fillRect(0, 0, W, H); grain(g, W, H, 16, 11);
  const pad = W * 0.06; g.fillStyle = '#151515'; g.textAlign = 'center';
  const mast = (o.title || 'THE DAILY GAZETTE').toUpperCase(); let ms = 110; g.font = `bold ${ms}px ${SERIF}`; while (g.measureText(mast).width > W - 2 * pad && ms > 16) { ms -= 2; g.font = `bold ${ms}px ${SERIF}`; }
  g.fillText(mast, W / 2, H * 0.08);
  g.fillRect(pad, H * 0.1, W - 2 * pad, 4); g.font = `${H * 0.016}px ${SERIF}`; g.fillText(o.date || 'MORNING EDITION  •  25¢', W / 2, H * 0.122); g.fillRect(pad, H * 0.13, W - 2 * pad, 2);
  const hl = fit(g, (o.text || 'TOWN VANISHES OVERNIGHT').toUpperCase(), (s) => `bold ${s}px ${SERIF}`, W - 2 * pad, H * 0.28, 150, 24, 1.05);
  g.font = `bold ${hl.size}px ${SERIF}`; hl.lines.forEach((l, i) => g.fillText(l, W / 2, H * 0.15 + (i + 0.9) * hl.size * 1.05));
  let y = H * 0.17 + hl.lines.length * hl.size * 1.05;
  // photo
  const ph = H * 0.26; g.fillStyle = '#9a968c'; g.fillRect(pad, y, W - 2 * pad, ph);
  if (o.drawing && o.drawing !== 'none') { g.save(); g.filter = 'grayscale(1)'; drawCrayon(g, o.drawing, pad, y, W - 2 * pad, ph, r); g.restore(); }
  else { g.fillStyle = '#6a665e'; g.fillRect(pad, y + ph * 0.6, W - 2 * pad, ph * 0.4); g.beginPath(); g.moveTo(pad + W * 0.2, y + ph * 0.6); g.lineTo(pad + W * 0.32, y + ph * 0.25); g.lineTo(pad + W * 0.44, y + ph * 0.6); g.fill(); }
  y += ph + H * 0.03;
  // columns of text lines
  const cols = 3, cw = (W - 2 * pad - (cols - 1) * W * 0.03) / cols; g.fillStyle = 'rgba(20,20,20,0.55)';
  for (let k = 0; k < cols; k++) for (let yy = y; yy < H - pad; yy += H * 0.016) { const lw = cw * (0.75 + r() * 0.25); g.fillRect(pad + k * (cw + W * 0.03), yy, r() < 0.08 ? lw * 0.4 : lw, H * 0.006); }
  vignette(g, W, H, 0.16); return c;
}
function drawCalendar(W, H, o, r) {
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H); grain(g, W, H, 6, 13);
  g.fillStyle = '#b52119'; g.fillRect(0, 0, W, H * 0.2); g.fillStyle = '#fff'; g.textAlign = 'center';
  const t = fit(g, (o.title || 'OCTOBER').toUpperCase(), (s) => `bold ${s}px ${SANS}`, W * 0.86, H * 0.12, 170, 20, 1); g.font = `bold ${t.size}px ${SANS}`; g.fillText(t.lines[0], W / 2, H * 0.14);
  for (let i = 0; i < 9; i++) { g.fillStyle = '#888'; g.beginPath(); g.arc(W * (0.1 + i * 0.1), H * 0.02, W * 0.014, 0, 7); g.fill(); }
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; const gx = W * 0.04, gw = W * 0.92, cw = gw / 7, gy = H * 0.24, ch = (H * 0.72) / 6;
  g.fillStyle = '#333'; g.font = `bold ${cw * 0.32}px ${SANS}`; days.forEach((d, i) => g.fillText(d, gx + (i + 0.5) * cw, gy + cw * 0.3));
  const marks = String(o.text ?? '13').split(/[ ,]+/).map(Number).filter((n) => n > 0); const target = Math.max(...marks, 0); const start = o.startDay ?? 3;
  g.strokeStyle = '#ccc'; g.lineWidth = 2;
  for (let d = 1; d <= (o.days || 31); d++) {
    const k = d - 1 + start, col = k % 7, row = Math.floor(k / 7); const x = gx + col * cw, y = gy + cw * 0.5 + row * ch;
    g.strokeRect(x, y, cw, ch); g.fillStyle = '#222'; g.textAlign = 'left'; g.font = `${cw * 0.3}px ${SANS}`; g.fillText(String(d), x + cw * 0.1, y + cw * 0.34);
    if (marks.includes(d)) { g.strokeStyle = '#d0161c'; crayon(g, circlePts(x + cw * 0.5, y + ch * 0.55, cw * 0.42, ch * 0.4, 30), '#d0161c', 7, r, true); g.strokeStyle = '#ccc'; g.lineWidth = 2; }
    else if (o.cross !== false && target && d < target) { crayon(g, [[x + cw * 0.15, y + ch * 0.2], [x + cw * 0.85, y + ch * 0.9]], '#d0161c', 5, r); crayon(g, [[x + cw * 0.85, y + ch * 0.2], [x + cw * 0.15, y + ch * 0.9]], '#d0161c', 5, r); g.strokeStyle = '#ccc'; g.lineWidth = 2; }
  }
  if (o.note) { g.fillStyle = '#d0161c'; g.font = `${H * 0.04}px ${MARKER}`; g.textAlign = 'center'; g.fillText(o.note, W / 2, H * 0.985); }
  return c;
}
function drawClockFace(W, H, o) {
  const c = canvas(W, H), g = c.getContext('2d'); const time = String(o.text || '3:00');
  if (o.analog) {
    g.fillStyle = '#f6f3ea'; g.fillRect(0, 0, W, H); const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    g.fillStyle = '#222'; g.font = `bold ${R * 0.2}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; g.fillText(String(i), cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8); }
    const [hh, mm] = time.split(':').map(Number); const hand = (a, len, w) => { g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke(); };
    hand((((hh % 12) + (mm || 0) / 60) / 12) * Math.PI * 2 - Math.PI / 2, R * 0.5, R * 0.07); hand(((mm || 0) / 60) * Math.PI * 2 - Math.PI / 2, R * 0.72, R * 0.045);
    g.fillStyle = '#b52119'; g.beginPath(); g.arc(cx, cy, R * 0.05, 0, 7); g.fill(); return c;
  }
  g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, W, H);
  const h = H * 0.62; let wTot = 0; { const tc = canvas(10, 10).getContext('2d'); wTot = sevenSeg(tc, time, 0, 0, h, '#f00'); }
  const scale = Math.min(1, (W * 0.88) / wTot); const hh = h * scale; const tw = wTot * scale;
  g.globalAlpha = 0.08; sevenSeg(g, time.replace(/\d/g, '8'), (W - tw) / 2, (H - hh) / 2, hh, '#ff2a1a'); g.globalAlpha = 1;
  sevenSeg(g, time, (W - tw) / 2, (H - hh) / 2, hh, o.color || '#ff2a1a');
  if (o.title) { g.fillStyle = o.color || '#ff2a1a'; g.font = `bold ${H * 0.1}px ${SANS}`; g.textAlign = 'right'; g.fillText(o.title, W * 0.96, H * 0.18); }
  return c;
}

// ------------------------------------------------------------------ the `card` set
export const CARD_STYLES = ['notebook', 'sign_wood', 'sign_metal', 'plaque', 'note', 'phone', 'newspaper', 'monitor', 'calendar', 'clock'];

function tex(canvasEl) { const t = new THREE.CanvasTexture(canvasEl); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 1; t.userData.disposable = true; return t; }
function faceMat(t, emissive = false, rough = 0.85) {
  const m = emissive ? new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.0, roughness: 0.25, metalness: 0 })
    : new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: 0 });
  m.userData.disposable = true; return m;
}
function plane(w, h, mat, x, y, z, rz = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.z = rz; m.receiveShadow = true; return m; }

/**
 * Build the card set into Builder b (background props) + returns extra meshes.
 * opts: { style, text, title, drawing, color, ink, analog, note, subtitle, seed }
 * Frame: camera at (0, 8, 30) fov 30 → the visible window at z=0 is 9 × 16 units centred at y=8.
 */
export function buildCard(ctx, b, P, opts = {}) {
  const style = CARD_STYLES.includes(opts.style) ? opts.style : 'notebook';
  const r = makeRng(hashStr(JSON.stringify(opts)));
  const extra = []; const CY = 8; let interior = true; let env = null;
  const wood = (z = -0.4) => { b.box(16, 24, 0.6, 0, CY, z - 0.3, 'floorwood', '#8a5a34', { cast: false }); };
  const wall = (color, mat = 'wallpaper') => b.box(30, 34, 0.6, 0, CY, -3, mat, color, { cast: false });
  b.lamp(-7, CY + 9, 9, 'interior');
  switch (style) {
    case 'notebook': {
      wood(); const t = tex(drawNotebook(900, 1600, opts, r));
      extra.push(plane(8.9, 15.8, faceMat(t), 0.15, CY - 0.1, 0, -0.012));
      b.box(8.9, 15.8, 0.05, 0.25, CY - 0.25, -0.06, 'plain', '#d8d0bc', { rz: -0.012, cast: false });
      break;
    }
    case 'note': {
      wood(); const t = tex(drawNote(800, 1000, opts, r));
      extra.push(plane(8.0, 10, faceMat(t), 0, CY + 0.3, 0, 0.035));
      b.box(2.6, 0.9, 0.04, -0.2, CY + 5.2, 0.05, 'plain', '#eae6d0', { rz: 0.12, cast: false });
      break;
    }
    case 'newspaper': {
      wood(); const t = tex(drawNewspaper(900, 1600, opts, r));
      extra.push(plane(8.8, 15.6, faceMat(t, false, 0.95), 0, CY, 0, 0.01)); break;
    }
    case 'calendar': {
      wall('#e8dcc0'); const t = tex(drawCalendar(900, 1300, opts, r));
      extra.push(plane(8.4, 12.1, faceMat(t), 0, CY - 0.6, 0)); b.box(0.3, 0.3, 0.3, 0, CY + 5.9, -0.1, 'metal', '#333'); break;
    }
    case 'phone': {
      wood(); b.box(8.4, 16.6, 0.5, 0, CY, -0.25, 'plastic', '#121214');
      const t = tex(drawPhone(780, 1560, opts)); extra.push(plane(7.7, 15.4, faceMat(t, true), 0, CY, 0.02));
      b.box(2.2, 0.35, 0.05, 0, CY + 7.9, 0.02, 'plastic', '#000'); break;
    }
    case 'monitor': {
      wall('#bcd8e4', 'plain'); b.box(9.6, 8.2, 1.4, 0, CY + 1, -0.7, 'plastic', '#d8dcdf'); b.box(0.8, 10, 0.8, 0, CY - 8, -1.2, 'metal', '#9aa0a6');
      const t = tex(drawMonitor(1024, 760, opts)); extra.push(plane(8.6, 6.4, faceMat(t, true), 0, CY + 1.2, 0.01));
      b.box(1.4, 0.4, 0.1, 3.6, CY - 2.5, 0.0, 'plastic', '#4a4f55'); b.sphere(0.18, -3.8, CY - 2.5, 0.05, 'lampglass', '#5cff8a');
      break;
    }
    case 'clock': {
      wall('#26304a', 'plain'); b.box(16, 4, 10, 0, CY - 6.5, -2, 'floorwood', '#4a3020');
      if (opts.analog) { b.prim('cyl32', 0, CY + 1, -0.2, 4.8, 0.5, 4.8, 'plastic', '#2a2a2a', { rx: Math.PI / 2 }); const t = tex(drawClockFace(800, 800, opts)); const m = new THREE.Mesh(new THREE.CircleGeometry(4.3, 48), faceMat(t, false, 0.6)); m.position.set(0, CY + 1, 0.08); extra.push(m); }
      else { b.box(9, 4.6, 3, 0, CY - 2.2, -1.2, 'plastic', '#1a1a1c'); const t = tex(drawClockFace(1000, 460, opts)); extra.push(plane(8.2, 3.8, faceMat(t, true), 0, CY - 2.2, 0.31)); }
      break;
    }
    case 'plaque': {
      interior = false; env = { all: { hemiI: 0.9 } };
      b.box(14, 24, 6, 0, CY - 2, -3.2, 'granite', '#8e9296'); b.box(15, 1.2, 7, 0, CY + 10.4, -3.0, 'granite', '#7e8286');
      b.box(8.4, 6.4, 0.3, 0, CY + 1, -0.05, 'bronze', '#7a5424');
      const t = tex(drawPlaque(1100, 820, opts)); extra.push(plane(8.0, 5.96, faceMat(t, false, 0.45), 0, CY + 1, 0.12));
      for (const [sx, sy] of [[-3.7, 3.7], [3.7, 3.7], [-3.7, -1.7], [3.7, -1.7]]) b.sphere(0.16, sx, CY + sy, 0.15, 'bronze', '#c8a060');
      b.lamp(-6, CY + 8, 10, 'post'); break;
    }
    case 'sign_wood': case 'sign_metal': {
      interior = false; const metal = style === 'sign_metal';
      // a road with forest behind; the sign board fills the frame width
      b.boxB(400, 1, 400, 0, -1, -150, 'grass', '#c8d8a8', { cast: false });
      b.push(-14, 0, -60, 0); P.road_segment(b, { length: 400, width: 14 }); b.pop();
      for (let k = 0; k < 40; k++) { const x = (r() - 0.5) * 160, z = -30 - r() * 120; if (Math.abs(x + 2) < 10 && z > -70) continue; b.push(x, 0, z, r() * 6); P.tree_pine(b, { height: 18 + r() * 14 }); b.pop(); }
      const bw = 9.6, bh = metal ? 5.4 : 5.2, by = CY + 2.2;
      for (const s of [-1, 1]) b.boxB(metal ? 0.3 : 0.7, by, metal ? 0.3 : 0.7, s * (bw / 2 - 1.2), -1, -0.6, metal ? 'metal' : 'planks', metal ? '#8a9096' : '#4a3020');
      b.box(bw + 0.4, bh + 0.4, 0.4, 0, by, -0.25, metal ? 'metal' : 'planks', metal ? '#c8ccd0' : '#3a2416');
      if (!metal) b.box(bw + 1.0, 0.45, 0.8, 0, by + bh / 2 + 0.35, -0.2, 'planks', '#3a2416');
      const t = tex(drawSignBoard(1200, Math.round(1200 * bh / bw), opts, metal)); extra.push(plane(bw, bh, faceMat(t, false, metal ? 0.45 : 0.8), 0, by, 0.0));
      break;
    }
  }
  const marks = { A: { x: 0, y: 0, z: 6, yaw: 0 }, B: { x: 3, y: 0, z: 6, yaw: 0 }, C: { x: -3, y: 0, z: 6, yaw: 0 }, D: { x: 0, y: 0, z: 3, yaw: 0 }, crowd: [] };
  for (let i = 0; i < 30; i++) marks.crowd.push({ x: -12 + (i % 10) * 2.6, y: 0, z: 8 + Math.floor(i / 10) * 3, yaw: 0 });
  const H = (pos, target, fov) => ({ pos, target, fov });
  const main = H([0, CY, 30], [0, CY, 0], 30);
  return {
    extra, interior, env, waterLevel: null, marks,
    pois: { card: { x: 0, y: CY, z: 0 }, text: { x: 0, y: CY, z: 0 } },
    cameraHints: { establishing: main, wide: main, aerial: main, close: H([0, CY + 1, 20], [0, CY + 1, 0], 30), angled: H([4, CY + 3, 28], [0, CY, 0], 30) },
    shadow: { center: [0, CY, 0], radius: 16 }, lightFocus: [0, CY, 0], windowLight: [-0.5, 0.6, 0.65],
  };
}

// ------------------------------------------------------------------ helpers for world props (note_paper, newspaper rack)
/** the `note` card's paper (same look as the card), as a canvas — used by the note_paper prop */
export function drawNoteSheet(W, H, o = {}) { return drawNote(W, H, o, makeRng(hashStr('note:' + JSON.stringify(o)))); }
/** the `newspaper` card's front page, as a canvas — used by the library newspaper rack */
export function drawNewsSheet(W, H, o = {}) { return drawNewspaper(W, H, o, makeRng(hashStr('news:' + JSON.stringify(o)))); }
