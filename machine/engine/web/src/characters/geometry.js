// Geometries: atlas-mapped R6 body boxes, rounded Roblox head, blocky hair styles, accessories.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cached, mulberry } from './util.js';
import { boxNet } from './textures.js';

export const HEAD_W = 1.26, HEAD_H = 1.2, HEAD_D = 1.2;

/** Box whose 6 faces map into a cross-shaped atlas (see textures.boxNet). */
export function atlasBox(ctx, w, h, d) {
  return cached(ctx, `chr:geo:box:${w}:${h}:${d}`, () => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const net = boxNet(w, h, d), names = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    const uv = geo.attributes.uv;
    for (let gi = 0; gi < 6; gi++) {
      const [x, y, rw, rh] = net[names[gi]];
      for (let i = 0; i < 4; i++) {
        const k = gi * 4 + i, u = uv.getX(k), v = uv.getY(k);
        uv.setXY(k, (x + u * rw) / net.W, 1 - (y + (1 - v) * rh) / net.H);
      }
    }
    geo.clearGroups();
    return geo;
  });
}

/** Roblox-classic head: rounded box; front face gets a planar UV over the face decal, other faces sample a skin texel. */
export function headGeometry(ctx) {
  return cached(ctx, 'chr:geo:head', () => {
    const geo = new RoundedBoxGeometry(HEAD_W, HEAD_H, HEAD_D, 3, 0.3);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const front = geo.groups[4];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = front.start; i < front.start + front.count; i++) { const x = pos.getX(i), y = pos.getY(i); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let i = 0; i < pos.count; i++) {
      if (i >= front.start && i < front.start + front.count) uv.setXY(i, (pos.getX(i) - minX) / (maxX - minX), (pos.getY(i) - minY) / (maxY - minY));
      else uv.setXY(i, 0.02, 0.02);
    }
    geo.clearGroups();
    return geo;
  });
}

// ------------------------------------------------------------------ merge helpers
function prep(geo, matrix) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  if (matrix) g.applyMatrix4(matrix);
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(px, py, pz), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}
class Builder {
  constructor() { this.parts = []; }
  add(geo, m) { this.parts.push(prep(geo, m)); return this; }
  box(w, h, d, px, py, pz, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), M(px, py, pz, rx, ry, rz)); }
  rbox(w, h, d, r, px, py, pz, rx = 0, ry = 0, rz = 0) { return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), M(px, py, pz, rx, ry, rz)); }
  /** pyramid spike: base centre at p, pointing along dir */
  spike(base, dir, len, rad, twist = 0, sides = 4) {
    const geo = new THREE.ConeGeometry(rad, len, sides, 1);
    geo.translate(0, len / 2, 0);
    geo.rotateY(twist);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const m = new THREE.Matrix4().compose(base, q, new THREE.Vector3(1, 1, 1));
    return this.add(geo, m);
  }
  blob(r, px, py, pz, detail = 0) { return this.add(new THREE.IcosahedronGeometry(r, detail), M(px, py, pz)); }
  build() { const g = mergeGeometries(this.parts, false); g.computeBoundingSphere(); return g; }
}

// ------------------------------------------------------------------ hair (head-local: head centre = origin, front = +Z)
const TOP = HEAD_H / 2, FR = HEAD_D / 2, SIDE = HEAD_W / 2;
function cap(b, { y = 0.44, h = 0.42, back = 0.0, w = HEAD_W + 0.1, d = HEAD_D + 0.1, r = 0.2 } = {}) {
  b.rbox(w, h, d, r, 0, y, back);
}
function backAndSides(b, { low = -0.05, sideLow = 0.12, thick = 0.12 } = {}) {
  const bh = TOP - low;
  b.rbox(HEAD_W + 0.08, bh, 0.32, 0.1, 0, low + bh / 2, -FR + 0.1);
  const sh = TOP - sideLow;
  for (const s of [-1, 1]) b.rbox(thick + 0.08, sh, HEAD_D * 0.7, 0.05, s * (SIDE + thick / 2 - 0.04), sideLow + sh / 2, -0.12);
}

