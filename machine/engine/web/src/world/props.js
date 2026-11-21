// World module — placeable props library. Every prop is a function (b, opts) that draws into a
// Builder at the current transform: origin = base centre, front = +Z, 1 unit = 1 stud.
// createProp() (index.js) wraps one prop into a standalone merged Object3D; sets call these
// functions directly so a whole set merges into a handful of draw calls.
import * as THREE from 'three';
import { pick, range, shade, col } from './core.js';
import { buildHouse, buildChurch, windowUnit, HOUSE_COLORS } from './house.js';
import { windowRect, artRect, signTexture } from './textures.js';
import { signMaterial } from './materials.js';

const WOOD = '#6b4a30', DARKWOOD = '#4a3020', DOCKWOOD = '#7a5a40', BLACK = '#1c1c1f', WHITE = '#f6f5f0';
const LEAF = ['#4f9a3c', '#5aa443', '#468c37', '#62ad48'];
const PINE = ['#3f8a3a', '#4b9a40', '#57a547', '#3a7d36'];
const FLOWERS = ['#e0303a', '#f05a8a', '#ffffff', '#f2c230', '#b05ad0', '#ff7a3a'];

export const P = {};

// ------------------------------------------------------------------ buildings
P.house_victorian = (b, o = {}) => buildHouse(b, o);
P.church = (b, o = {}) => buildChurch(b, o);

// ------------------------------------------------------------------ vegetation
P.tree_pine = (b, o = {}) => {
  const r = b.rng; const h = o.height || range(r, 15, 22); const c = o.color || pick(r, PINE); const s = h / 18;
  b.cylf(0.55 * s, 3.2 * s, 0, 0, 0, 'plain', '#6a4a32', 6);
  const tiers = 3; let y = 2.2 * s;
  for (let i = 0; i < tiers; i++) {
    const rr = (4.4 - i * 1.1) * s * (o.wide || 1); const hh = (7.6 - i * 1.0) * s;
    b.cone(rr, hh, 0, y, 0, 'foliage', i % 2 ? shade(c, 0.03) : c, 7, true, { ry: i * 0.6 });
    y += hh * 0.52;
  }
};
P.tree_round = (b, o = {}) => {
  const r = b.rng; const s = (o.height || range(r, 13, 17)) / 15; const c = o.color || pick(r, LEAF);
  b.cylf(0.7 * s, 7 * s, 0, 0, 0, 'plain', '#6e4c32', 6);
  b.blob(4.2 * s, 0, 9.5 * s, 0, 'foliage', c, { sy: 0.9 });
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) { const a = i * 2.4 + r(); b.blob(range(r, 2.4, 3.2) * s, Math.cos(a) * 2.8 * s, (8.4 + r() * 2.5) * s, Math.sin(a) * 2.8 * s, 'foliage', shade(c, (r() - 0.5) * 0.08), { ry: a }); }
};
P.bush = (b, o = {}) => {
  const r = b.rng; const s = o.size || range(r, 1.2, 1.8); const c = o.color || pick(r, LEAF); const flowers = o.flowers !== undefined ? o.flowers : r() < 0.6;
  const n = o.blobs || 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * s * 1.1, y = s * 0.85;
    b.blob(s, x, y, 0, 'foliage', shade(c, (r() - 0.5) * 0.06), { ry: r() * 3 });
    if (flowers && b.lod !== 'far') { const fc = o.flowerColor || pick(r, ['#e0303a', '#e0303a', '#f05a8a']); for (let k = 0; k < 5; k++) { const a = k * 1.3 + i, el = 0.3 + (k % 3) * 0.3; b.box(0.32, 0.32, 0.32, x + Math.cos(a) * s * Math.cos(el) * 0.95, y + Math.sin(el) * s * 0.95, Math.sin(a) * s * Math.cos(el) * 0.95, 'plain', fc, { cast: false }); } }
  }
};
P.hedge = (b, o = {}) => { const L = o.length || 8, H = o.height || 2.4; b.boxB(L, H, o.depth || 2, 0, 0, 0, 'foliage', o.color || '#3f8a35'); };
P.flowerbed = (b, o = {}) => {
  const r = b.rng; const w = o.width || 6, d = o.depth || 2.4; const brd = o.border || '#a04a32';
  b.boxB(w, 0.6, 0.35, 0, 0, d / 2, o.borderMat || 'brick', '#ffffff'); b.boxB(w, 0.6, 0.35, 0, 0, -d / 2, o.borderMat || 'brick', '#ffffff');
  b.boxB(0.35, 0.6, d, -w / 2, 0, 0, o.borderMat || 'brick', '#ffffff'); b.boxB(0.35, 0.6, d, w / 2, 0, 0, o.borderMat || 'brick', '#ffffff');
  b.boxB(w - 0.3, 0.45, d - 0.3, 0, 0, 0, 'dirt', '#ffffff', { cast: false });
  if (brd && false) b.box(0, 0, 0, 0, 0, 0, 'plain', brd);
  const nx = Math.max(2, Math.round(w / 1.3)), nz = Math.max(1, Math.round(d / 1.4));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = -w / 2 + (i + 0.5) * (w / nx), z = -d / 2 + (j + 0.5) * (d / nz);
    if (o.bushy !== false) b.blob(0.62, x, 0.85, z, 'foliage', pick(r, LEAF), { sy: 0.8 });
    if (b.lod !== 'far') { const fc = o.flowerColor || pick(r, FLOWERS); for (let k = 0; k < 3; k++) b.box(0.3, 0.3, 0.3, x + Math.cos(k * 2.1 + i) * 0.4, 1.3 + (k % 2) * 0.15, z + Math.sin(k * 2.1 + i) * 0.4, 'plain', fc, { cast: false }); }
  }
};
P.planter = (b, o = {}) => { // brown wooden planter box with flowers (street furniture in the reference)
  const r = b.rng; const w = o.width || 4.5, d = o.depth || 1.8, h = o.height || 1.4;
  b.boxB(w, h, d, 0, 0, 0, 'planks', '#8a5a3a'); b.boxB(w - 0.3, 0.3, d - 0.3, 0, h, 0, 'foliage', '#3f8a35');
  for (let i = 0; i < Math.round(w / 0.7); i++) b.box(0.35, 0.35, 0.35, -w / 2 + 0.4 + i * 0.7, h + 0.45, (i % 2 - 0.5) * 0.6, 'plain', o.flowerColor || pick(r, FLOWERS), { cast: false });
};
P.potted_plant = (b, o = {}) => { const s = o.size || 1; b.cyl(0.6 * s, 1.0 * s, 0, 0, 0, 'plain', o.pot || '#b5653a', 8); b.blob(0.9 * s, 0, 1.5 * s, 0, 'foliage', o.color || '#4d9a3c'); };
P.rock = (b, o = {}) => { const r = b.rng; const s = o.size || range(r, 1, 2.5); b.prim('dodec', 0, s * 0.35, 0, s, s * 0.7, s * range(r, 0.8, 1.2), 'stone', o.color || '#8e8c88', { ry: r() * 6 }); };
P.reeds = (b, o = {}) => { const r = b.rng; const n = o.count || 7; for (let i = 0; i < n; i++) { const h = range(r, 2, 3.6); b.box(0.15, h, 0.15, (r() - 0.5) * 1.6, h / 2, (r() - 0.5) * 1.6, 'foliage', pick(r, ['#6a8f3a', '#7ea04a', '#5a7f34']), { rz: (r() - 0.5) * 0.3, cast: false }); } };
P.seaweed = (b, o = {}) => { const r = b.rng; const n = o.count || 5; for (let i = 0; i < n; i++) { const h = range(r, 2, 5); const x = (r() - 0.5) * 2, z = (r() - 0.5) * 2; for (let k = 0; k < 3; k++) b.box(0.35, h / 3, 0.12, x + Math.sin(k + i) * 0.25, h / 6 + k * h / 3, z, 'foliage', pick(r, ['#2f7a4a', '#3d8a3e', '#2a6a52']), { rz: Math.sin(k * 1.7 + i) * 0.25, cast: false }); } };
P.hill = (b, o = {}) => { const r = b.rng; const R = o.radius || 60, H = o.height || 30; b.prim('ico1', 0, 0, 0, R, H, R * range(r, 0.7, 1.1), 'foliage', o.color || '#5f8a48', { ry: r() * 6, cast: false }); };

