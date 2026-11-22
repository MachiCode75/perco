// World module — v2 props (multi-reference): suburban ranch house, brownstone, civic building,
// skyline tower, power pole, swing set, treehouse, hospital bed, heart monitor, IV pole, crate, pallet,
// roller door, boarded window, garbage can, plaque, statue, guard rail, road sign, privacy fence.
// Same convention as props.js: (b, opts) into a Builder, origin = base centre, front = +Z.
import * as THREE from 'three';
import { pick, range, shade } from './core.js';
import { P } from './props.js';
import { windowUnit } from './house.js';
import { drawPlaque, drawMonitor, drawRoadSign } from './cards.js';

/** register a canvas-textured material under a unique key in ctx.worldMats (used by Builder.getMat) */
function canvasMat(ctx, key, draw, o = {}) {
  if (!ctx.worldMats) ctx.worldMats = new Map();
  let m = ctx.worldMats.get(key); if (m) return key;
  const t = new THREE.CanvasTexture(draw()); t.colorSpace = THREE.SRGBColorSpace;
  m = o.emissive ? new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: t, roughness: 0.3, vertexColors: true })
    : new THREE.MeshStandardMaterial({ map: t, roughness: o.rough ?? 0.6, metalness: o.metal || 0, vertexColors: true, transparent: !!o.transparent, alphaTest: o.transparent ? 0.5 : 0 });
  m.name = key; ctx.worldMats.set(key, m); return key;
}

