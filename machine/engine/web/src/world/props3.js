// World module — v3 story props (show exactly what the narration says): cookie, cookie_plate, fur_tuft,
// giant_footprint, footprint_trail, note_paper, giant_hand, window_face, glowing_eyes, candle,
// hammer_nails, plush (teddy), ball, poster/drawing helpers for kids' rooms.
// Same convention as props.js: (b, opts) into a Builder, front = +Z. Floor props: origin = base centre.
// Wall/window props (note_paper, giant_hand, window_face): origin = CENTRE of the sheet / of the window
// they fill (place them at poi:outside / poi:home_door …). A prop may return { focus, update(t) }:
// createProp() exposes them as userData.focus (camera close-up point) and userData.update(t) (animation).
import * as THREE from 'three';
import { Builder, makeRng, shade, pick, range } from './core.js';
import { getMat } from './materials.js';
import { getTexture } from './textures.js';
import { P } from './props.js';
import { drawNoteSheet, drawCrayon, HAND, MARKER, SANS } from './cards.js';
import { furryFaceTexture } from '../characters/textures.js';

const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** register a canvas-textured material under `key` in ctx.worldMats (Builder.getMat returns it). */
export function canvasMaterial(ctx, key, draw, o = {}) {
  if (!ctx.worldMats) ctx.worldMats = new Map();
  if (ctx.worldMats.has(key)) return key;
  const t = new THREE.CanvasTexture(draw()); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 1;
  let m;
  if (o.basic) m = new THREE.MeshBasicMaterial({ map: t, color: o.color || '#ffffff', transparent: !!o.transparent, alphaTest: o.alphaTest || 0, toneMapped: o.toneMapped ?? true, fog: o.fog ?? true, depthWrite: o.depthWrite ?? true });
  else {
    m = new THREE.MeshStandardMaterial({ map: t, roughness: o.rough ?? 0.85, metalness: 0, transparent: !!o.transparent, alphaTest: o.alphaTest || 0 });
    if (o.emissive) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = t; m.emissiveIntensity = o.emissive; }
  }
  m.name = key; ctx.worldMats.set(key, m); return key;
}
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/** a separate (non-merged) Builder for animated sub-parts; returns its Group */
function subBuild(b, fn, name = 'part') {
  const s = new Builder(b.ctx, { rng: b.rng, lod: b.lod, getMat: b.getMat });
  fn(s); const g = s.build(name); g.traverse((o) => { if (o.isMesh) o.userData.noCollide = true; }); return g;
}

// ------------------------------------------------------------------ food
P.cookie = (b, o = {}) => { // chocolate-chip cookie lying flat, Ø ≈ 0.64 (size scales)
  const r = b.rng; const s = num(o.size, 1); const R = 0.32 * s, t = 0.09 * s; const c = o.color || '#c98a45';
  b.cylf(R, t, 0, 0, 0, 'plain', c, 11);
  b.cylf(R * 0.9, 0.025 * s, 0, t, 0, 'plain', shade(c, 0.07), 11, { cast: false, ry: 0.3 });
  const n = Math.round(num(o.chips, 9));
  for (let i = 0; i < n; i++) { const a = i * 2.39996 + r() * 0.5; const rr = R * 0.78 * Math.sqrt((i + 0.6) / n); b.box(0.075 * s, 0.05 * s, 0.075 * s, Math.cos(a) * rr, t + 0.035 * s, Math.sin(a) * rr, 'plain', '#3a2014', { ry: r() * 3, cast: false }); }
  if (o.bitten) b.cyl(R * 0.38, t + 0.06, R * 0.95, -0.01, -R * 0.2, 'plain', '#7a5230', 8, { cast: false });
  return { focus: { x: 0, y: t, z: 0 } };
};
P.cookie_plate = (b, o = {}) => { // white plate with 3 cookies (+ glass of milk with milk:true)
  const s = num(o.size, 1);
  b.cyl(0.85 * s, 0.05 * s, 0, 0, 0, 'plastic', '#f6f6f2', 18); b.cyl(0.62 * s, 0.03 * s, 0, 0.04 * s, 0, 'plastic', '#ecebe6', 18, { cast: false });
  b.push(-0.27 * s, 0.07 * s, 0.12 * s, 0.4); P.cookie(b, { size: s }); b.pop();
  b.push(0.3 * s, 0.07 * s, 0.05 * s, 1.1); P.cookie(b, { size: s }); b.pop();
  b.push(0.0, 0.17 * s, -0.22 * s, 2.0); P.cookie(b, { size: s * 0.95 }); b.pop();
  if (o.milk) { b.cyl(0.24, 0.85, 0.95 * s + 0.3, 0, -0.2, 'plastic', '#fbfbf6', 12); b.cyl(0.26, 0.15, 0.95 * s + 0.3, 0.8, -0.2, 'glass', '#dfe8ee', 12, { cast: false }); }
  return { focus: { x: 0, y: 0.2 * s, z: 0 } };
};