// ------------------------------------------------------------------ street furniture
P.bench = (b, o = {}) => {
  const L = o.length || 6, wood = o.wood || '#7a4e2e', metal = o.metal || BLACK;
  const seatY = 2.0;
  for (let i = 0; i < 3; i++) b.box(L, 0.22, 0.55, 0, seatY - 0.11, -0.7 + i * 0.65, 'planks', wood);
  for (let i = 0; i < 2; i++) b.box(L, 0.55, 0.18, 0, seatY + 0.9 + i * 0.8, -1.25, 'planks', wood, { rx: -0.12 });
  for (const s of [-1, 1]) {
    const x = s * (L / 2 - 0.5);
    b.box(0.25, seatY, 0.25, x, seatY / 2, 0.55, 'metal', metal); b.box(0.25, seatY + 2.2, 0.25, x, (seatY + 2.2) / 2, -1.15, 'metal', metal, { rx: -0.08 });
    b.box(0.25, 0.22, 2.0, x, seatY - 0.3, -0.25, 'metal', metal);
    b.box(0.22, 0.2, 1.8, x, seatY + 1.1, -0.2, 'metal', metal); b.box(0.22, 1.1, 0.22, x, seatY + 0.55, 0.6, 'metal', metal);
  }
};
P.picnic_table = (b, o = {}) => {
  const L = o.length || 7, w = o.wood || '#8a5a36';
  b.boxB(L, 0.3, 3.2, 0, 3.0, 0, 'planks', w);
  for (const s of [-1, 1]) { b.boxB(L, 0.25, 1.1, 0, 1.8, s * 2.6, 'planks', w); for (const x of [-L / 2 + 0.8, L / 2 - 0.8]) { b.box(0.3, 3.4, 0.3, x, 1.6, s * 1.2, 'planks', w, { rx: s * 0.45 }); } }
};
P.lamp_post = (b, o = {}) => {
  const H = o.height || 11, c = o.color || BLACK;
  b.cylf(0.55, 1.0, 0, 0, 0, 'metal', c, 8); b.cyl(0.22, H - 2.2, 0, 1.0, 0, 'metal', c, 8);
  b.boxB(0.8, 0.25, 0.8, 0, H - 2.4, 0, 'metal', c);
  b.boxB(0.95, 1.5, 0.95, 0, H - 2.15, 0, 'lampglass', '#fff6da', { cast: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxB(0.14, 1.5, 0.14, sx * 0.5, H - 2.15, sz * 0.5, 'metal', c, { cast: false });
  b.prim('conef4', 0, H - 0.65 + 0.3, 0, 0.95, 0.6, 0.95, 'metal', c, { ry: Math.PI / 4 });
  b.cyl(0.12, 0.5, 0, H - 0.4, 0, 'metal', c, 6);
  b.lamp(0, H - 1.4, 0, 'post');
};
P.lifebuoy = (b, o = {}) => {
  const post = o.post !== false; const y = post ? 4.6 : 1.15;
  if (post) { b.boxB(0.5, 6.0, 0.5, 0, 0, 0, 'satin', WHITE); b.box(0.3, 0.3, 0.6, 0, 5.6, 0.3, 'satin', WHITE); }
  const red = col('#d62b22'), white = col('#f8f8f8');
  b.prim('torus18', 0, y, post ? 0.45 : 0, 1.05, 1.05, 1.05, 'plastic', '#ffffff', { vcol: (v) => { const a = Math.atan2(v.y - (b.m.elements[13] + y), v.x - b.m.elements[12]); return (Math.floor((a + Math.PI) / (Math.PI / 4)) % 2) ? red : white; } });
};
P.mailbox = (b, o = {}) => {
  b.boxB(0.35, 3.3, 0.35, 0, 0, 0, 'planks', o.post || '#7a5a3a');
  b.boxB(1.0, 0.9, 1.9, 0, 3.3, 0.2, 'metal', o.color || '#1f2b46');
  b.prim('cyl12', 0, 4.2, 0.2, 0.5, 1.9, 0.5, 'metal', o.color || '#1f2b46', { rx: Math.PI / 2 });
  b.box(0.08, 0.9, 0.25, 0.55, 4.4, -0.3, 'plain', '#d62b22'); b.box(0.08, 0.3, 0.6, 0.55, 4.8, -0.15, 'plain', '#d62b22');
};
P.fence = (b, o = {}) => {
  const L = o.length || 8, H = o.height || 3, c = o.color || WHITE; const n = Math.max(2, Math.round(L / 0.85));
  b.box(L, 0.3, 0.2, 0, H * 0.75, 0, 'satin', c); b.box(L, 0.3, 0.2, 0, H * 0.3, 0, 'satin', c);
  if (b.lod === 'far') { b.box(L, H * 0.8, 0.12, 0, H * 0.45, 0.05, 'satin', c); return; }
  for (let i = 0; i < n; i++) { const x = -L / 2 + (i + 0.5) * (L / n); b.box(0.42, H, 0.16, x, H / 2, 0.15, 'satin', c); b.prim('prism', x, H, 0.15, 0.42, 0.3, 0.16, 'satin', c, { cast: false }); }
};
P.rail_fence = (b, o = {}) => { // wooden dock/shore railing
  const L = o.length || 8, H = o.height || 3.2, c = o.color || DOCKWOOD; const n = Math.max(1, Math.round(L / 4));
  for (let i = 0; i <= n; i++) b.boxB(0.5, H, 0.5, -L / 2 + i * (L / n), 0, 0, 'planks', c);
  b.box(L + 0.3, 0.4, 0.45, 0, H - 0.2, 0, 'planks', c); b.box(L, 0.35, 0.3, 0, H * 0.5, 0, 'planks', c);
};
P.dock_section = (b, o = {}) => { // deck top at y=0 (local), length along Z (front +Z), posts going down to -depth
  const L = o.length || 12, W = o.width || 12, dep = o.depth || 8; const c = o.color || DOCKWOOD;
  b.box(W, 0.6, L, 0, -0.3, 0, 'planks', c);
  for (const s of [-1, 1]) b.box(0.5, 0.9, L, s * (W / 2 - 0.25), -0.75, 0, 'planks', shade(c, -0.08));
  const n = Math.max(1, Math.round(L / (o.postSpacing || 6)));
  for (let i = 0; i <= n; i++) for (const s of [-1, 1]) {
    const z = -L / 2 + i * (L / n) + (i === 0 ? 0.6 : i === n ? -0.6 : 0);
    b.cyl(0.62, dep + (o.postAbove ?? 1.3), s * (W / 2 - 0.1), -dep, z, 'planks', shade(c, -0.15), 10);
    b.cyl(0.66, 0.15, s * (W / 2 - 0.1), (o.postAbove ?? 1.3) - 0.1, z, 'planks', shade(c, -0.22), 10, { cast: false });
  }
  if (o.rails) for (const s of o.rails === 'left' ? [-1] : o.rails === 'right' ? [1] : [-1, 1]) {
    b.push(s * (W / 2 - 0.3), 0, 0, Math.PI / 2); P.rail_fence(b, { length: L - 1, color: c }); b.pop();
  }
};
P.car = (b, o = {}) => {
  const c = o.color || pick(b.rng, ['#c0392b', '#2e6bc6', '#f2f2f2', '#2f2f35', '#e3b23c', '#3c8d5a']);
  b.boxB(6.4, 2.0, 13, 0, 1.0, 0, 'plastic', c); b.boxB(5.8, 2.1, 6.8, 0, 3.0, -0.8, 'plastic', c);
  b.box(5.9, 1.6, 0.12, 0, 4.0, 2.65, 'plastic', '#2a3442', { rx: -0.35 }); b.box(5.9, 1.5, 0.12, 0, 4.0, -4.25, 'plastic', '#2a3442', { rx: 0.3 });
  for (const s of [-1, 1]) b.box(0.12, 1.5, 5.6, s * 2.92, 4.0, -0.8, 'plastic', '#2a3442');
  for (const s of [-1, 1]) for (const z of [-4, 4]) b.prim('cyl14', s * 3.0, 1.2, z, 1.2, 0.9, 1.2, 'plastic', '#1e1e1e', { rz: Math.PI / 2 });
  for (const s of [-1, 1]) { b.box(1.2, 0.6, 0.15, s * 2.3, 2.2, 6.5, 'lampglass', '#fffbe8'); b.box(1.2, 0.5, 0.15, s * 2.3, 2.2, -6.5, 'plastic', '#c01818'); }
  b.box(6.6, 0.6, 0.5, 0, 1.2, 6.55, 'metal', '#9a9a9a'); b.box(6.6, 0.6, 0.5, 0, 1.2, -6.55, 'metal', '#9a9a9a');
};
P.boat = (b, o = {}) => { // small rowboat floating: hull bottom ~ -0.8 local; place at water level
  const c = o.color || '#f2f2ee', s = o.stripe || '#c0392b', L = o.length || 11;
  b.boxB(4.2, 1.6, L - 3, 0, -0.8, -0.5, 'satin', c);
  b.prim('wedge', 0, -0.8, L / 2 - 2.0, 4.2, 1.6, 3.0, 'satin', c, { ry: Math.PI, rz: 0 });
  b.box(4.3, 0.35, L - 2.6, 0, 0.75, -0.5, 'satin', s);
  b.box(3.6, 0.3, 1.3, 0, 0.2, -2.5, 'planks', '#8a5a36'); b.box(3.6, 0.3, 1.3, 0, 0.2, 1.5, 'planks', '#8a5a36');
  b.box(3.6, 0.2, L - 4, 0, -0.65, -0.5, 'planks', '#9a6a40');
};
P.gazebo = (b, o = {}) => {
  const R = o.radius || 7, c = o.color || WHITE, roof = o.roof || '#5a5f6a'; const H = 9;
  b.prim('cylf8', 0, 0.6, 0, R + 0.6, 1.2, R + 0.6, 'planks', '#d8d4cc', { ry: Math.PI / 8 });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4; const x = Math.sin(a) * R, z = Math.cos(a) * R;
    b.boxB(0.6, H, 0.6, x, 1.2, z, 'satin', c);
    if (i !== 0) { const a2 = (i + 1) * Math.PI / 4; b.beam(x, 3.8, z, Math.sin(a2) * R, 3.8, Math.cos(a2) * R, 0.3, 'satin', c, { cast: false }); b.beam(x, 1.7, z, Math.sin(a2) * R, 1.7, Math.cos(a2) * R, 0.25, 'satin', c, { cast: false }); }
  }
  b.beam(Math.sin(Math.PI / 4) * R, 3.8, Math.cos(Math.PI / 4) * R, 0, 3.8, R, 0.3, 'satin', c, { cast: false });
  b.prim('cylf8', 0, H + 1.5, 0, R + 0.7, 0.8, R + 0.7, 'satin', c, { ry: 0 });
  b.prim('conef8', 0, H + 1.9 + 2.8, 0, R + 1.6, 5.6, R + 1.6, 'shingle', roof);
  b.blob(0.6, 0, H + 8.0, 0, 'satin', c);
};
P.street_sign = (b, o = {}) => { b.cyl(0.15, 8, 0, 0, 0, 'metal', '#5a5f66', 6); b.box(3.6, 0.8, 0.1, 0, 7.6, 0, 'plain', '#1d6b3a'); b.box(0.1, 0.8, 3.6, 0, 7.0, 0, 'plain', '#1d6b3a'); };
P.hydrant = (b) => { b.cyl(0.55, 2.0, 0, 0, 0, 'plastic', '#c0281e', 10); b.sphere(0.55, 0, 2.0, 0, 'plastic', '#c0281e', 10); b.prim('cyl8', 0, 1.3, 0, 0.25, 1.6, 0.25, 'plastic', '#c0281e', { rz: Math.PI / 2 }); };
P.trash_can = (b) => { b.cyl(0.9, 2.6, 0, 0, 0, 'metal', '#2f4f3a', 12); b.cyl(1.0, 0.25, 0, 2.6, 0, 'metal', '#2a2a2a', 12); };
P.flower_arch = (b, o = {}) => { // wedding arch (white, green garland with red/white roses)
  const W = o.width || 9, H = o.height || 11; const r = b.rng;
  for (const s of [-1, 1]) b.boxB(0.6, H - 2, 0.6, s * W / 2, 0, 0, 'satin', WHITE);
  const n = 14; for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; const x = -Math.cos(a) * W / 2, y = H - 2 + Math.sin(a) * 2.4; b.blob(0.75, x, y, 0, 'foliage', '#3f8a35'); b.blob(0.45, x + 0.2, y + 0.3, 0.45, 'plain', pick(r, ['#e0303a', '#ffffff', '#f07a9a'])); }
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { b.blob(0.6, s * W / 2, 1 + k * 1.4, 0.2, 'foliage', '#3f8a35'); b.blob(0.4, s * W / 2 + 0.3, 1.4 + k * 1.4, 0.55, 'plain', pick(r, ['#e0303a', '#ffffff'])); }
};