// ------------------------------------------------------------------ buildings
/** single-storey stucco ranch house (ref5 desert suburb): hip roof in terracotta tiles, garage */
P.house_ranch = (b, o = {}) => {
  const r = b.rng; const W = o.width || range(r, 32, 38), D = o.depth || range(r, 20, 24), Hh = 9.5, F = 0.8;
  const color = o.color || pick(r, ['#e8dccb', '#d9c2a4', '#e6d3c7', '#cfd2c0', '#d8c8b0', '#e2c9b8']);
  const roof = o.roof || pick(r, ['#a8553a', '#9a4e36', '#7a5a4a', '#b0603e']); const trim = o.trim || '#efe9df';
  const brick = o.brick ?? r() < 0.3;
  b.box(W + 0.3, F, D + 0.3, 0, F / 2, 0, 'concrete', '#b8b2a8');
  b.box(W, Hh, D, 0, F + Hh / 2, 0, brick ? 'brick' : 'stucco', brick ? '#d8b89a' : color);
  b.box(W + 0.4, 0.8, D + 0.4, 0, F + Hh - 0.4, 0, 'satin', trim, { cast: false });
  // hip roof = prism (middle) + two square pyramids (ends)
  const ov = 1.6, RW = W + 2 * ov, RD = D + 2 * ov, rh = RD * 0.24, yT = F + Hh;
  b.prim('prism', 0, yT, 0, RD, rh, RW - RD, 'tileroof', roof, { ry: Math.PI / 2 });
  for (const s of [-1, 1]) b.prim('conef4', s * (RW - RD) / 2, yT + rh / 2, 0, RD / Math.SQRT2, rh, RD / Math.SQRT2, 'tileroof', roof, { ry: Math.PI / 4 });
  b.box(RW, 0.35, RD, 0, yT - 0.1, 0, 'satin', shade(roof, -0.15), { cast: false });
  // front facade
  const garage = o.garage !== false; const gx = garage ? W / 2 - 7 : 0; const doorX = garage ? -W * 0.1 : 0;
  b.push(0, 0, D / 2, 0);
  if (garage) { b.box(11, 8.4, 0.2, gx, F + 4.2 - 0.6, 0.1, 'satin', trim); b.quad(10, 7.6, gx, F + 3.8 - 0.6, 0.22, 'rollerdoor', o.garageColor || '#e8e4dc', { cast: false }); }
  b.box(4.6, 8.2, 0.3, doorX, F + 4.0, 0.15, 'satin', trim); b.quad(3.6, 7.2, doorX, F + 3.6, 0.32, 'door', o.door || pick(r, ['#5a3a26', '#7a2a1e', '#3a4a5a', '#e8e4dc']), { cast: false });
  for (const wx of garage ? [-W / 2 + 5, doorX - 6.5] : [-W / 2 + 6, W / 2 - 6, -6.5, 6.5]) if (Math.abs(wx - doorX) > 3.5) windowUnit(b, wx, F + 2.6, 5, 4.6, { variant: pick(r, [0, 6, 7, 1]), trim: o.frame || '#d8d2c8', shutters: false });
  b.box(7, 0.4, 4, doorX, F + 8.6, 2, 'tileroof', roof);  // entry overhang
  for (const s of [-1, 1]) b.box(0.4, 8, 0.4, doorX + s * 3.1, F + 4, 3.6, 'satin', trim);
  b.box(6, F, 3, doorX, F / 2, 1.6, 'concrete', '#c8c2b8', { cast: false });
  b.box(0.5, 0.8, 0.5, doorX + 2.8, F + 6.3, 0.4, 'lampglass', '#fff3c8', { cast: false }); b.lamp(doorX + 2.8, F + 6.3, 1.2, 'porch');
  b.pop();
  for (const s of [-1, 1]) { b.push(s * W / 2, 0, 0, s * Math.PI / 2); windowUnit(b, 0, F + 2.6, 4, 4.4, { variant: 7, trim: o.frame || '#d8d2c8' }); b.pop(); }
  b.push(0, 0, -D / 2, Math.PI); windowUnit(b, -W / 4, F + 2.6, 5, 4.4, { variant: 0, trim: '#d8d2c8' }); windowUnit(b, W / 4, F + 2.6, 4, 4.4, { variant: 7, trim: '#d8d2c8' }); b.pop();
  if (o.boarded) { b.push(-W / 2 + 5, 0, D / 2 + 0.3, 0); P.boarded_window(b, { width: 5.4, height: 5, y: F + 2.6 }); b.pop(); }
  return { w: W, d: D, frontZ: D / 2 + 3.5, door: { x: doorX, y: 0, z: D / 2 + 3.5 }, garage: { x: gx, z: D / 2 }, height: yT + rh };
};
/** brick brownstone row house with stoop (ref6). opts: floors 3-4, color (brick tint), width */
P.brownstone = (b, o = {}) => {
  const r = b.rng; const W = o.width || 18, D = o.depth || 24, floors = o.floors || pick(r, [3, 3, 4]), FH = 10.5, base = 5;
  const tint = o.color || pick(r, ['#ffffff', '#e8c0a8', '#d89a7a', '#f0d0b8', '#c88a70']); const trim = '#ece6da';
  const top = base + floors * FH;
  b.box(W, base, D, 0, base / 2, 0, 'stone', '#8a7a6c');
  b.box(W, top - base, D, 0, base + (top - base) / 2, 0, 'brick', tint);
  b.box(W + 0.9, 1.6, D + 0.9, 0, top + 0.3, 0, 'satin', o.cornice || '#4a3e36'); b.box(W + 1.2, 0.5, D + 1.2, 0, top + 1.2, 0, 'satin', o.cornice || '#4a3e36');
  for (let k = 0; k < 6; k++) b.box(0.6, 1.0, 0.8, -W / 2 + 1.5 + k * (W - 3) / 5, top - 0.7, D / 2 + 0.5, 'satin', o.cornice || '#4a3e36', { cast: false });
  b.push(0, 0, D / 2, 0);
  // stoop: door on the parlour floor (y=base) at one side
  const sx = o.stoopX ?? (W / 2 - 4) * (o.flip ? -1 : 1);
  b.box(4.6, 8.6, 0.3, sx, base + 4.3, 0.15, 'satin', '#5a4636'); b.quad(3.4, 7.6, sx, base + 3.9, 0.32, 'door', o.door || '#3a2418', { cast: false });
  b.box(5.4, 0.6, 1.2, sx, base + 8.8, 0.6, 'satin', trim);
  const n = 6; for (let i = 0; i < n; i++) b.boxB(5, base * (n - i) / n, 1.3, sx, 0, 0.65 + i * 1.3, 'stone', '#9a8a7a');
  b.boxB(5, base, 2, sx, 0, 0.6 + 1, 'stone', '#9a8a7a');
  for (const s of [-1, 1]) { b.beam(sx + s * 2.6, base + 3, 0.6, sx + s * 2.6, 3, 0.6 + n * 1.3, 0.18, 'metal', '#151515', { cast: false }); for (let i = 0; i <= n; i += 2) b.boxB(0.14, 3, 0.14, sx + s * 2.6, base * (n - i) / n, 0.65 + i * 1.3, 'metal', '#151515', { cast: false }); }
  const wxs = [-W / 2 + 3.2, -W / 2 + 7.6, W / 2 - 3.2].filter((x) => Math.abs(x - sx) > 3.2);
  for (let f = 0; f < floors; f++) for (const wx of (f === 0 ? wxs : [-W / 2 + 3.2, 0, W / 2 - 3.2])) {
    const y0 = base + f * FH + 2.4; windowUnit(b, wx, y0, 3, 6, { variant: pick(r, [0, 1, 6, 7, 2]), trim });
    if (r() < 0.15 && b.lod !== 'far') { b.box(2.2, 1.4, 1.6, wx, y0 + 0.8, 0.9, 'metal', '#c8c8c4'); }
  }
  // basement windows
  for (const wx of wxs) b.quad(2.4, 1.6, wx, 2.4, 0.05, 'win_dark', '#ffffff', { uvRect: [0.75, 0.01, 0.99, 0.49], cast: false });
  b.pop();
  return { w: W, d: D, frontZ: D / 2 + 8.5, door: { x: sx, y: base, z: D / 2 + 0.6 }, stoop: { x: sx, y: 0, z: D / 2 + 8.4 }, height: top + 1.5 };
};
/** white neoclassical civic building (town hall / museum) with portico, pediment and small dome */
P.civic_building = (b, o = {}) => {
  const W = o.width || 44, D = o.depth || 30, Hh = 20, c = o.color || '#ece8df', trim = '#f8f6f0';
  b.boxB(W + 2, 2, D + 2, 0, 0, 0, 'stone', '#b8b2a8');
  b.boxB(W, Hh, D, 0, 2, 0, 'stucco', c);
  b.boxB(W + 1, 1.4, D + 1, 0, 2 + Hh, 0, 'satin', trim);
  const pw = W * 0.55; for (let i = 0; i < 4; i++) b.boxB(pw, 0.8, 9 - i * 2, 0, 0, D / 2 + 4.5 - i, 'stone', '#c8c2b8');
  for (let i = 0; i < 6; i++) { const x = -pw / 2 + 1.5 + i * ((pw - 3) / 5); b.cyl(0.9, Hh - 1, x, 2, D / 2 + 5, 'satin', trim, 12); }
  b.boxB(pw + 1, 1.6, 8, 0, 1 + Hh, D / 2 + 3.6, 'satin', trim);
  b.prim('prism', 0, 2.6 + Hh, D / 2 + 3.6, pw + 1, 5.5, 8, 'satin', trim);
  b.prim('cylf16', 0, 2 + Hh + 3, -2, 7, 5, 7, 'stucco', c); b.prim('hemi16', 0, 2 + Hh + 5.5, -2, 7, 6, 7, 'satin', o.dome || '#7a8a92');
  b.push(0, 0, D / 2, 0); for (const wx of [-W / 2 + 4, W / 2 - 4]) for (const y of [5, 13]) windowUnit(b, wx, y, 3.2, 5.6, { variant: 7, trim, lit: true }); b.quad(4.6, 8, 0, 6, 0.05, 'door', '#5a4636', { cast: false }); b.pop();
  return { w: W, d: D, frontZ: D / 2 + 9, height: Hh + 14 };
};
/** skyline tower (lit windows at night via the 'tower' material) */
P.tower = (b, o = {}) => {
  const w = o.width || 30, d = o.depth || 30, h = o.height || 120;
  b.boxB(w, h, d, 0, 0, 0, 'tower', o.color || '#c8d0d8');
  b.boxB(w * 0.7, h * 0.12, d * 0.7, 0, h, 0, 'tower', o.color || '#c8d0d8');
  if (o.spire) b.boxB(0.8, h * 0.18, 0.8, 0, h * 1.12, 0, 'metal', '#8a9096');
};