// ------------------------------------------------------------------ creature traces
P.fur_tuft = (b, o = {}) => { // clump of long dark strands snagged at the origin, hanging down (−Y), ~1.6 long
  const r = b.rng; const s = num(o.size, 1.25); const base = o.color || '#151210';
  const cols = [base, shade(base, 0.04), '#2a1f18', '#0d0c0b', '#231a14'];
  b.blob(0.3 * s, 0, 0, 0.05 * s, 'fur', base, { sy: 0.75 }); b.blob(0.22 * s, 0.22 * s, -0.08 * s, 0.12 * s, 'fur', cols[2], { sy: 0.7 });
  const n = Math.round(num(o.count, 40)); const wind = num(o.wind, 0.3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2; let x = Math.cos(a) * 0.3 * s * r(), y = (0.05 - r() * 0.2) * s, z = Math.sin(a) * 0.2 * s * r() + 0.06 * s;
    const L = (0.55 + r() * 1.15) * s; const segs = 3; let dx = (r() - 0.5) * 0.4 + wind, dz = (r() - 0.5) * 0.3 + 0.1; const c = pick(r, cols);
    for (let k = 0; k < segs; k++) { const l = L / segs; const nx = x + dx * l, ny = y - l * 0.92, nz = z + dz * l; b.beam(x, y, z, nx, ny, nz, (0.055 - k * 0.012) * s, 'fur', c, { cast: false }); x = nx; y = ny; z = nz; dx += (r() - 0.5) * 0.35; dz += (r() - 0.5) * 0.2; }
  }
  for (let i = 0; i < 10; i++) { const a = r() * 6.28; b.beam(0, 0, 0.05 * s, Math.cos(a) * 0.55 * s, (r() - 0.2) * 0.4 * s, Math.sin(a) * 0.3 * s + 0.1 * s, 0.04 * s, 'fur', pick(r, cols), { cast: false }); }
  return { focus: { x: wind * 0.4 * s, y: -0.6 * s, z: 0.1 * s } };
};
/** deep footprint in mud, toes toward +Z. opts: length (9), width, side 'left'|'right', mud (true) */
P.giant_footprint = (b, o = {}) => {
  const r = b.rng; const L = num(o.length, 9), W = num(o.width, L * 0.44); const sd = o.side === 'right' ? -1 : 1;
  const disc = (rx, rz, x, y, z, color, mat = 'mud', rot = 0) => b.prim('disc20', x, y, z, rx, rz, 1, mat, color, { rx: -Math.PI / 2, rz: rot, cast: false, uv: 'world' });
  if (o.mud !== false) { // wet mud splat around the print
    disc(W * 0.95, L * 0.66, 0, 0.02, 0, '#5a4128', 'mud');
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + r(); disc(W * range(r, 0.25, 0.45), L * range(r, 0.12, 0.22), Math.cos(a) * W * 0.75, 0.022 + k * 0.001, Math.sin(a) * L * 0.5, shade('#5a4128', (r() - 0.5) * 0.06), 'mud', r() * 3); }
  }
  // raised rim (lighter, pushed-up mud) then the dark depression on top
  const rim = '#7a5a3c', deep = '#24180f', wet = '#3a2b1d';
  const parts = [[0, -0.3, 0.38, 0.21], [sd * 0.05, -0.05, 0.33, 0.24], [sd * 0.02, 0.17, 0.5, 0.17]];
  for (const [x, z, rx, rz] of parts) disc(W * rx * 1.14, L * rz * 1.12, x * W, 0.04, z * L, rim);
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; b.blob(W * 0.09, Math.cos(a) * W * 0.5, 0.02, Math.sin(a) * L * 0.42, 'mud', shade(rim, (r() - 0.5) * 0.08), { sy: 0.35, cast: false }); }
  for (const [x, z, rx, rz] of parts) disc(W * rx, L * rz, x * W, 0.06, z * L, deep);
  disc(W * 0.24, L * 0.12, 0, 0.07, -0.3 * L, wet); disc(W * 0.3, L * 0.09, sd * 0.03 * W, 0.07, 0.17 * L, wet);
  const toes = [[0.3, 0.41, 0.14, 0.09], [0.1, 0.46, 0.11, 0.08], [-0.08, 0.45, 0.1, 0.075], [-0.24, 0.42, 0.09, 0.07], [-0.36, 0.36, 0.08, 0.065]];
  for (const [x, z, rx, rz] of toes) {
    disc(W * rx * 1.25, L * rz * 1.25, sd * x * W, 0.04, z * L, rim); disc(W * rx, L * rz, sd * x * W, 0.065, z * L, deep);
    disc(W * 0.03, L * 0.05, sd * x * W, 0.066, (z + rz + 0.05) * L, '#120c08'); // claw gouge
  }
  return { focus: { x: 0, y: 0.1, z: 0 } };
};
/** a line of giant footprints along +Z (origin = first print). opts: count (5), spacing (1.7×length), length, mud */
P.footprint_trail = (b, o = {}) => {
  const n = Math.max(1, Math.min(30, Math.round(num(o.count, 5)))); const L = num(o.length, 9); const sp = num(o.spacing, L * 1.7);
  for (let i = 0; i < n; i++) { b.push((i % 2 ? 1 : -1) * L * 0.28, 0, i * sp, (b.rng() - 0.5) * 0.15); P.giant_footprint(b, { length: L, side: i % 2 ? 'right' : 'left', mud: o.mud }); b.pop(); }
  return { focus: { x: 0, y: 0.1, z: (n - 1) * sp / 2 } };
};