// ------------------------------------------------------------------ ground / roads (top surface at y≈0..0.35)
P.road_segment = (b, o = {}) => { // along X; width along Z
  const L = o.length || 40, W = o.width || 18;
  b.boxB(L, 0.1, W, 0, -0.06, 0, 'asphalt', '#ffffff', { cast: false });
  if (o.centerLine !== false) { const n = Math.floor(L / 8); for (let i = 0; i < n; i++) b.boxB(3.6, 0.03, 0.4, -L / 2 + 4 + i * 8, 0.04, 0, 'plain', '#e8c23a', { cast: false }); }
  if (o.edgeLines !== false) for (const s of [-1, 1]) b.boxB(L, 0.03, 0.3, 0, 0.04, s * (W / 2 - 0.9), 'plain', '#f0f0ea', { cast: false });
};
P.crosswalk = (b, o = {}) => { // stripes across a road that runs along X; crossing along Z
  const W = o.width || 18, L = o.length || 7; const n = Math.round(W / 1.6);
  for (let i = 0; i < n; i++) b.boxB(L, 0.04, 0.8, 0, 0.045, -W / 2 + 0.8 + i * (W - 1.6) / (n - 1), 'plain', '#f2f2ec', { cast: false });
};
P.sidewalk = (b, o = {}) => { const L = o.length || 40, W = o.width || 5; b.boxB(L, 0.35, W, 0, -0.01, 0, 'concrete', o.color || '#d9d7d2', { cast: false }); b.boxB(L, 0.37, 0.35, 0, -0.01, W / 2 - 0.17, 'concrete', '#c9c7c2', { cast: false }); };

