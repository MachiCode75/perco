// Shared helpers for the characters module (cache, colours, canvas, deterministic hash RNG).
import * as THREE from 'three';

export const DEG = Math.PI / 180;

/** Get-or-create from the shared ctx.textures cache (textures, materials and geometries live there). */
export function cached(ctx, key, make) {
  if (!ctx.textures) ctx.textures = new Map();
  const m = ctx.textures;
  let v = m.get(key);
  if (v === undefined) { v = make(); m.set(key, v); }
  return v;
}

// ---------------------------------------------------------------- colours
let _cc = null;
function colorCtx() {
  if (_cc) return _cc;
  try { _cc = document.createElement('canvas').getContext('2d'); } catch (e) { _cc = null; }
  return _cc;
}
/** Normalise any CSS colour (or 0xRRGGBB number) to '#rrggbb'; fallback when invalid. */
export function col(v, fallback = '#888888') {
  if (typeof v === 'number' && isFinite(v)) return '#' + (v & 0xffffff).toString(16).padStart(6, '0');
  if (typeof v !== 'string' || !v.trim()) return fallback;
  let s = v.trim();
  if (/^[0-9a-f]{6}$/i.test(s) || /^[0-9a-f]{3}$/i.test(s)) s = '#' + s;
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  const g = colorCtx();
  if (!g) return fallback;
  g.fillStyle = '#010203';
  g.fillStyle = s;
  const r = g.fillStyle;
  if (r === '#010203') return fallback;
  if (/^#[0-9a-f]{6}$/i.test(r)) return r;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(r);
  if (m) return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
  return fallback;
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
/** f < 0 darkens toward black, f > 0 lightens toward white. */
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(col(hex));
  if (f < 0) return rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f));
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}
export function mix(a, b, t) {
  const A = hexToRgb(col(a)), B = hexToRgb(col(b));
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function luminance(hex) { const [r, g, b] = hexToRgb(col(hex)); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
/** Avoid pure black so shading still reads (style rule: darkest = #151515). */
export function noPureBlack(hex) { return luminance(hex) < 0.07 ? '#151515' : hex; }

// ---------------------------------------------------------------- canvas
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
export function canvasTexture(canvas, { mipmaps = true, aniso = 2 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = mipmaps;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- deterministic hash rng
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** Standard plastic-ish material (Roblox look). */
export function plastic(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(col(color)), roughness: 0.72, metalness: 0.0, ...extra });
}