// ------------------------------------------------------------------ paper
/** paper note taped on a wall/door (vertical, faces +Z, origin = centre). opts: text, title, color, ink, width, height */
P.note_paper = (b, o = {}) => {
  const w = num(o.width, 1.7), h = num(o.height, 2.2); const text = o.text != null ? String(o.text) : 'You looked.';
  const ok = { text, title: o.title ? String(o.title) : undefined, color: o.color, ink: o.ink, drawing: o.drawing };
  const key = canvasMaterial(b.ctx, 'notepaper:' + JSON.stringify(ok), () => drawNoteSheet(640, Math.round(640 * h / w), ok), { rough: 0.9, emissive: 0.16 });
  const tilt = num(o.tilt, (b.rng() - 0.5) * 0.08);
  b.box(w, h, 0.03, 0, 0, 0.02, 'plain', '#e8e2c8', { rz: tilt, cast: false });
  b.quad(w, h, 0, 0, 0.04, key, '#ffffff', { rz: tilt, cast: false });
  for (const s of [-1, 1]) b.box(0.55, 0.22, 0.02, s * (w / 2 - 0.12), h / 2 - 0.06 + s * tilt * w / 2, 0.06, 'plain', '#ddd2a8', { rz: s * 0.6 + tilt, cast: false });
  return { focus: { x: 0, y: 0, z: 0.05 } };
};

// ------------------------------------------------------------------ the giant at the window
/** huge dark furry hand + forearm (~6 tall), palm facing +Z (toward the window glass / camera), origin = palm centre.
 *  opts: pose 'open'|'tap'|'pinch', holding 'cookie'|null, fur (colour), skin, reach (distance to the glass, 1.8), light (rim light, true) */
