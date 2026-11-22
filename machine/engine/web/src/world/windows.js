// World module — interior window rig for room sets (bedroom, living_room, kitchen):
// casing, double-hung sashes (closed + latch | raised), a deep sill with items standing on it, 1–3 visibly
// distinct stacked curtain layers (sheer / main colour / blackout, each on its own rod at its own depth)
// that can be open, closed or open a crack, and animate closed/open one after another, planks nailed
// across, and a cold moonlight pool on the floor that follows the curtain opening.
// Usage (inside a set builder, at a wall transform: wall plane z=0, room toward +Z):
//   const rig = windowRig(ctx, b, { w, h, y, curtains, windowOpen, boarded, sill, floorY, light });
//   → { root, extra, update(t), onEnv(e), local: {sill, outside, window} (wall-local points), world: {…} }
import * as THREE from 'three';
import { Builder, shade, makeRng } from './core.js';
import { getMat } from './materials.js';
import { P } from './props.js';

const SLOT = [ // by layer index (0 = next to the glass): depth into the room, rod height above the casing, open stack width, overhang past the casing
  { dz: 0.78, rod: 0.4, open: 3.1, out: 1.75 },
  { dz: 1.08, rod: 0.75, open: 2.35, out: 1.6 },
  { dz: 1.38, rod: 1.1, open: 1.5, out: 1.45 },
];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** normalise opts.curtains → { layers:[{kind,color}], state, animate, gap, delay } | null */
export function normCurtains(c, def = {}) {
  if (c === false || c === 'none' || c === 0) return null;
  let o = {};
  if (c === true || c === undefined || c === null) o = {};
  else if (typeof c === 'number') o = { layers: c };
  else if (typeof c === 'string') o = /^#|^rgb/.test(c) ? { color: c } : { state: c };
  else if (typeof c === 'object') o = c;
  const n = Math.max(1, Math.min(3, Math.round(+o.layers || def.layers || 1)));
  const color = typeof o.color === 'string' ? o.color : def.color || '#3f5f9a';
  const kinds = n === 1 ? ['main'] : n === 2 ? ['sheer', 'main'] : ['sheer', 'main', 'blackout'];
  const cols = { sheer: typeof o.sheer === 'string' ? o.sheer : '#f4efe2', main: color, blackout: typeof o.blackout === 'string' ? o.blackout : '#262a36' };
  const state = ['open', 'closed', 'gap', 'layered'].includes(o.state) ? o.state : def.state || 'open';
  const animate = o.animate === 'close' || o.animate === 'open' ? o.animate : null;
  const gap = Math.max(0.15, Math.min(3, +o.gap || 0.55));
  return { layers: kinds.map((k) => ({ kind: k, color: cols[k] })), state, animate, gap, delay: Number.isFinite(+o.delay) ? +o.delay : 0.1, dur: Number.isFinite(+o.duration) ? Math.max(0.3, +o.duration) : 1.5 };
}

/** one pleated curtain panel hanging from y=0 down to -height, extending from x=0 toward side·width */
function panel(ctx, side, width, height, color, mat, cast, seed) {
  const b = new Builder(ctx, { rng: makeRng(seed), getMat: (k) => getMat(ctx, k) });
  b.cast = cast; b.receive = true;
  const n = Math.max(5, Math.round(width / 0.5)); const sw = width / n; const a = 0.45;
  for (let i = 0; i < n; i++) {
    const x = side * (i + 0.5) * sw; const s = i % 2 ? 1 : -1;
    b.box(sw / Math.cos(a) + 0.02, height, 0.05, x, -height / 2 - 0.2, 0, mat, shade(color, s > 0 ? -0.035 : 0.025), { ry: s * a });
  }
  b.box(width, 0.42, 0.16, side * width / 2, -0.2, 0, mat, shade(color, -0.07), { cast: false }); // header tape
  b.box(width, 0.22, 0.2, side * width / 2, -height - 0.1, 0, mat, shade(color, -0.05), { cast: false }); // hem
  const g = b.build('curtain'); g.traverse((o) => { if (o.isMesh) o.userData.noCollide = true; });
  return g;
}