// ------------------------------------------------------------------ street & yard
P.power_pole = (b, o = {}) => {
  const H = o.height || 26; const c = o.color || '#6a4e36';
  b.cylf(0.45, H, 0, 0, 0, 'planks', c, 8);
  b.box(8.5, 0.45, 0.45, 0, H - 1.6, 0, 'planks', shade(c, -0.05)); b.box(5.5, 0.4, 0.4, 0, H - 4.2, 0, 'planks', shade(c, -0.05));
  for (const x of [-3.8, 0.8, 3.8]) b.cyl(0.16, 0.7, x, H - 1.35, 0, 'plastic', '#8fa88a', 6, { cast: false });
  if (o.transformer !== false) { b.cyl(0.9, 2.4, 0.9, H - 8.5, 0, 'metal', '#8a9096', 10); b.box(0.5, 0.4, 0.6, 0.45, H - 7, 0, 'metal', '#555', { cast: false }); }
  return { tops: [[-3.8, H - 1.0, 0], [0.8, H - 1.0, 0], [3.8, H - 1.0, 0]] };
};
/** wires between two pole tops (world-local points), slight sag */
export function wire(b, a, c, sag = 1.2) {
  const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - sag, (a[2] + c[2]) / 2];
  b.beam(a[0], a[1], a[2], mid[0], mid[1], mid[2], 0.09, 'plastic', '#1a1a1a', { cast: false }); b.beam(mid[0], mid[1], mid[2], c[0], c[1], c[2], 0.09, 'plastic', '#1a1a1a', { cast: false });
}
P.garbage_can = (b, o = {}) => { // wheelie bin
  const c = o.color || pick(b.rng, ['#2f4f3a', '#2a2e33', '#3a5a8a', '#4a4e52']);
  b.boxB(2.2, 3.4, 2.4, 0, 0.4, 0, 'plastic', c); b.boxB(2.4, 0.3, 2.7, 0, 3.8, -0.1, 'plastic', shade(c, -0.05));
  for (const s of [-1, 1]) b.prim('cyl10', s * 0.9, 0.45, -1.0, 0.45, 0.3, 0.45, 'plastic', '#111', { rz: Math.PI / 2 });
  b.box(1.6, 0.25, 0.3, 0, 3.6, -1.35, 'plastic', shade(c, -0.1));
};
P.privacy_fence = (b, o = {}) => {
  const L = o.length || 12, H = o.height || 6.5, c = o.color || '#9a7452';
  b.box(L, H, 0.3, 0, H / 2, 0, 'woodpanel', c);
  for (let x = -L / 2; x <= L / 2 + 0.01; x += 8) b.boxB(0.6, H + 0.4, 0.6, Math.min(x, L / 2), 0, -0.3, 'planks', shade(c, -0.1));
  b.box(L, 0.4, 0.3, 0, H * 0.25, -0.3, 'planks', shade(c, -0.1), { cast: false }); b.box(L, 0.4, 0.3, 0, H * 0.8, -0.3, 'planks', shade(c, -0.1), { cast: false });
};
P.swing_set = (b, o = {}) => {
  const L = o.length || 12, H = 9, c = o.color || '#c8302a';
  b.beam(-L / 2 - 0.6, H, 0, L / 2 + 0.6, H, 0, 0.45, 'metal', c);
  for (const s of [-1, 1]) for (const z of [-1, 1]) b.beam(s * L / 2, H, 0, s * (L / 2 + 0.8), 0, z * 3.4, 0.35, 'metal', c);
  for (const sx of [-L / 4, L / 4]) { for (const dx of [-0.8, 0.8]) b.beam(sx + dx, H, 0, sx + dx, 2.2, 0, 0.08, 'metal', '#333', { cast: false }); b.box(2.0, 0.2, 1.0, sx, 2.1, 0, 'plastic', o.seat || '#1f2b46'); }
};
P.swing = (b, o = {}) => P.swing_set(b, o);
P.treehouse = (b, o = {}) => {
  const ph = o.height || 11, c = o.wood || '#8a5a34';
  b.cylf(1.6, ph + 10, 0, 0, 0, 'plain', '#5a3e26', 8);
  b.blob(7, 0, ph + 13, 0, 'foliage', '#3f8a35', { sy: 0.8, detail: 1 }); b.blob(5, 4.5, ph + 10, 2, 'foliage', '#4a9a3c', { detail: 1 }); b.blob(5, -4.5, ph + 11, -1.5, 'foliage', '#468f38', { detail: 1 });
  for (const [x, z] of [[-4, 4], [4, 4], [-4, -4], [4, -4]]) if (x < 0 || z > 0) b.boxB(0.6, ph, 0.6, x, 0, z, 'planks', shade(c, -0.1));
  b.box(10, 0.6, 10, 0, ph, 0, 'planks', c);
  b.boxB(7, 6, 6.5, 0.5, ph + 0.3, -1, 'woodpanel', c);
  b.prim('prism', 0.5, ph + 6.3, -1, 8, 3, 7.5, 'planks', shade(c, -0.15));
  b.box(2.4, 2, 0.1, 0.5, ph + 3.6, 2.27, 'plain', '#2a1a10', { cast: false }); b.box(1.8, 4, 0.1, -2, ph + 2.3, 2.27, 'plain', '#2a1a10', { cast: false });
  for (const x of [-5, 5]) b.box(0.25, 2.2, 10, x, ph + 1.4, 0, 'planks', shade(c, 0.05), { cast: false });
  b.box(10, 0.25, 0.25, 0, ph + 2.4, 5, 'planks', shade(c, 0.05), { cast: false });
  for (const s of [-1, 1]) b.beam(3 + s * 0.8, 0, 7.5, 3 + s * 0.8, ph + 0.4, 5, 0.25, 'planks', c, { cast: false });
  for (let k = 1; k < 8; k++) { const t = k / 8; b.box(1.8, 0.2, 0.25, 3, ph * t, 7.5 - 2.5 * t, 'planks', c, { cast: false }); }
};
P.crate = (b, o = {}) => {
  const s = o.size || 3.2; const c = o.color || '#b08850';
  b.boxB(s, s, s, 0, 0, 0, 'planks', c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxB(0.35, s + 0.05, 0.35, sx * (s / 2 - 0.15), -0.02, sz * (s / 2 - 0.15), 'planks', shade(c, -0.15), { cast: false });
  b.beam(-s / 2 + 0.2, 0.2, s / 2 + 0.04, s / 2 - 0.2, s - 0.2, s / 2 + 0.04, 0.3, 'planks', shade(c, -0.12), { cast: false });
};
P.pallet = (b, o = {}) => { const c = o.color || '#a07a4a'; for (let i = 0; i < 5; i++) b.boxB(4, 0.2, 0.6, 0, 0.6, -1.6 + i * 0.8, 'planks', c); for (const x of [-1.6, 0, 1.6]) b.boxB(0.5, 0.6, 4, x, 0, 0, 'planks', shade(c, -0.1)); };
P.roller_door = (b, o = {}) => { // in a wall plane z=0; open 0..1 raises the shutter showing the dark interior
  const W = o.width || 16, H = o.height || 14, open = Math.max(0, Math.min(1, o.open || 0)), c = o.color || '#c8ccd0';
  b.box(W + 1.2, 0.8, 0.6, 0, H + 0.4, 0.3, 'metal', '#5a5f66'); for (const s of [-1, 1]) b.box(0.6, H, 0.6, s * (W / 2 + 0.3), H / 2, 0.3, 'metal', '#5a5f66');
  const sh = H * (1 - open); if (sh > 0.1) b.quad(W, sh, 0, H - sh / 2, 0.12, 'rollerdoor', c, { cast: false, uvRect: [0, 0, 1, sh / H] });
  if (open > 0) b.quad(W, H - sh, 0, (H - sh) / 2, -0.4, 'plain', '#0e0e10', { cast: false });
};
P.boarded_window = (b, o = {}) => { // planks nailed over a window opening on a wall plane z=0
  const w = o.width || 5, h = o.height || 5, y = o.y ?? 3, c = o.color || '#8a6a46';
  b.box(w + 0.6, h + 0.6, 0.2, 0, y + h / 2, 0.1, 'plain', '#1a1714', { cast: false });
  const n = o.boards || 4; for (let i = 0; i < n; i++) { const yy = y + (i + 0.5) * h / n; b.box(w + 1.4, h / n * 0.7, 0.3, 0, yy, 0.35, 'planks', shade(c, (b.rng() - 0.5) * 0.12), { rz: (b.rng() - 0.5) * 0.18 }); }
  b.box(w * 1.25, 0.8, 0.3, 0, y + h / 2, 0.55, 'planks', shade(c, -0.08), { rz: Math.atan2(h, w) * 0.8 });
};
P.guard_rail = (b, o = {}) => { // along X
  const L = o.length || 24; const n = Math.max(1, Math.round(L / 6));
  for (let i = 0; i <= n; i++) b.boxB(0.4, 2.6, 0.4, -L / 2 + i * L / n, 0, -0.3, 'metal', '#7a7f86');
  b.box(L, 1.1, 0.25, 0, 2.1, 0, 'corrugated', '#c8ccd0', { uvScale: [1, 2] });
};
P.road_sign = (b, o = {}) => { // kinds: curve | stop | speed (o.text = number)
  const kind = o.kind || 'curve';
  const key = canvasMat(b.ctx, 'roadsign:' + kind + ':' + (o.text || ''), () => drawRoadSign(kind, o), { transparent: true, rough: 0.4 });
  b.cyl(0.14, 8.5, 0, 0, 0, 'metal', '#8a9096', 6);
  b.quad(3.2, 3.2, 0, 7.4, 0.18, key, '#ffffff', { cast: true });
  b.quad(3.2, 3.2, 0, 7.4, 0.12, 'metal', '#9aa0a6', { ry: Math.PI });
};

// ------------------------------------------------------------------ hospital
P.hospital_bed = (b, o = {}) => { // head at −Z
  const W = o.width || 6, L = o.length || 11, c = o.sheet || '#bcd8ec';
  b.boxB(W, 0.5, L, 0, 1.6, 0, 'metal', '#d8dcdf');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.boxB(0.3, 1.6, 0.3, sx * (W / 2 - 0.3), 0.4, sz * (L / 2 - 0.4), 'metal', '#a0a6ac'); b.sphere(0.4, sx * (W / 2 - 0.3), 0.4, sz * (L / 2 - 0.4), 'plastic', '#333', 8); }
  b.boxB(W - 0.4, 1.0, L * 0.62, 0, 2.1, L * 0.18, 'fabric', '#f4f6f8');
  b.boxB(W - 0.2, 0.7, L * 0.55, 0, 2.6, L * 0.2, 'fabric', c);
  b.prim('box', 0, 3.7, -L * 0.25, W - 0.4, 1.0, L * 0.42, 'fabric', '#f4f6f8', { rx: -0.45 });
  b.prim('box', 0, 5.0, -L * 0.36, W - 1.6, 0.9, 1.8, 'fabric', '#ffffff', { rx: -0.45 });
  b.boxB(W + 0.4, 4.2, 0.4, 0, 1.6, -L / 2, 'plastic', '#e8ecef'); b.boxB(W + 0.4, 2.6, 0.4, 0, 1.6, L / 2, 'plastic', '#e8ecef');
  for (const s of [-1, 1]) b.box(0.2, 1.0, L * 0.4, s * (W / 2 + 0.1), 3.4, -L * 0.1, 'metal', '#c8ccd0');
};
P.heart_monitor = (b, o = {}) => { // on a rolling stand; screen faces +Z
  const key = canvasMat(b.ctx, 'monitor:' + (o.text ?? '72'), () => drawMonitor(512, 380, o), { emissive: true });
  const y = o.y ?? 8.5;
  b.cyl(1.4, 0.3, 0, 0, 0, 'plastic', '#5a5f66', 10); b.cyl(0.2, y - 1.5, 0, 0.3, 0, 'metal', '#a0a6ac', 8);
  b.box(4.6, 3.6, 1.6, 0, y, 0, 'plastic', '#d4d8dc'); b.quad(4.0, 2.96, 0, y + 0.1, 0.81, key, '#ffffff', { cast: false });
};
P.iv_pole = (b) => { b.cyl(1.2, 0.25, 0, 0, 0, 'metal', '#5a5f66', 10); b.cyl(0.1, 9, 0, 0.25, 0, 'metal', '#c8ccd0', 6); b.box(2, 0.12, 0.12, 0, 9.2, 0, 'metal', '#c8ccd0'); b.box(0.9, 1.4, 0.4, 0.8, 8.2, 0, 'plastic', '#eaf2f6'); b.cyl(0.05, 4, 0.8, 3.5, 0, 'plastic', '#dfe8ee', 4, { cast: false }); };
P.curtain_track = (b, o = {}) => { // hospital privacy curtain hanging from ceiling height o.h along X
  const L = o.length || 10, h = o.h || 11.5, c = o.color || '#9fc8c8';
  b.box(L, 0.15, 0.15, 0, h, 0, 'metal', '#c8ccd0', { cast: false });
  const n = Math.round(L / 1.2); for (let i = 0; i < n; i++) b.boxB(1.25, h - 1.2, 0.3, -L / 2 + (i + 0.5) * L / n, 1.0, (i % 2) * 0.35, 'fabric', shade(c, (i % 2) * -0.04));
};