P.giant_hand = (b, o = {}) => {
  const r = b.rng; const pose = ['open', 'tap', 'pinch'].includes(o.pose) ? o.pose : 'tap';
  const fur = o.fur || o.color || '#161616', skin = o.skin || '#3a322e', nail = '#d6cbb0';
  const furs = [fur, shade(fur, 0.05), shade(fur, -0.03), '#241c18'];
  const lift = num(o.lift, -1.2); b.push(0, lift, 0, 0); // whole hand (palm → fingertips) centred on the origin
  // palm + forearm
  b.box(3.0, 3.0, 1.1, 0, 0, 0, 'fur', skin);
  b.box(2.6, 0.5, 0.2, 0, -0.7, 0.58, 'fur', shade(skin, 0.06), { cast: false }); // palm crease pad
  b.prim('box', 0, -3.2, -1.25, 2.6, 4.6, 2.3, 'fur', fur, { rx: 0.5 });
  // fur strands on the back of the hand, the edges and the forearm (silhouette)
  for (let i = 0; i < 150; i++) {
    const onArm = i < 90; let x, y, z, dx, dy, dz;
    if (onArm) { const t = r(); const a = r() * Math.PI * 2; x = Math.cos(a) * 1.35; y = -1.6 - t * 3.6; z = -0.5 - t * 1.9 + Math.sin(a) * 1.2; dx = Math.cos(a) * 0.9; dy = -0.35; dz = Math.sin(a) * 0.9 - 0.3; }
    else { x = (r() - 0.5) * 3.2; y = (r() - 0.5) * 2.8; z = -0.58; dx = (r() - 0.5) * 0.6 + Math.sign(x) * 0.5; dy = -0.2; dz = -0.8; if (r() < 0.4) { x = Math.sign(x || 1) * 1.55; z = (r() - 0.5) * 1.0; dx = Math.sign(x) * 1; dz = 0; } }
    const L = range(r, 0.5, 1.1); const l = Math.hypot(dx, dy, dz) || 1;
    b.beam(x, y, z, x + dx / l * L, y + dy / l * L, z + dz / l * L, range(r, 0.07, 0.12), 'fur', pick(r, furs), { cast: false });
  }
  // fingers: [x, spread] index = x 0.38 (the tapping one)
  const fingers = [[-1.08, -0.16, 2.0], [-0.36, -0.05, 2.35], [0.38, 0.04, 2.45], [1.1, 0.14, 2.1]];
  const finger = (bb, len, bend, x0, spread) => { // two segments from the knuckle (x0, 1.45, 0.1), bend = forward curl (rad)
    const a1 = bend * 0.55, a2 = bend;
    const k = [x0, 1.45, 0.1]; const s1 = len * 0.55, s2 = len * 0.45;
    const m = [k[0] + Math.sin(spread) * s1, k[1] + Math.cos(a1) * s1 * Math.cos(spread), k[2] + Math.sin(a1) * s1];
    const t = [m[0] + Math.sin(spread) * s2, m[1] + Math.cos(a2) * s2 * Math.cos(spread), m[2] + Math.sin(a2) * s2];
    bb.beam(k[0], k[1] - 0.2, k[2], m[0], m[1], m[2], 0.66, 'fur', skin, { th: 0.72 });
    bb.beam(m[0], m[1], m[2], t[0], t[1], t[2], 0.6, 'fur', shade(skin, 0.03), { th: 0.66 });
    bb.beam(t[0], t[1], t[2], t[0] + Math.sin(spread) * 0.55, t[1] + Math.cos(a2) * 0.55, t[2] + Math.sin(a2) * 0.55 + 0.12, 0.34, 'plain', nail, { th: 0.24, cast: false }); // pale claw
    for (let i = 0; i < 6; i++) { const q = i / 6; const px = k[0] + (m[0] - k[0]) * q * 1.6, py = k[1] + (m[1] - k[1]) * q * 1.6, pz = k[2] + (m[2] - k[2]) * q * 1.6 - 0.42; bb.beam(px, py, pz, px + (r() - 0.5) * 0.5, py + 0.1, pz - 0.5, 0.07, 'fur', pick(r, furs), { cast: false }); }
    return t;
  };
  let tapper = null; let tip = null;
  const curl = pose === 'open' ? 0.08 : 0.75;
  fingers.forEach(([x, sp, len], i) => {
    if (i === 2 && pose === 'tap') return;           // animated separately
    if (i === 2 && pose === 'pinch') { tip = finger(b, len, 1.05, x, sp); return; }
    finger(b, len, i === 2 ? 0.08 : (pose === 'open' ? 0.05 : curl + i * 0.08), x, pose === 'open' ? sp * 1.6 : sp * 0.6);
  });
  // thumb (from the palm's side)
  const th0 = [1.45, -0.6, 0.2];
  if (pose === 'pinch' && tip) {
    const gap = 0.34; const dir = new THREE.Vector3(tip[0] - th0[0], tip[1] - th0[1], tip[2] - th0[2]); const d = dir.length(); dir.normalize();
    const te = [th0[0] + dir.x * (d - gap), th0[1] + dir.y * (d - gap), th0[2] + dir.z * (d - gap) + 0.15];
    b.beam(th0[0], th0[1], th0[2], te[0], te[1], te[2], 0.78, 'fur', skin, { th: 0.8 });
    if (o.holding !== null && o.holding !== false && o.holding !== 'none') { // cookie held upright between the two fingertips
      const cx = (tip[0] + te[0]) / 2, cy = (tip[1] + te[1]) / 2 + 0.05, cz = (tip[2] + te[2]) / 2 + 0.25;
      const m4 = new THREE.Matrix4().makeTranslation(cx, cy, cz).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.25)).multiply(new THREE.Matrix4().makeTranslation(0, -0.045, 0));
      b.pushMatrix(m4); P.cookie(b, { size: num(o.cookieSize, 1.1) }); b.pop();
      tip = [cx, cy, cz];
    }
  } else {
    const sp = pose === 'open' ? 0.75 : 0.45;
    b.beam(th0[0], th0[1], th0[2], th0[0] + Math.sin(sp) * 1.6, th0[1] + Math.cos(sp) * 1.6, th0[2] + (pose === 'open' ? 0.2 : 0.6), 0.78, 'fur', skin, { th: 0.8 });
  }
  let update = null;
  if (pose === 'tap') { // index finger as its own part, pivoting at the knuckle
    const [x, sp, len] = fingers[2];
    const g = subBuild(b, (s) => { s.push(-x, -1.45, -0.1, 0); finger(s, len, 0.1, x, sp); s.pop(); }, 'tap-finger');
    tapper = new THREE.Group(); tapper.add(g); b.object(tapper, x, 1.45, 0.1, 0); // (inside the lift push)
    const reach = num(o.reach, 1.8); const maxA = Math.min(1.1, Math.asin(Math.min(0.95, (reach - 0.45) / len)));
    const hz = num(o.rate, 3);
    update = (t) => { const ph = (t * hz) % 1; const k = ph < 0.35 ? smooth(0, 0.35, ph) : 1 - smooth(0.42, 0.9, ph); tapper.rotation.x = 0.12 + (maxA - 0.12) * k; };
    update(0);
  }
  if (o.light !== false) { const pl = new THREE.PointLight('#b4c6ff', num(o.lightIntensity, 9), 4.2, 1.6); pl.userData.noCollide = true; b.object(pl, 0, 1.0, 1.6, 0); }
  b.pop();
  if (tip) tip = [tip[0], tip[1] + lift, tip[2]];
  return { focus: { x: 0, y: 1.3 + lift, z: 0.6 }, update, tip };
};
/** the furry giant's face filling a window from outside: dark fur + unlit white eyes and grin; origin = window centre.
 *  opts: face ('teeth'|'creepy_grin'|'scream'|'hollow'), size (face plane width, 11), fur (colour) */