function poolTexture(ctx) {
  const key = 'world:moonpool';
  if (ctx.textures?.get(key)) return ctx.textures.get(key);
  const S = 128, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d');
  g.filter = 'blur(5px)'; g.fillStyle = '#ffffff'; g.fillRect(10, 10, S - 20, S - 20);
  g.filter = 'blur(2px)'; g.fillStyle = '#000000'; g.fillRect(S / 2 - 4, 0, 8, S); g.fillRect(0, S / 2 - 5, S, 10); g.filter = 'none';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  ctx.textures?.set(key, t); return t;
}

/**
 * Build a window rig at the builder's current transform (wall plane z=0, +Z into the room).
 * o: { w, h, y (centre of the opening), curtains, windowOpen, boarded, sill:[ids|{type,x,opts}], floorY,
 *      light:[x,y,z] (direction toward the moon/sun, world), trim, seed, defCurtains }
 */
export function windowRig(ctx, b, o = {}) {
  const w = o.w || 9, h = o.h || 6.6, yc = o.y ?? 6.9; const trim = o.trim || '#f6f5f0';
  const yb = yc - h / 2, yt = yc + h / 2; const seed = o.seed || 7;
  const boarded = !!o.boarded;
  const cur = normCurtains(o.curtains, { ...(o.defCurtains || {}), state: boarded ? 'closed' : (o.defCurtains?.state || 'open') });
  const rootLocal = b.m.clone();
  // ---- casing (wall face) + deep sill on brackets
  b.box(w + 1.0, 0.55, 1.2, 0, yt + 0.27, 0, 'satin', trim);
  for (const s of [-1, 1]) b.box(0.5, h, 1.2, s * (w / 2 + 0.25), yc, 0, 'satin', trim);
  const sillTop = yb + 0.02, sillZ0 = -0.6, sillZ1 = 2.45;
  b.box(w + 1.6, 0.36, sillZ1 - sillZ0, 0, sillTop - 0.18, (sillZ0 + sillZ1) / 2, 'satin', trim);
  b.box(w + 0.6, 0.55, 0.14, 0, sillTop - 0.65, 0.07, 'satin', shade(trim, -0.04), { cast: false });
  for (const s of [-1, 1]) b.prim('wedge', s * (w / 2 - 0.4), sillTop - 0.36, 1.0, 0.3, 1.0, 2.0, 'satin', shade(trim, -0.03), { cast: false, rz: Math.PI });
  // ---- sashes: upper (outer track) fixed, lower (inner track) closed or raised
  const sash = (y0, y1, z) => {
    const hh = y1 - y0, cy = (y0 + y1) / 2;
    for (const s of [-1, 1]) b.box(0.28, hh, 0.22, s * (w / 2 - 0.14), cy, z, 'satin', trim, { cast: false });
    b.box(w, 0.3, 0.22, 0, y1 - 0.15, z, 'satin', trim, { cast: false }); b.box(w, 0.3, 0.22, 0, y0 + 0.15, z, 'satin', trim, { cast: false });
    b.box(0.12, hh - 0.5, 0.14, 0, cy, z, 'satin', trim, { cast: false });
    b.quad(w - 0.5, hh - 0.55, 0, cy, z, 'glass', '#cfe0f0', { cast: false });
  };
  sash(yc - 0.05, yt, -0.3);
  const raise = o.windowOpen ? h / 2 - 0.35 : 0;
  sash(yb + raise, yc + 0.1 + raise, -0.04);
  if (!o.windowOpen) { b.box(0.7, 0.16, 0.3, 0, yc + 0.18, 0.12, 'metal', '#c8a050', { cast: false }); b.box(0.22, 0.3, 0.22, 0.25, yc + 0.32, 0.18, 'metal', '#c8a050', { cast: false }); }
  // ---- sill items (standing in front of the curtains)
  const items = Array.isArray(o.sill) ? o.sill : (typeof o.sill === 'string' ? [o.sill] : []);
  const itemZ = 1.95; const nIt = items.length;
  items.slice(0, 6).forEach((it, i) => {
    const spec = typeof it === 'string' ? { type: it } : (it && typeof it === 'object' ? it : null);
    const fn = spec && P[spec.type]; if (!fn) return;
    const x = Number.isFinite(+spec.x) ? +spec.x : (i - (nIt - 1) / 2) * Math.min(1.6, (w - 1) / Math.max(1, nIt));
    b.push(x, sillTop, itemZ + (Number.isFinite(+spec.z) ? +spec.z : 0), +spec.yaw || 0); try { fn(b, spec.opts || {}); } catch (e) { console.warn('[world] sill item', spec.type, e.message); } b.pop();
  });
  // ---- curtains (dynamic): per layer a rod + two pleated panels on pivots at the outer ends
  const root = new THREE.Group(); root.name = 'window-rig';
  const layers = [];
  if (cur) cur.layers.forEach((L, i) => {
    const S = SLOT[i]; const half = w / 2 + S.out; const full = half + 0.08; const hgt = (yt + S.rod) - (sillTop + 0.14 + i * 0.12);
    const rodY = yt + S.rod + 0.25;
    b.cyl(0.1, 2 * half + 0.9, -(half + 0.45), rodY, S.dz, 'metal', i === 2 ? '#2a2a2e' : i === 1 ? '#6a4a2a' : '#c8c4bc', 6, { rz: -Math.PI / 2, cast: false });
    for (const s of [-1, 1]) { b.sphere(0.2, s * (half + 0.5), rodY, S.dz, 'metal', i === 2 ? '#2a2a2e' : '#8a6a3a', 6, { cast: false }); b.box(0.16, 0.5, S.dz + 0.1, s * (half + 0.2), rodY - 0.05, S.dz / 2, 'metal', '#5a5a5a', { cast: false }); }
    const mat = L.kind === 'sheer' ? 'sheer' : 'fabric'; const cast = L.kind !== 'sheer';
    const pv = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * half, rodY - 0.12, S.dz);
      pivot.add(panel(ctx, -s, full, hgt, L.color, mat, cast, seed + i * 7 + (s > 0 ? 1 : 0)));
      root.add(pivot); pv.push(pivot);
    }
    layers.push({ ...L, i, half, full, open: S.open, pv });
  });
  b.object(root, 0, 0, 0, 0);
  // ---- planks nailed across (in front of the curtains)
  if (boarded) {
    const pz = 1.85; const r = makeRng(seed + 99); const L = w + 4.4;
    const rows = [yb + 1.1, yc - 0.2, yc + 1.9, yt - 0.3];
    rows.forEach((yy, k) => {
      const tilt = (r() - 0.5) * 0.12; const c = shade('#a07e54', (r() - 0.5) * 0.14);
      b.box(L, 0.95, 0.34, 0, yy, pz + (k % 2) * 0.05, 'planks', c, { rz: tilt });
      for (const s of [-1, 1]) for (const dy of [-0.22, 0.22]) b.box(0.16, 0.16, 0.12, s * (L / 2 - 0.45), yy + dy + s * tilt * (L / 2 - 0.45), pz + 0.22 + (k % 2) * 0.05, 'metal', '#3a3a3e', { cast: false });
    });
    const dl = Math.hypot(w + 1.5, h - 0.6); const ang = Math.atan2(h - 0.6, w + 1.5);
    b.box(dl, 0.9, 0.3, 0, yc, pz + 0.36, 'planks', '#8e6c46', { rz: ang });
    for (const s of [-1, 1]) b.box(0.16, 0.16, 0.12, s * Math.cos(ang) * (dl / 2 - 0.5), yc + s * Math.sin(ang) * (dl / 2 - 0.5), pz + 0.56, 'metal', '#3a3a3e', { cast: false });
  }
  // ---- moonlight pool on the floor (follows the curtain opening), shown by onEnv at night/dusk
  const extra = []; let pool = null; const Ld = o.light ? new THREE.Vector3(...o.light).normalize() : null;
  const floorY = (o.floorY ?? 0) + 0.11;
  if (Ld && Ld.y > 0.05) {
    const g = new THREE.BufferGeometry(); const pos = new Float32Array(12);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.MeshBasicMaterial({ map: poolTexture(ctx), color: '#9fb8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    pool = new THREE.Mesh(g, m); pool.name = 'moonpool-glow'; pool.frustumCulled = false; pool.renderOrder = 22; pool.visible = false; pool.userData.noCollide = true;
    extra.push(pool);
  }
  const corner = (x, y) => new THREE.Vector3(x, y, 0).applyMatrix4(rootLocal);
  const project = (p) => { const t = (p.y - floorY) / Ld.y; return p.clone().addScaledVector(Ld, -t); };
  let lastKey = '';
  const setPool = (x0, x1) => {
    if (!pool) return; const key = x0.toFixed(2) + ',' + x1.toFixed(2); if (key === lastKey) return; lastKey = key;
    const pa = pool.geometry.attributes.position, ua = pool.geometry.attributes.uv;
    const pts = [[x0, yb], [x1, yb], [x1, yt], [x0, yt]];
    pts.forEach(([x, y], k) => { const q = project(corner(x, y)); pa.setXYZ(k, q.x, floorY, q.z); ua.setXY(k, (x + w / 2) / w, (y - yb) / h); });
    pa.needsUpdate = true; ua.needsUpdate = true;
  };
  let envK = 0; const boardK = boarded ? 0.35 : 1;
  // ---- state per time
  const widthAt = (L, t) => {
    // 'layered': glass-side layer closed, the next one half open, the room-side one open → all layers read at once
    const lay = (L) => { const n = layers.length; const k = n - 1 - L.i; return k === 0 && n > 1 ? L.open : k === 0 ? L.half * 0.55 : k === 1 && n === 3 ? L.half - w * 0.27 : L.full; };
    const W = (st) => (st === 'open' ? L.open : st === 'gap' ? L.full - 0.08 - cur.gap / 2 : st === 'layered' ? lay(L) : L.full);
    if (!cur.animate) return W(cur.state);
    const n = layers.length; const step = n > 1 ? (cur.dur - 0.55) / (n - 1) : 0;
    const k = cur.animate === 'close' ? L.i : n - 1 - L.i; // close: glass side first; open: room side first
    const t0 = cur.delay + k * step; const e = smooth(t0, t0 + 0.55, t);
    const from = cur.animate === 'close' ? W('open') : W('closed');
    const to = cur.animate === 'close' ? (cur.state === 'gap' ? W('gap') : W('closed')) : (cur.state === 'gap' || cur.state === 'layered' ? W(cur.state) : W('open'));
    return from + (to - from) * e;
  };
  // light through the window: sample the opening across x; sheer passes 60 %, other layers ~8 %
  const NS = 24; const sampleT = (wds) => {
    const T = new Array(NS).fill(1);
    for (let k = 0; k < NS; k++) { const x = -w / 2 + (k + 0.5) * w / NS; layers.forEach((L, j) => { const wd = wds[j]; if (wd > L.open + 0.05 && (x < -L.half + wd || x > L.half - wd)) T[k] *= L.kind === 'sheer' ? 0.6 : 0.08; }); // stacks pulled open don't count if (boarded) T[k] *= 0.5; }
    return T;
  };
  let sun = null, sunBase = 0; const dimSun = o.dimSun !== false;
  const update = (t = 0) => {
    const wds = layers.map((L) => Math.max(0.3, widthAt(L, t)));
    layers.forEach((L, j) => { const sc = wds[j] / L.full; for (const p of L.pv) p.scale.x = sc; });
    const T = sampleT(wds); const mean = T.reduce((a, c) => a + c, 0) / NS;
    if (sun && dimSun) sun.intensity = sunBase * (0.22 + 0.78 * mean);
    if (pool) {
      let a = -1, z = -1; for (let k = 0; k < NS; k++) if (T[k] > 0.3) { if (a < 0) a = k; z = k; }
      pool.visible = envK > 0 && a >= 0;
      if (pool.visible) {
        let m = 0; for (let k = a; k <= z; k++) m += T[k]; m /= (z - a + 1);
        setPool(-w / 2 + a * w / NS, -w / 2 + (z + 1) * w / NS); pool.material.opacity = envK * m * (0.55 + 0.45 * Math.min(1, ((z - a + 1) / NS) * 4));
      }
    }
  };
  update(0);
  const onEnv = (e) => {
    const night = e.time === 'night', dusk = e.time === 'dusk';
    envK = !e.interior ? 0 : night ? (e.power === 'off' ? 0.5 : 0.2) : dusk ? (e.power === 'off' ? 0.3 : 0.12) : 0;
    sun = e.interior && e.sun ? e.sun : null; sunBase = sun ? sun.intensity : 0;
    update(0);
  };
  const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(rootLocal);
  const local = { window: [0, yc, 0], sill: [0, sillTop, itemZ], outside: [0, yc, -2.1] };
  const world = {}; for (const k in local) { const v = W(...local[k]); world[k] = { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }; }
  return { root, extra, update, onEnv, local, world, curtains: cur };
}