// ------------------------------------------------------------------ monuments
P.plaque = (b, o = {}) => { // bronze plaque on a wall plane z=0, centred at y (o.y)
  const w = o.width || 4, h = o.height || 3, y = o.y ?? 0;
  const key = canvasMat(b.ctx, 'plaque:' + (o.title ?? '') + '|' + (o.text ?? ''), () => drawPlaque(768, Math.round(768 * h / w), o), { rough: 0.4, metal: 0.4 });
  b.box(w + 0.3, h + 0.3, 0.2, 0, y, 0.1, 'bronze', '#6a4a20'); b.quad(w, h, 0, y, 0.21, key, '#ffffff', { cast: false });
};
/** statue on a granite plinth with a plaque; kind 'head' (giant bust, ref6) | 'figure' (blocky person) */
P.statue = (b, o = {}) => {
  const kind = o.kind || 'head', bronze = o.color || '#4a3a2a'; const ph = o.plinth || 7, pw = 8;
  b.boxB(pw + 2, 1, pw + 2, 0, 0, 0, 'granite', '#8a8e92'); b.boxB(pw, ph, pw, 0, 1, 0, 'granite', '#9a9ea2'); b.boxB(pw + 1, 0.8, pw + 1, 0, 1 + ph, 0, 'granite', '#8a8e92');
  b.push(0, 0, pw / 2, 0); P.plaque(b, { y: 1 + ph * 0.55, width: 3.6, height: 2.4, title: o.title ?? 'ELIAS HART', text: o.text ?? 'THE ONE WHO NEVER SLEPT' }); b.pop();
  const y0 = 1.8 + ph;
  if (kind === 'figure') {
    const s = o.scale || 1.6; const c = bronze;
    b.boxB(2 * s, 2 * s, 1 * s, -0.5 * s, y0, 0, 'bronze', c); b.boxB(1 * s, 2 * s, 1 * s, 0.5 * s + 0.0, y0, 0, 'bronze', c);
    b.boxB(2 * s, 2 * s, 1 * s, 0, y0 + 2 * s, 0, 'bronze', c); b.boxB(1 * s, 2 * s, 1 * s, -1.5 * s, y0 + 2 * s, 0, 'bronze', c); b.boxB(1 * s, 2 * s, 1 * s, 1.5 * s, y0 + 2 * s, 0, 'bronze', c, { rx: -0.4 });
    b.boxB(1.2 * s, 1.2 * s, 1.2 * s, 0, y0 + 4 * s, 0, 'bronze', c);
  } else {
    const c = bronze; // big stylised head (moai-like bust)
    b.boxB(6.2, 2.4, 4.6, 0, y0, 0, 'bronze', shade(c, -0.05));
    b.boxB(5.4, 8.5, 5.0, 0, y0 + 2.2, 0, 'bronze', c);
    b.boxB(5.8, 1.3, 5.4, 0, y0 + 9.6, -0.2, 'bronze', shade(c, 0.03));
    b.box(4.6, 0.9, 1.0, 0, y0 + 7.6, 2.6, 'bronze', shade(c, -0.08));
    b.prim('wedge', 0, y0 + 4.2, 2.9, 1.5, 3.4, 1.6, 'bronze', shade(c, 0.02));
    for (const s of [-1, 1]) { b.box(1.3, 0.6, 0.3, s * 1.4, y0 + 6.8, 2.55, 'plastic', '#1a140e'); b.box(0.8, 3, 0.8, s * 2.9, y0 + 6, 0, 'bronze', c); }
    b.box(2.6, 0.5, 0.3, 0, y0 + 3.2, 2.55, 'plastic', '#1a140e');
  }
};