P.window_face = (b, o = {}) => {
  const r = b.rng; const S = num(o.size, 11); const fur = o.fur || '#141414';
  b.box(S * 1.5, S * 1.15, 1.2, 0, 0, -0.9, 'fur', fur);
  for (let i = 0; i < 160; i++) { // shaggy strands over the fur (kept off the face patch)
    const x = (r() - 0.5) * S * 1.4, y = (r() - 0.5) * S * 1.1; if (Math.abs(x) < S * 0.4 && y > -S * 0.34 && y < S * 0.3) continue;
    const L = range(r, 0.6, 1.4); b.beam(x, y, -0.25, x + (r() - 0.5) * 0.6, y - L, -0.05 + r() * 0.3, range(r, 0.1, 0.18), 'fur', shade(fur, (r() - 0.5) * 0.08), { cast: false });
  }
  const face = ['teeth', 'creepy_grin', 'scream', 'hollow'].includes(o.face) ? o.face : 'teeth';
  const ctx = b.ctx; const key = 'winface:' + face;
  if (!ctx.worldMats) ctx.worldMats = new Map();
  if (!ctx.worldMats.has(key)) { const m = new THREE.MeshBasicMaterial({ map: furryFaceTexture(ctx, face), transparent: true, depthWrite: false, fog: false }); m.name = key; ctx.worldMats.set(key, m); }
  b.quad(S, S * 0.84, 0, -S * 0.04, -0.2, key, '#ffffff', { cast: false });
  return { focus: { x: 0, y: 0, z: 0 } };
};