const HAIR_BUILD = {
  short(b) {
    cap(b, { y: 0.46, h: 0.36 });
    backAndSides(b, { low: 0.02, sideLow: 0.2 });
    // swept fringe chunks
    b.rbox(0.62, 0.2, 0.2, 0.06, -0.3, 0.42, FR + 0.02, 0.1, 0, 0.18);
    b.rbox(0.55, 0.2, 0.2, 0.06, 0.12, 0.44, FR + 0.03, 0.12, 0, 0.1);
    b.rbox(0.4, 0.17, 0.2, 0.06, 0.45, 0.47, FR + 0.0, 0.1, 0, -0.05);
    b.rbox(HEAD_W + 0.02, 0.2, HEAD_D + 0.02, 0.1, 0.02, TOP + 0.08, -0.02, 0.06, 0, 0.04);
  },
  spiky(b) {
    cap(b, { y: 0.47, h: 0.4, w: HEAD_W + 0.1, d: HEAD_D + 0.12 });
    backAndSides(b, { low: -0.08, sideLow: 0.12, thick: 0.14 });
    const r = mulberry(1234);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // crown spikes radiating up/out
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.3;
      const ring = 0.35 + r() * 0.2;
      const base = V(Math.sin(a) * ring * 0.9, TOP + 0.08, Math.cos(a) * ring * 0.85 - 0.05);
      const dir = V(Math.sin(a) * (0.9 + r() * 0.5), 0.55 + r() * 0.5, Math.cos(a) * (0.7 + r() * 0.5) - 0.25);
      b.spike(base, dir, 0.55 + r() * 0.3, 0.2 + r() * 0.06, r() * 3);
    }
    for (let i = 0; i < 6; i++) b.spike(V((r() - 0.5) * 0.6, TOP + 0.15, (r() - 0.5) * 0.6 - 0.05), V((r() - 0.5) * 0.8, 1, (r() - 0.5) * 0.6 - 0.2), 0.5 + r() * 0.3, 0.2, r() * 3);
    // side / back spikes pointing out & down
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * 0.35 + (i / 11) * Math.PI * 1.3;
      const base = V(Math.sin(a) * 0.62, 0.22 + r() * 0.2, Math.cos(a) * 0.62 - 0.04);
      const dir = V(Math.sin(a) * 0.8, -0.5 - r() * 0.4, Math.cos(a) * 0.8);
      b.spike(base, dir, 0.45 + r() * 0.25, 0.17 + r() * 0.05, r() * 3);
    }
    // fringe spikes falling over the forehead
    const fr = [[-0.45, 0.9], [-0.2, 0.7], [0.12, 0.8], [0.4, 0.65]];
    for (const [x, tilt] of fr) b.spike(V(x, 0.56, FR - 0.04), V(x * 0.5 + (r() - 0.5) * 0.3, -1, tilt), 0.34 + r() * 0.08, 0.16, r() * 3);
  },
  bowl(b) {
    b.rbox(HEAD_W + 0.14, 0.5, HEAD_D + 0.14, 0.22, 0, 0.47, 0);
    b.rbox(HEAD_W + 0.12, 0.62, HEAD_D * 0.75, 0.12, 0, 0.12, -0.18);
    b.rbox(HEAD_W + 0.14, 0.12, 0.22, 0.05, 0, 0.27, FR - 0.02);
  },
  long(b) {
    cap(b, { y: 0.46, h: 0.4 });
    b.rbox(HEAD_W + 0.12, 1.55, 0.3, 0.1, 0, -0.25, -FR + 0.08);
    for (const s of [-1, 1]) {
      b.rbox(0.2, 1.3, HEAD_D * 0.82, 0.06, s * (SIDE + 0.06), -0.12, -0.08);
      b.rbox(0.22, 0.95, 0.26, 0.06, s * (SIDE - 0.02), -0.3, FR - 0.08);
    }
    b.rbox(0.66, 0.2, 0.18, 0.06, -0.24, 0.43, FR + 0.02, 0.12, 0, 0.16);
    b.rbox(0.66, 0.2, 0.18, 0.06, 0.26, 0.43, FR + 0.02, 0.12, 0, -0.16);
  },
  ponytail(b) {
    cap(b, { y: 0.47, h: 0.38 });
    backAndSides(b, { low: 0.0, sideLow: 0.05 });
    b.rbox(HEAD_W + 0.12, 0.22, 0.22, 0.07, 0, 0.42, FR + 0.02, 0.1, 0, 0);
    for (const s of [-1, 1]) b.rbox(0.18, 0.55, 0.22, 0.05, s * (SIDE - 0.02), 0.2, FR - 0.08);
    b.rbox(0.3, 0.22, 0.3, 0.06, 0, 0.5, -FR - 0.12); // tie
    b.add(new THREE.CylinderGeometry(0.3, 0.14, 1.35, 6), M(0, -0.12, -FR - 0.36, -0.32, 0, 0));
  },
  bun(b) {
    cap(b, { y: 0.46, h: 0.4 });
    backAndSides(b, { low: 0.02, sideLow: 0.1 });
    b.rbox(HEAD_W + 0.1, 0.2, 0.2, 0.06, 0, 0.44, FR + 0.02, 0.1, 0, 0);
    b.blob(0.34, 0, TOP + 0.24, -0.25, 1);
  },
  bald() { },
  cap(b) { // short hair under a cap; cap itself is an accessory mesh (coloured separately)
    backAndSides(b, { low: 0.02, sideLow: 0.15 });
    b.rbox(HEAD_W + 0.06, 0.2, HEAD_D * 0.8, 0.06, 0, 0.3, -0.1);
  },
  messy(b) {
    cap(b, { y: 0.47, h: 0.38 });
    backAndSides(b, { low: 0.0, sideLow: 0.15 });
    const r = mulberry(777);
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, rr = 0.15 + r() * 0.45;
      b.rbox(0.32 + r() * 0.2, 0.18 + r() * 0.1, 0.32 + r() * 0.2, 0.05, Math.sin(a) * rr, TOP + 0.05 + r() * 0.12, Math.cos(a) * rr - 0.05, (r() - 0.5) * 0.9, r() * 3, (r() - 0.5) * 0.9);
    }
    for (let i = 0; i < 5; i++) b.rbox(0.28, 0.2, 0.18, 0.05, -0.5 + i * 0.25, 0.4 - r() * 0.06, FR + 0.03, 0.2 + r() * 0.3, 0, (r() - 0.5) * 0.6);
  },
  curly(b) {
    cap(b, { y: 0.44, h: 0.42 });
    const r = mulberry(4321);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, el = r();
      const y = 0.1 + el * 0.62;
      const rad = el > 0.75 ? 0.25 + r() * 0.2 : 0.68;
      const x = Math.sin(a) * rad, z = Math.cos(a) * rad * 0.95 - 0.04;
      if (z > 0.45 && y < 0.42) continue; // keep the face clear
      b.blob(0.18 + r() * 0.06, x, y, z, 0);
    }
    for (let i = 0; i < 6; i++) b.blob(0.17, -0.5 + i * 0.2, 0.47, FR - 0.02, 0);
  },
};