// ------------------------------------------------------------------ interior furniture
P.table = (b, o = {}) => {
  const w = o.width || 8, d = o.depth || 5, h = o.height || 3.0, c = o.color || '#8a5530';
  b.boxB(w, 0.35, d, 0, h - 0.35, 0, 'floorwood', c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxB(0.45, h - 0.35, 0.45, sx * (w / 2 - 0.5), 0, sz * (d / 2 - 0.5), 'satin', shade(c, -0.08));
  if (o.items) { b.cyl(0.7, 0.15, -1.5, h, 0.4, 'plastic', '#f4f4f4', 12); b.cyl(0.7, 0.15, 1.6, h, -0.6, 'plastic', '#f4f4f4', 12); b.cyl(0.35, 1.1, 0.2, h, 0.2, 'plastic', '#e8eef2', 10); b.cyl(0.6, 0.6, 0.9, h, 1.0, 'plastic', '#f2b630', 10); }
};
P.chair = (b, o = {}) => {
  const c = o.color || '#8a5530', s = 2.0;
  b.boxB(2.2, 0.3, 2.2, 0, s - 0.3, 0, 'floorwood', c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxB(0.3, s - 0.3, 0.3, sx * 0.85, 0, sz * 0.85, 'satin', c);
  for (const sx of [-1, 1]) b.boxB(0.3, 2.6, 0.3, sx * 0.85, s, -0.95, 'satin', c);
  b.boxB(2.0, 0.6, 0.22, 0, s + 1.9, -0.95, 'satin', c); b.boxB(2.0, 0.4, 0.22, 0, s + 1.0, -0.95, 'satin', c);
};
P.sofa = (b, o = {}) => {
  const L = o.length || 9, c = o.color || '#3f6a4a'; const seat = 2.0;
  b.boxB(L, seat - 0.6, 3.2, 0, 0.3, 0, 'fabric', shade(c, -0.05));
  const n = Math.max(1, Math.round((L - 1.6) / 3)); const cw = (L - 1.6) / n;
  for (let i = 0; i < n; i++) b.boxB(cw - 0.1, 0.6, 2.6, -L / 2 + 0.8 + (i + 0.5) * cw, seat - 0.6 + 0.3, 0.25, 'fabric', c);
  b.boxB(L, 2.6, 0.9, 0, seat - 0.3, -1.25, 'fabric', c);
  for (const s of [-1, 1]) b.boxB(0.8, 1.9, 3.2, s * (L / 2 - 0.4), 0.3, 0, 'fabric', shade(c, 0.03));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxB(0.3, 0.3, 0.3, sx * (L / 2 - 0.4), 0, sz * 1.3, 'satin', '#3a2618');
};
P.armchair = (b, o = {}) => P.sofa(b, { length: 4.4, color: o.color || '#a3352a' });
P.fireplace = (b, o = {}) => { // against a wall at local z=0 (back), protrudes toward +Z; height = ceiling
  const W = o.width || 10, H = o.height || 13, D = 2.4;
  b.boxB(W, H, D, 0, 0, D / 2, 'brick', '#ffffff');
  b.boxB(5.2, 3.8, 0.6, 0, 0.6, D + 0.05, 'plain', '#1e1a18', { cast: false });
  b.boxB(W + 1.0, 0.5, D + 0.9, 0, 5.2, D / 2 + 0.2, 'satin', o.mantel || '#5a3826');
  b.boxB(W + 1.6, 0.6, 3.6, 0, 0, D + 1.4, 'stone', '#9b6a5a', { cast: false });
  // fire + logs
  b.box(3.2, 0.5, 0.6, 0, 0.9, D - 0.2, 'planks', '#4a2a1a', { rz: 0.1 });
  b.prim('conef5', -0.6, 1.9, D - 0.2, 0.8, 1.8, 0.5, 'fire', '#ffb040', { cast: false });
  b.prim('conef5', 0.5, 1.7, D - 0.25, 0.65, 1.4, 0.45, 'fire', '#ff8a2a', { cast: false });
  b.prim('conef5', 0.0, 2.2, D - 0.3, 0.6, 2.2, 0.45, 'fire', '#ffd060', { cast: false });
  b.lamp(0, 2.2, D + 1.2, 'fire');
  if (o.decor !== false) { b.cyl(0.25, 1.2, -W / 2 + 1, 5.7, D / 2, 'plastic', '#f2e6c8', 8); b.cyl(0.25, 1.0, W / 2 - 1.2, 5.7, D / 2, 'plastic', '#f2e6c8', 8); b.boxB(1.6, 1.6, 0.3, 2.5, 5.7, D / 2 - 0.4, 'plain', '#d8d0b8'); }
};
P.bed = (b, o = {}) => { // headboard at back (-Z), foot toward +Z
  const W = o.width || 7, L = o.length || 10.5, c = o.color || '#2f4f8f', wood = o.wood || '#6b4a30';
  b.boxB(W, 1.2, L, 0, 0.4, 0, 'floorwood', wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxB(0.5, 0.5, 0.5, sx * (W / 2 - 0.3), 0, sz * (L / 2 - 0.3), 'satin', wood);
  b.boxB(W - 0.3, 1.0, L - 0.4, 0, 1.6, 0, 'fabric', '#f4f2ec');
  b.boxB(W, 0.6, L * 0.62, 0, 2.3, L * 0.18, 'fabric', c);
  b.boxB(W + 0.3, 1.2, L * 0.58, 0, 1.5, L * 0.19, 'fabric', shade(c, -0.03));
  b.boxB(W - 1.4, 0.8, 1.8, 0, 2.5, -L / 2 + 1.4, 'fabric', '#ffffff');
  b.boxB(W + 0.4, 5.2, 0.5, 0, 0, -L / 2, 'floorwood', wood);
};
P.nightstand = (b, o = {}) => { b.boxB(2.4, 2.8, 2.2, 0, 0, 0, 'floorwood', o.color || '#6b4a30'); b.box(1.6, 0.2, 0.1, 0, 2.0, 1.12, 'metal', '#d0b060'); };
P.window = (b, o = {}) => { // interior window frame (wall opening); centre of opening at y = o.y (default 7)
  const w = o.width || 6, h = o.height || 6.5, y = o.y ?? 7, c = o.color || WHITE, t = o.thick || 1.2;
  b.box(w + 0.9, 0.5, t, 0, y + h / 2 + 0.25, 0, 'satin', c); b.box(w + 0.9, 0.4, t + 0.6, 0, y - h / 2 - 0.2, 0.3, 'satin', c);
  for (const s of [-1, 1]) b.box(0.45, h, t, s * (w / 2 + 0.22), y, 0, 'satin', c);
  if (o.mullions !== false) { b.box(0.22, h, 0.22, 0, y, 0, 'satin', c, { cast: false }); b.box(w, 0.22, 0.22, 0, y + (o.mullionY || 0), 0, 'satin', c, { cast: false }); }
  if (o.glass) b.quad(w, h, 0, y, 0.05, 'win_dark', '#ffffff', { uvRect: windowRect(o.variant ?? 7), cast: false });
  if (o.curtains) { const cc = o.curtains === true ? '#c8742e' : o.curtains; for (const s of [-1, 1]) b.box(1.6, h + 2, 0.4, s * (w / 2 + 1.2), y + 0.3, 0.9, 'fabric', cc); b.cyl(0.12, w + 5, -(w + 5) / 2, y + h / 2 + 1.4, 1.0, 'metal', '#3a2a1a', 6, { rz: -Math.PI / 2 }); }
};
P.door = (b, o = {}) => { // interior/exterior door in a wall at z=0, front +Z
  const w = o.width || 4, h = o.height || 8, c = o.color || '#ffffff', fr = o.frame || WHITE;
  b.boxB(w + 1.0, h + 0.5, 0.4, 0, 0, 0.0, 'satin', fr);
  b.quad(w, h, 0, h / 2, 0.21, 'door', c, { cast: false });
};
P.bookshelf = (b, o = {}) => {
  const W = o.width || 5, H = o.height || 9, D = 1.6, c = o.color || '#5b3a22';
  b.boxB(W, H, 0.3, 0, 0, -D / 2 + 0.15, 'floorwood', c);
  for (const s of [-1, 1]) b.boxB(0.3, H, D, s * (W / 2 - 0.15), 0, 0, 'floorwood', c);
  const n = Math.max(2, Math.round(H / 2.1));
  for (let i = 0; i <= n; i++) b.boxB(W, 0.25, D, 0, i * (H - 0.25) / n, 0, 'floorwood', c);
  for (let i = 0; i < n; i++) b.quad(W - 0.6, (H - 0.25) / n - 0.3, 0, i * (H - 0.25) / n + 0.25 + ((H - 0.25) / n - 0.3) / 2, 0.2, 'books', '#ffffff', { cast: false });
};
P.kitchen_counter = (b, o = {}) => { // against a wall at z=-1.5 (back), length along X
  const L = o.length || 12, c = o.color || '#1f4f4f', top = o.top || '#c8a87a'; const H = 3.4, D = 3;
  b.boxB(L, H - 0.3, D, 0, 0, 0, 'satin', c);
  const n = Math.max(1, Math.round(L / 2.5));
  for (let i = 0; i < n; i++) { const x = -L / 2 + (i + 0.5) * (L / n); b.box(L / n - 0.3, H - 0.9, 0.08, x, (H - 0.3) / 2 + 0.1, D / 2 + 0.02, 'satin', shade(c, 0.05), { cast: false }); b.box(0.5, 0.12, 0.12, x, H - 0.9, D / 2 + 0.1, 'metal', '#c8c8c8', { cast: false }); }
  b.boxB(L + 0.3, 0.3, D + 0.3, 0, H - 0.3, 0.1, 'satin', top);
  if (o.sink) { b.boxB(3, 0.1, 2, (o.sinkX ?? 0), H - 0.02, 0.1, 'metal', '#9aa0a6'); b.box(0.2, 1.2, 0.2, (o.sinkX ?? 0), H + 0.6, -0.9, 'metal', '#b0b4b8'); }
  if (o.upper !== false) {
    const uy = 8.2; b.boxB(L, 4, 1.8, 0, uy, -0.6, 'satin', c);
    for (let i = 0; i < n; i++) { const x = -L / 2 + (i + 0.5) * (L / n); b.box(L / n - 0.3, 3.5, 0.08, x, uy + 2, 0.32, 'satin', shade(c, 0.05), { cast: false }); b.box(0.12, 0.6, 0.12, x + (i % 2 ? -1 : 1) * (L / n / 2 - 0.5), uy + 0.7, 0.4, 'metal', '#c8c8c8', { cast: false }); }
    b.box(L, 4.8, 0.1, 0, H + 2.4, -D / 2 + 0.05, 'tile', '#e8e0cc', { cast: false });
  }
};
P.fridge = (b, o = {}) => { const c = o.color || '#e9eaec'; b.boxB(4, 9, 3.4, 0, 0, 0, 'satin', c); b.box(4.02, 0.12, 3.42, 0, 6.0, 0, 'metal', '#9a9a9a', { cast: false }); for (const y of [4.5, 7.4]) b.box(0.2, 1.6, 0.25, 1.5, y, 1.8, 'metal', '#b8b8b8', { cast: false }); };
P.stove = (b, o = {}) => {
  b.boxB(3.4, 3.4, 3, 0, 0, 0, 'satin', o.color || '#eeeeee'); b.boxB(3.4, 0.12, 3, 0, 3.4, 0, 'plastic', '#222');
  for (const x of [-0.8, 0.8]) for (const z of [-0.7, 0.7]) b.cyl(0.5, 0.06, x, 3.52, z, 'metal', '#555', 10, { cast: false });
  b.box(2.6, 1.6, 0.08, 0, 1.6, 1.52, 'plastic', '#1e1e1e', { cast: false }); b.box(2.4, 0.15, 0.2, 0, 2.7, 1.6, 'metal', '#bbb', { cast: false });
  b.boxB(3.4, 0.8, 0.4, 0, 3.4, -1.3, 'satin', o.color || '#eeeeee');
};
P.rug = (b, o = {}) => { const w = o.width || 12, d = o.depth || 8; b.box(w, 0.08, d, 0, 0.04, 0, 'rug', o.color || '#ffffff', { uv: 'unit', cast: false }); };
P.picture_frame = (b, o = {}) => { // hangs on a wall at z=0, centre at y (o.y default 0)
  const w = o.width || 5, h = o.height || 4, y = o.y || 0, c = o.color || '#5a3a22';
  b.box(w + 0.6, h + 0.6, 0.25, 0, y, 0.12, 'satin', c);
  b.quad(w, h, 0, y, 0.26, 'art', '#ffffff', { uvRect: artRect(o.variant ?? Math.floor(b.rng() * 4)), cast: false });
};
P.tv = (b, o = {}) => {
  b.boxB(7, 2.4, 2.4, 0, 0, 0, 'floorwood', '#4a3020');
  b.boxB(6.4, 3.8, 0.4, 0, 2.6, 0, 'plastic', '#1a1a1a'); b.box(0.8, 0.3, 1.2, 0, 2.5, 0, 'plastic', '#1a1a1a');
  b.quad(6.0, 3.4, 0, 4.5, 0.22, 'screen', '#ffffff', { cast: false });
};
P.lamp = (b, o = {}) => { // o.kind 'floor' (default) | 'table'
  const floor = o.kind !== 'table'; const H = floor ? 6.5 : 2.4; const c = o.shade || '#f3e2b8';
  b.cyl(floor ? 0.8 : 0.6, 0.25, 0, 0, 0, 'metal', '#3a2a1a', 10); b.cyl(0.12, H, 0, 0.25, 0, 'metal', '#3a2a1a', 6);
  b.prim('frus10', 0, H + 0.6, 0, floor ? 1.3 : 0.9, floor ? 1.5 : 1.1, floor ? 1.3 : 0.9, 'bulb', c, { cast: false });
  b.lamp(0, H + 0.4, 0, 'interior');
};
P.pendant_lamp = (b, o = {}) => { // hangs from ceiling at local y = o.drop below origin (origin at ceiling)
  const drop = o.drop || 4, c = o.color || '#1f5a5a';
  b.cyl(0.06, drop, 0, -drop, 0, 'metal', '#222', 4, { cast: false });
  b.prim('frus10', 0, -drop - 0.5, 0, 1.4, 1.1, 1.4, 'satin', c, { cast: false });
  b.prim('cyl10', 0, -drop - 1.08, 0, 1.25, 0.08, 1.25, 'bulb', '#fff4d0', { cast: false });
  b.lamp(0, -drop - 1.4, 0, 'interior');
};
P.ceiling_light = (b, o = {}) => { b.prim('hemi10', 0, 0, 0, 1.4, -0.6, 1.4, 'bulb', '#fff6e0', { cast: false }); b.lamp(0, -1, 0, 'interior'); };
P.cabinet = (b, o = {}) => { const W = o.width || 4, H = o.height || 7, c = o.color || '#6b4a30'; b.boxB(W, H, 2, 0, 0, 0, 'floorwood', c); b.box(0.08, H - 1, 0.1, 0, H / 2, 1.02, 'plain', shade(c, -0.15), { cast: false }); for (const s of [-1, 1]) b.box(0.15, 0.6, 0.15, s * 0.4, H / 2, 1.1, 'metal', '#c8b060', { cast: false }); };
P.desk = (b, o = {}) => { // school desk + chair, student faces -Z (board)
  const c = o.color || '#c89a5a', m = o.metal || '#4a4f57';
  b.boxB(3.6, 0.25, 2.4, 0, 3.0, -0.6, 'floorwood', c);
  for (const sx of [-1, 1]) b.boxB(0.2, 3.0, 2.0, sx * 1.5, 0, -0.6, 'metal', m);
  b.boxB(2.2, 0.25, 2.0, 0, 1.9, 1.4, 'floorwood', c); b.boxB(2.2, 1.6, 0.25, 0, 2.3, 2.4, 'floorwood', c);
  for (const sx of [-1, 1]) for (const sz of [0.5, 2.3]) b.boxB(0.18, 1.9, 0.18, sx * 0.9, 0, sz, 'metal', m);
};
P.chalkboard = (b, o = {}) => { const W = o.width || 16, H = o.height || 6.5, y = o.y ?? 6.5; b.box(W + 0.8, H + 0.8, 0.3, 0, y, 0.15, 'floorwood', '#8a6a42'); b.quad(W, H, 0, y, 0.31, 'chalkboard', '#ffffff', { cast: false }); b.box(W, 0.3, 0.6, 0, y - H / 2 - 0.3, 0.45, 'floorwood', '#8a6a42'); };
P.clock = (b, o = {}) => { b.prim('cyl20', 0, o.y || 0, 0.15, 1.2, 0.3, 1.2, 'plain', '#3a2a1a', { rx: Math.PI / 2 }); b.prim('cyl20', 0, o.y || 0, 0.32, 1.0, 0.05, 1.0, 'plain', '#f8f6f0', { rx: Math.PI / 2 }); b.box(0.1, 0.8, 0.05, 0, (o.y || 0) + 0.3, 0.38, 'plain', '#111'); b.box(0.6, 0.1, 0.05, 0.25, o.y || 0, 0.38, 'plain', '#111'); };
P.sign_board = (b, o = {}) => { // board on two posts (yard sign) or o.posts:false for a bare board centred at y
  const W = o.width || 5, H = o.height || 2.5; const tex = signTexture(b.ctx, o.text || 'HELLO', o);
  const mk = signMaterial(b.ctx, tex); const key = mk.name;
  const posts = o.posts !== false; const y = posts ? (o.y || 4.2) : (o.y || H / 2);
  if (posts) for (const s of [-1, 1]) b.boxB(0.35, y + H / 2, 0.35, s * (W / 2 - 0.6), 0, -0.25, 'planks', '#7a5a3a');
  b.box(W, H, 0.2, 0, y, 0, 'plain', o.bg || '#f4f1e8');
  b.quad(W - 0.1, H - 0.1, 0, y, 0.11, key, '#ffffff', { cast: false });
  if (o.back !== false) b.quad(W - 0.1, H - 0.1, 0, y, -0.11, key, '#ffffff', { ry: Math.PI, cast: false });
};
P.curtain = (b, o = {}) => { const W = o.width || 2, H = o.height || 9, c = o.color || '#c8742e'; b.boxB(W, H, 0.4, 0, 0, 0, 'fabric', c); };
P.stairs = (b, o = {}) => { const n = o.steps || 6, w = o.width || 4, rise = o.rise || 1, run = o.run || 1.3; for (let i = 0; i < n; i++) b.boxB(w, rise * (i + 1), run, 0, 0, -i * run, 'floorwood', o.color || '#8a5a36'); };
P.pier_post = (b, o = {}) => b.cyl(o.radius || 0.65, o.height || 8, 0, -(o.below || 6), 0, 'planks', o.color || '#5a4030', 10);

export const PROP_IDS = Object.keys(P);