// ------------------------------------------------------------------ eyes in the dark
function eyeTex(ctx, color) {
  const key = 'world:eyeglow:' + color; if (ctx.textures?.get(key)) return ctx.textures.get(key);
  const c = cnv(128, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 32, 2, 64, 32, 60); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, color + '66'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
  g.save(); g.translate(64, 32); g.scale(1, 0.55); g.fillStyle = color; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(-4, -5, 9, 0, Math.PI * 2); g.fill(); g.restore();
  g.fillStyle = 'rgba(20,8,0,0.85)'; g.beginPath(); g.ellipse(64, 32, 3.2, 10, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; ctx.textures?.set(key, t); return t;
}
/** many pairs of glowing eyes in a volume (spread x,y,z), facing +Z. opts: count (24 pairs), spread ([34,7,12] or a
 *  number = width), color ('#ffd84a' | '#e8f4ff' …), size (0.45), approach (units/s toward +Z), open:true (open one by one),
 *  close:true (close one by one over closeTime 1.5 s, from closeStart 0.15 s), blink (true) */
P.glowing_eyes = (b, o = {}) => {
  const ctx = b.ctx; const rng = makeRng(o.seed ?? 'eyes'); const n = Math.max(1, Math.min(200, Math.round(num(o.count, 24))));
  const sp = Array.isArray(o.spread) ? o.spread : [num(o.spread, 34), 7, 12]; const [sx, sy, sz] = [num(sp[0], 34), num(sp[1], 7), num(sp[2], 12)];
  const color = typeof o.color === 'string' ? o.color : '#ffd84a'; const size = num(o.size, 0.6);
  const geo = new THREE.PlaneGeometry(1, 0.5);
  const mat = new THREE.MeshBasicMaterial({ map: eyeTex(ctx, color), transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending });
  const mesh = new THREE.InstancedMesh(geo, mat, n * 2); mesh.name = 'eyes-glow'; mesh.frustumCulled = false; mesh.renderOrder = 25; mesh.userData.noCollide = true;
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const z = (rng() - 0.5) * sz; const s = size * range(rng, 0.75, 1.3) * (1 + (-z / Math.max(1, sz)) * 0.2);
    pairs.push({ x: (rng() - 0.5) * sx, y: 1.2 + rng() * sy, z, s, sep: s * range(rng, 1.25, 1.6), tilt: (rng() - 0.5) * 0.25, per: range(rng, 2.6, 6.5), ph: rng() * 6, spd: range(rng, 0.8, 1.2), k: rng() });
  }
  const order = pairs.map((p, i) => [p.k, i]).sort((a, c) => a[0] - c[0]).map((e) => e[1]); order.forEach((pi, rank) => { pairs[pi].rank = rank; });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), e = new THREE.Euler();
  const appr = num(o.approach, 0); const closeT = num(o.closeTime, 1.5), closeS = num(o.closeStart, 0.15), openT = num(o.openTime, 1.2), openS = num(o.openStart, 0.05);
  const update = (t = 0) => {
    for (let i = 0; i < n; i++) {
      const p = pairs[i]; let lid = 1;
      if (o.blink !== false) { const bt = (t + p.ph) % p.per; if (bt < 0.16) lid = Math.abs(bt - 0.08) / 0.08; }
      if (o.open) { const t0 = openS + (p.rank / n) * openT; lid *= smooth(t0, t0 + 0.18, t); }
      if (o.close) { const t0 = closeS + (p.rank / n) * closeT; lid *= 1 - smooth(t0, t0 + 0.14, t); }
      const z = p.z + appr * t * p.spd;
      for (const sd of [-1, 1]) {
        e.set(0, 0, p.tilt * sd * -1); q.setFromEuler(e); pos.set(p.x + sd * p.sep / 2, p.y + sd * p.tilt * p.sep * 0.3, z); scl.set(p.s * 2, p.s * 2 * Math.max(0.001, lid), 1);
        m4.compose(pos, q, scl); mesh.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0); b.object(mesh, 0, 0, 0, 0);
  return { focus: { x: 0, y: 1.2 + sy / 2, z: 0 }, update };
};

// ------------------------------------------------------------------ small things
P.candle = (b, o = {}) => { // dish + wax candle + flickering flame + small warm point light
  const h = num(o.height, 0.9);
  b.cyl(0.42, 0.07, 0, 0, 0, 'metal', '#b8964a', 14); b.cyl(0.2, 0.12, 0, 0.07, 0, 'metal', '#b8964a', 10);
  b.cyl(0.15, h, 0, 0.1, 0, 'plastic', o.color || '#f2ead2', 10); b.box(0.03, 0.12, 0.03, 0, 0.16 + h, 0, 'plain', '#1a1a1a', { cast: false });
  b.blob(0.16, 0.06, 0.12 + h, 0.05, 'plastic', shade(o.color || '#f2ead2', -0.04), { sy: 0.5, cast: false }); // wax drip
  const flame = new THREE.Group(); flame.name = 'candle-flame-glow';
  const fm = new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false, fog: false });
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), fm); f.scale.set(1, 2.3, 1); f.position.y = 0.17; flame.add(f);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false, fog: false })); core.scale.set(1, 1.8, 1); core.position.y = 0.12; flame.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getTexture(b.ctx, 'glow'), color: '#ffb455', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75, fog: false }));
  halo.scale.set(1.1, 1.1, 1); halo.position.y = 0.18; flame.add(halo);
  flame.traverse((q) => { q.userData.noCollide = true; });
  b.object(flame, 0, 0.12 + h, 0, 0);
  const I = num(o.intensity, 14); const pl = new THREE.PointLight('#ffad5a', I, num(o.distance, 16), 1.5); b.object(pl, 0, 0.55 + h, 0.1, 0);
  const update = (t = 0) => {
    const k = 0.86 + 0.1 * Math.sin(t * 17.3) * Math.sin(t * 5.1 + 1.3) + 0.04 * Math.sin(t * 31.7);
    pl.intensity = I * k; flame.scale.set(1, 0.85 + 0.25 * k, 1); flame.rotation.z = 0.08 * Math.sin(t * 9.7);
  };
  update(0);
  return { focus: { x: 0, y: 0.3 + h, z: 0 }, update };
};
P.hammer_nails = (b, o = {}) => { // hammer lying on its side + a few nails (on a floor/table)
  b.push(0, 0, 0, num(o.yaw, 0.3));
  b.box(0.32, 0.26, 2.6, 0, 0.16, 0.2, 'planks', '#9a6a3a'); b.box(0.34, 0.28, 0.8, 0, 0.16, 1.2, 'plastic', '#2a2a2a');
  b.box(0.5, 0.42, 0.42, 0, 0.21, -1.2, 'metal', '#7a7f86'); b.box(0.5, 0.26, 0.6, 0, 0.2, -1.62, 'metal', '#8a8f96', { rx: 0.3 }); b.box(0.42, 0.42, 0.3, 0, 0.21, -0.85, 'metal', '#6a6f76');
  b.pop();
  const r = b.rng; for (let i = 0; i < 5; i++) { const x = 0.9 + r() * 0.8, z = -0.8 + r() * 1.6, a = r() * 6; b.push(x, 0.05, z, a); b.prim('cyl6', 0, 0, 0, 0.035, 0.7, 0.035, 'metal', '#9aa0a6', { rz: Math.PI / 2, cast: false }); b.prim('cyl8', 0.36, 0, 0, 0.09, 0.04, 0.09, 'metal', '#8a9096', { rz: Math.PI / 2, cast: false }); b.pop(); }
  return { focus: { x: 0.4, y: 0.2, z: 0 } };
};
P.plush = (b, o = {}) => { // teddy bear sitting, facing +Z (~1.6 tall)
  const c = o.color || '#a8784a', s = num(o.size, 1); const lt = shade(c, 0.12);
  b.blob(0.55 * s, 0, 0.55 * s, 0, 'fabric', c, { sy: 1.05, detail: 1 });
  b.blob(0.27 * s, 0, 0.55 * s, 0.38 * s, 'fabric', lt, { sy: 1.2 });
  b.blob(0.44 * s, 0, 1.35 * s, 0.02, 'fabric', c, { detail: 1 });
  b.blob(0.2 * s, 0, 1.25 * s, 0.38 * s, 'fabric', lt, { sy: 0.8 });
  for (const sd of [-1, 1]) {
    b.blob(0.17 * s, sd * 0.34 * s, 1.72 * s, -0.02, 'fabric', c); b.blob(0.1 * s, sd * 0.34 * s, 1.72 * s, 0.08 * s, 'fabric', lt);
    b.blob(0.2 * s, sd * 0.55 * s, 0.7 * s, 0.15 * s, 'fabric', c, { sy: 1.4 }); b.blob(0.22 * s, sd * 0.3 * s, 0.18 * s, 0.45 * s, 'fabric', c, { sz: 1.4 });
    b.sphere(0.06 * s, sd * 0.16 * s, 1.45 * s, 0.4 * s, 'plastic', '#111111', 6, { cast: false });
  }
  b.sphere(0.07 * s, 0, 1.3 * s, 0.57 * s, 'plastic', '#2a1a12', 6, { cast: false });
  if (o.bow !== false) b.box(0.5 * s, 0.16 * s, 0.1 * s, 0, 1.02 * s, 0.42 * s, 'satin', o.bow || '#e0306a', { cast: false });
  return { focus: { x: 0, y: 1.1 * s, z: 0.3 * s } };
};
const ICO = (() => { const t = (1 + Math.sqrt(5)) / 2; return [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => new THREE.Vector3(...v).normalize()); })();
P.ball = (b, o = {}) => { // soccer ball on the floor
  const R = num(o.size, 0.7); const c0 = new THREE.Color(o.color || '#f4f4f0'), c1 = new THREE.Color('#151515');
  const cen = b.world(0, R, 0); const v = new THREE.Vector3();
  b.sphere(R, 0, R, 0, 'plastic', '#ffffff', 14, { vcol: (p) => { v.copy(p).sub(cen).normalize(); return ICO.some((a) => a.dot(v) > 0.9) ? c1 : c0; } });
  return { focus: { x: 0, y: R, z: 0 } };
};