export function hairGeometry(ctx, style) {
  return cached(ctx, `chr:geo:hair:${style}`, () => {
    const b = new Builder();
    (HAIR_BUILD[style] || HAIR_BUILD.short)(b);
    return b.parts.length ? b.build() : null;
  });
}

// ------------------------------------------------------------------ accessories (head-local unless noted)
export function capGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:cap', () => {
    const b = new Builder();
    b.rbox(HEAD_W + 0.14, 0.42, HEAD_D + 0.12, 0.2, 0, 0.55, -0.02);
    b.box(HEAD_W * 0.92, 0.06, 0.55, 0, 0.38, FR + 0.25, -0.12, 0, 0);
    b.box(0.12, 0.08, 0.12, 0, 0.8, 0);
    return b.build();
  });
}
function rimShape(w, h, t, r) {
  const s = new THREE.Shape();
  const rr = (sh, x, y, W, H, R) => { sh.moveTo(x + R, y); sh.lineTo(x + W - R, y); sh.quadraticCurveTo(x + W, y, x + W, y + R); sh.lineTo(x + W, y + H - R); sh.quadraticCurveTo(x + W, y + H, x + W - R, y + H); sh.lineTo(x + R, y + H); sh.quadraticCurveTo(x, y + H, x, y + H - R); sh.lineTo(x, y + R); sh.quadraticCurveTo(x, y, x + R, y); };
  rr(s, -w / 2, -h / 2, w, h, r);
  const hole = new THREE.Path(); rr(hole, -w / 2 + t, -h / 2 + t, w - 2 * t, h - 2 * t, Math.max(0.01, r - t * 0.6));
  s.holes.push(hole);
  return s;
}
export const EYE_Y = HEAD_H / 2 - 0.445 * HEAD_H; // head-local y of the eye line
export function glassesGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:glasses', () => {
    const b = new Builder();
    const shape = rimShape(0.44, 0.31, 0.06, 0.07);
    const ex = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 3 });
    for (const s of [-1, 1]) b.add(ex, M(s * 0.235, EYE_Y + 0.01, FR + 0.005));
    b.box(0.1, 0.05, 0.04, 0, EYE_Y + 0.06, FR + 0.025);
    for (const s of [-1, 1]) b.box(0.05, 0.05, 0.3, s * 0.49, EYE_Y + 0.1, FR - 0.12);
    return b.build();
  });
}
export function lensGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:lens', () => {
    const b = new Builder();
    for (const s of [-1, 1]) b.rbox(0.38, 0.26, 0.02, 0.009, s * 0.235, EYE_Y + 0.01, FR + 0.02);
    return b.build();
  });
}
export function beardGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:beard', () => {
    const b = new Builder();
    b.rbox(HEAD_W + 0.06, 0.42, 0.3, 0.08, 0, -0.42, FR - 0.08);
    b.rbox(0.7, 0.2, 0.2, 0.06, 0, -0.66, FR - 0.04);
    for (const s of [-1, 1]) b.rbox(0.16, 0.7, 0.7, 0.05, s * (SIDE + 0.02), -0.15, 0.1);
    return b.build();
  });
}
export function mustacheGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:mustache', () => {
    const b = new Builder();
    b.rbox(0.24, 0.1, 0.08, 0.03, -0.11, -0.07, FR + 0.02, 0, 0, 0.18);
    b.rbox(0.24, 0.1, 0.08, 0.03, 0.11, -0.07, FR + 0.02, 0, 0, -0.18);
    return b.build();
  });
}
export function bowGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:bow', () => {
    const b = new Builder();
    b.add(new THREE.ConeGeometry(0.2, 0.32, 4), M(-0.18, 0, 0, 0, 0, Math.PI / 2));
    b.add(new THREE.ConeGeometry(0.2, 0.32, 4), M(0.18, 0, 0, 0, 0, -Math.PI / 2));
    b.rbox(0.13, 0.13, 0.13, 0.03, 0, 0, 0);
    return b.build();
  });
}
// torso-local (upper group: waist at y=0, torso centre y=1, front z=+0.5)
export function tieGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:tie', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.07, 0); s.lineTo(0.07, 0); s.lineTo(0.13, -0.85); s.lineTo(0, -1.0); s.lineTo(-0.13, -0.85); s.closePath();
    const b = new Builder();
    b.add(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }), M(0, 1.84, 0.5));
    b.rbox(0.2, 0.16, 0.08, 0.03, 0, 1.9, 0.53);
    return b.build();
  });
}
export function chainGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:chain', () => {
    const b = new Builder();
    const link = new THREE.TorusGeometry(0.055, 0.022, 4, 8);
    const pts = [];
    // U-shaped chain: from the shoulders over the chest down to the medallion
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, a = (t - 0.5) * Math.PI * 0.92;
      pts.push(new THREE.Vector3(Math.sin(a) * 0.62, 2.0 - Math.cos(a) * 0.82, 0.52));
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], n = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)];
      const ang = Math.atan2(n.y - pv.y, n.x - pv.x);
      b.add(link, M(p.x, p.y, p.z, i % 2 ? Math.PI / 2 : 0, 0, ang));
    }
    // over the shoulders to the back
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.add(link, M(s * 0.62, 2.02, 0.4 - i * 0.28, i % 2 ? 0 : Math.PI / 2, Math.PI / 2, 0));
    b.add(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 18), M(0, 1.05, 0.54, Math.PI / 2, 0, 0));
    return b.build();
  });
}
export function gemGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:gem', () => new THREE.CylinderGeometry(0.12, 0.12, 0.05, 14).rotateX(Math.PI / 2).translate(0, 1.05, 0.58));
}
export function scarfGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:scarf', () => {
    const b = new Builder();
    b.rbox(1.5, 0.32, 1.2, 0.1, 0, 2.06, 0);
    b.rbox(0.36, 0.95, 0.14, 0.05, 0.42, 1.55, 0.58, 0.05, 0, 0.06);
    return b.build();
  });
}
export function apronGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:apron', () => {
    const b = new Builder();
    b.box(1.3, 1.1, 0.05, 0, 1.35, 0.53); // bib
    b.box(1.7, 1.5, 0.05, 0, 0.15, 0.53); // skirt part (hangs over the legs)
    b.box(0.14, 0.12, 1.06, 0.55, 1.95, 0.0); b.box(0.14, 0.12, 1.06, -0.55, 1.95, 0.0);
    return b.build();
  });
}
export function hoodGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:hood', () => {
    const b = new Builder();
    b.rbox(1.5, 0.42, 0.5, 0.15, 0, 2.08, -0.38);
    return b.build();
  });
}
/** A-line skirt (frustum box) — hips-local (waist at y=0). */
export function skirtGeometry(ctx, length, flare) {
  return cached(ctx, `chr:geo:skirt:${length}:${flare}`, () => {
    const geo = new THREE.BoxGeometry(2.08, length, 1.08, 1, 1, 1).toNonIndexed();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) { pos.setX(i, pos.getX(i) * flare); pos.setZ(i, pos.getZ(i) * (1 + (flare - 1) * 1.8)); }
    geo.computeVertexNormals();
    geo.translate(0, 0.25 - length / 2, 0);
    return geo;
  });
}

// ------------------------------------------------------------------ v3: sleep mask (head-local, centred on the eye line)
export const MASK_W = 1.42, MASK_H = 0.42, MASK_D = 0.44;
/** Chunky padded sleep-mask panel; the front face gets planar UVs (text decal), the rest samples the fabric texel at (0.01, 0.01). */
export function maskPanelGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:maskpanel', () => {
    const geo = new RoundedBoxGeometry(MASK_W, MASK_H, MASK_D, 2, 0.12);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const front = geo.groups[4];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = front.start; i < front.start + front.count; i++) { const x = pos.getX(i), y = pos.getY(i); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let i = 0; i < pos.count; i++) {
      if (i >= front.start && i < front.start + front.count) uv.setXY(i, (pos.getX(i) - minX) / (maxX - minX), (pos.getY(i) - minY) / (maxY - minY));
      else uv.setXY(i, 0.01, 0.01);
    }
    geo.clearGroups();
    geo.translate(0, 0, FR + 0.075 - MASK_D / 2);
    return geo;
  });
}
/** Elastic strap around the head (a thin rounded ring slightly larger than the head; its top/bottom stay hidden inside). */
export function maskBandGeometry(ctx) {
  return cached(ctx, 'chr:geo:acc:maskband', () => new RoundedBoxGeometry(HEAD_W + 0.07, 0.12, HEAD_D + 0.07, 2, 0.33));
}

export { Builder, M };