// ------------------------------------------------------------------ kids' room wall decor (atlases)
/** crayon drawings on paper (2×2 atlas: house, sun, family, moon) */
export function drawingsMaterial(ctx) {
  return canvasMaterial(ctx, 'kiddrawings', () => {
    const c = cnv(512, 512), g = c.getContext('2d'); const r = makeRng(77);
    ['house', 'sun', 'family', 'moon'].forEach((k, i) => {
      const x = (i % 2) * 256, y = Math.floor(i / 2) * 256;
      g.fillStyle = i === 3 ? '#fbf6e8' : '#ffffff'; g.fillRect(x + 4, y + 4, 248, 248);
      drawCrayon(g, k, x + 18, y + 18, 220, 220, r);
    });
    return c;
  }, { rough: 0.9 });
}
/** posters (2×2 atlas: rocket, dinosaur, GOAL!, race car) */
export function postersMaterial(ctx) {
  return canvasMaterial(ctx, 'kidposters', () => {
    const c = cnv(512, 768), g = c.getContext('2d'); const cw = 256, ch = 384;
    const cell = (i, bg, fn) => { const x = (i % 2) * cw, y = Math.floor(i / 2) * ch; g.save(); g.translate(x, y); g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, cw, ch); g.fillStyle = bg; g.fillRect(8, 8, cw - 16, ch - 16); fn(g); g.restore(); };
    cell(0, '#1b2a5a', (g) => { g.fillStyle = '#fff'; for (let k = 0; k < 30; k++) g.fillRect((k * 53) % 230 + 12, (k * 97) % 360 + 12, 3, 3);
      g.fillStyle = '#e8e8ee'; g.beginPath(); g.moveTo(128, 60); g.quadraticCurveTo(170, 140, 160, 250); g.lineTo(96, 250); g.quadraticCurveTo(86, 140, 128, 60); g.fill();
      g.fillStyle = '#d8302a'; g.beginPath(); g.moveTo(128, 60); g.quadraticCurveTo(150, 85, 156, 110); g.lineTo(100, 110); g.quadraticCurveTo(106, 85, 128, 60); g.fill(); g.fillRect(70, 215, 30, 50); g.fillRect(156, 215, 30, 50);
      g.fillStyle = '#4aa0e8'; g.beginPath(); g.arc(128, 160, 18, 0, 7); g.fill(); g.fillStyle = '#ffb030'; g.beginPath(); g.moveTo(104, 255); g.lineTo(128, 330); g.lineTo(152, 255); g.fill(); });
    cell(1, '#3f9a4a', (g) => { g.fillStyle = '#1f5a28'; g.beginPath(); g.ellipse(120, 230, 80, 45, 0, 0, 7); g.fill(); g.fillRect(150, 120, 34, 110); g.beginPath(); g.ellipse(190, 115, 42, 28, 0, 0, 7); g.fill();
      g.fillRect(70, 260, 22, 60); g.fillRect(140, 260, 22, 60); g.beginPath(); g.moveTo(45, 220); g.lineTo(10, 180); g.lineTo(60, 250); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(200, 105, 6, 0, 7); g.fill();
      g.fillStyle = '#ffe14a'; g.font = `bold 46px ${SANS}`; g.textAlign = 'center'; g.fillText('DINO!', 128, 360); });
    cell(2, '#f08a2a', (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 170, 70, 0, 7); g.fill(); g.fillStyle = '#151515'; for (const [dx, dy] of [[0, 0], [-46, -34], [46, -34], [-40, 44], [40, 44]]) { g.beginPath(); g.arc(128 + dx, 170 + dy, 17, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.font = `bold 64px ${SANS}`; g.textAlign = 'center'; g.fillText('GOAL!', 128, 330); });
    cell(3, '#2a62c8', (g) => { g.fillStyle = '#e8302a'; g.fillRect(40, 200, 176, 50); g.beginPath(); g.moveTo(80, 200); g.lineTo(110, 160); g.lineTo(170, 160); g.lineTo(196, 200); g.fill(); g.fillStyle = '#151515'; for (const x of [80, 176]) { g.beginPath(); g.arc(x, 252, 24, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.font = `bold 40px ${SANS}`; g.textAlign = 'center'; g.fillText('No. 7', 128, 110); g.fillRect(30, 300, 196, 8); });
    return c;
  }, { rough: 0.7 });
}
/** glow-in-the-dark star stickers (unlit, alpha-tested) */
export function starsMaterial(ctx) {
  return canvasMaterial(ctx, 'glowstars', () => {
    const c = cnv(512, 256), g = c.getContext('2d'); const r = makeRng(5);
    const star = (x, y, R) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; const rr = k % 2 ? R * 0.45 : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 26; k++) star(20 + r() * 472, 20 + r() * 216, 7 + r() * 13);
    g.beginPath(); g.arc(430, 60, 30, 0.6, 5.0); g.arc(445, 52, 24, 4.6, 1.0, true); g.fill(); // crescent moon sticker
    return c;
  }, { basic: true, transparent: true, alphaTest: 0.4, color: '#d9ff9a', fog: false });
}

export const PROPS3 = ['cookie', 'cookie_plate', 'fur_tuft', 'giant_footprint', 'footprint_trail', 'note_paper', 'giant_hand', 'window_face', 'glowing_eyes', 'candle', 'hammer_nails', 'plush', 'ball'];
