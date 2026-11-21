// World module — core helpers: seeded RNG, colour cache, geometry templates and the merging Builder.
// The Builder collects primitives (box, cylinder, cone, prism, plane, …) with a transform stack and
// merges everything into ONE mesh per (chunk, material, shadow flags) with vertex colours, so a whole
// town renders in ~20 draw calls. Owner: world module. Contract: ARCHITECTURE.md §4.
import * as THREE from 'three';

// ---------------------------------------------------------------- rng
export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function makeRng(seed) { return mulberry32(typeof seed === 'number' ? (seed * 2654435761) >>> 0 : hashStr(String(seed))); }
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const range = (rng, a, b) => a + (b - a) * rng();
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------- colours
const _colCache = new Map();
export function col(c) {
  if (c && c.isColor) return c;
  const k = c === undefined || c === null ? '#ffffff' : String(c);
  let v = _colCache.get(k);
  if (!v) { v = new THREE.Color(); try { v.set(k); } catch (e) { v.set('#ff00ff'); } _colCache.set(k, v); }
  return v;
}
/** Lighten (amt>0) or darken (amt<0) a colour in sRGB-ish space; returns a hex string. */
export function shade(c, amt) {
  const k = col(c).clone(); const hsl = {}; k.getHSL(hsl);
  k.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + k.getHexString();
}

// ---------------------------------------------------------------- templates (unit size, centred)
const TEMPL = {};
function flatten(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
function prismGeometry() {
  // triangle (-0.5,0) (0.5,0) (0,1) in XY, extruded z -0.5..0.5 ; flat normals, uv = position based
  const A = [-0.5, 0], B = [0.5, 0], C = [0, 1];
  const pos = [], uv = [];
  const tri = (p, q, r) => { for (const v of [p, q, r]) { pos.push(...v); uv.push(v[0] + 0.5, v[1]); } };
  const f = (p, z) => [p[0], p[1], z];
  tri(f(A, 0.5), f(B, 0.5), f(C, 0.5));          // front
  tri(f(B, -0.5), f(A, -0.5), f(C, -0.5));       // back
  const quad = (p, q, r, s) => { tri(p, q, r); tri(p, r, s); };
  quad(f(A, -0.5), f(B, -0.5), f(B, 0.5), f(A, 0.5)); // bottom
  quad(f(B, 0.5), f(B, -0.5), f(C, -0.5), f(C, 0.5)); // right slope
  quad(f(C, 0.5), f(C, -0.5), f(A, -0.5), f(A, 0.5)); // left slope
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function wedgeGeometry() {
  // ramp: bottom 1x1 (x,z -0.5..0.5), height 1 at z=-0.5 falling to 0 at z=+0.5
  const p = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]];
  const faces = [[0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [0, 4, 3], [1, 2, 5]];
  const pos = [], uv = [];
  for (const f of faces) for (const i of f) { pos.push(...p[i]); uv.push(p[i][0] + 0.5, p[i][1] + p[i][2] + 0.5); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
export function template(name) {
  let g = TEMPL[name];
  if (g) return g;
  const m = /^(\w+?)(\d+)?$/.exec(name); const kind = m[1]; const n = +(m[2] || 0);
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'plane': g = new THREE.PlaneGeometry(1, 1); break;
    case 'cyl': g = new THREE.CylinderGeometry(1, 1, 1, n || 10, 1); break;           // smooth
    case 'cylf': g = flatten(new THREE.CylinderGeometry(1, 1, 1, n || 6, 1)); break;  // faceted
    case 'cone': g = new THREE.ConeGeometry(1, 1, n || 10, 1); break;
    case 'conef': g = flatten(new THREE.ConeGeometry(1, 1, n || 7, 1)); break;
    case 'frus': g = new THREE.CylinderGeometry(0.6, 1, 1, n || 8, 1); break;          // frustum (top r 0.6)
    case 'sph': g = new THREE.SphereGeometry(1, n || 12, Math.max(6, Math.round((n || 12) * 0.6))); break;
    case 'ico': g = flatten(new THREE.IcosahedronGeometry(1, n || 0)); break;
    case 'dodec': g = flatten(new THREE.DodecahedronGeometry(1, 0)); break;
    case 'torus': g = new THREE.TorusGeometry(1, 0.32, 8, n || 16); break;
    case 'disc': g = new THREE.CircleGeometry(1, n || 24); break;
    case 'ring': g = new THREE.RingGeometry(0.8, 1, n || 32, 1); break;
    case 'prism': g = prismGeometry(); break;
    case 'wedge': g = wedgeGeometry(); break;
    case 'hemi': g = new THREE.SphereGeometry(1, n || 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); break;
    default: throw new Error('unknown template ' + name);
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  TEMPL[name] = g;
  return g;
}

// ---------------------------------------------------------------- Builder
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _lm = new THREE.Matrix4(), _full = new THREE.Matrix4(), _nm = new THREE.Matrix3();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _ax = new THREE.Vector3(), _az = new THREE.Vector3();

const CHUNK_ORDER = { far: 2, out: 2, bg: 3, bed: 4 };
const CELL = 64; const NOGRID = { bg: 1, bed: 1 };

export class Builder {
  /**
   * @param ctx  world ctx (THREE, textures …)
   * @param o    { rng, lod: 'near'|'mid'|'far', getMat(key) }
   */
  constructor(ctx, o = {}) {
    this.ctx = ctx; this.rng = o.rng || ctx.rng || Math.random; this.lod = o.lod || 'near';
    this.getMat = o.getMat; this.buckets = new Map(); this.stack = [new THREE.Matrix4()];
    this.objects = []; this.chunk = ''; this.cast = true; this.receive = true; this.grid = !!o.grid;
    this.lamps = [];     // world positions of light sources (lamp heads, porch lights) for night lighting
    this.windows = [];   // window glass centres (for night glows), optional
    this.blockers = [];  // simple AABB footprints {x0,x1,z0,z1} (layout helpers)
  }
  get m() { return this.stack[this.stack.length - 1]; }
  /** push a transform: translate (x,y,z), rotate ry (radians) about Y, uniform/vec scale */
  push(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    _e.set(0, ry, 0); _q.setFromEuler(_e); _p.set(x, y, z);
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    this.stack.push(this.m.clone().multiply(_lm.compose(_p, _q, _s)));
    return this;
  }
  pushMatrix(mat) { this.stack.push(this.m.clone().multiply(mat)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  /** world position of a local point under the current transform */
  world(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.m); }
  worldYaw(ry = 0) { const e = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)).transformDirection(this.m); return Math.atan2(e.x, e.z); }

  _bucket(mat, o) {
    const cast = o.cast !== undefined ? o.cast : this.cast;
    const recv = o.receive !== undefined ? o.receive : this.receive;
    const chunk = o.chunk !== undefined ? o.chunk : this.chunk;
    // spatial cells (CELL units) so three's frustum culling can skip off-screen parts in both passes
    let cell = '';
    if (this.grid && !NOGRID[chunk] && !o.nogrid) { const e = _full.elements; cell = '@' + Math.floor(e[12] / CELL) + ',' + Math.floor(e[14] / CELL); }
    const key = chunk + cell + '|' + mat + '|' + (cast ? 1 : 0) + (recv ? 1 : 0);
    let b = this.buckets.get(key);
    if (!b) { b = { mat, cast, recv, chunk, pos: [], nor: [], uv: [], col: [], idx: [], count: 0 }; this.buckets.set(key, b); }
    return b;
  }

  /**
   * Add a template primitive.
   * @param name   template name (box, cyl12, conef7, prism, plane, …)
   * @param x,y,z  local position (centre of the unit primitive; for prism/wedge: base centre)
   * @param sx,sy,sz scale
   * @param mat    material key
   * @param color  css colour / THREE.Color
   * @param o      { rx, ry, rz, uv:'world'|'unit'|'cyl', uvRect:[u0,v0,u1,v1], uvScale, cast, receive, chunk }
   */
  prim(name, x, y, z, sx, sy, sz, mat, color, o = {}) {
    const g = template(name);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ'); _q.setFromEuler(_e);
    _p.set(x, y, z); _s.set(sx, sy, sz);
    _lm.compose(_p, _q, _s);
    _full.multiplyMatrices(this.m, _lm);
    _nm.getNormalMatrix(_full);
    const b = this._bucket(mat, o);
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array;
    const c = col(color); const vc = o.vcol;
    const mode = o.uv || 'world';
    const rect = o.uvRect; const us = o.uvScale || [1, 1];
    const e = _full.elements;
    _ax.set(e[0], e[1], e[2]).normalize(); _az.set(e[8], e[9], e[10]).normalize();
    const n = P.length / 3;
    const base = b.count;
    for (let i = 0; i < n; i++) {
      _v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(_full);
      _n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix3(_nm).normalize();
      b.pos.push(_v.x, _v.y, _v.z); b.nor.push(_n.x, _n.y, _n.z);
      let u, v;
      if (mode === 'unit') {
        u = U[i * 2]; v = U[i * 2 + 1];
        if (rect) { u = rect[0] + u * (rect[2] - rect[0]); v = rect[1] + v * (rect[3] - rect[1]); }
      } else if (mode === 'cyl') {
        u = U[i * 2] * us[0]; v = U[i * 2 + 1] * us[1];
      } else {
        const ny = _n.y;
        if (ny > 0.9 || ny < -0.9) { u = _v.x * _ax.x + _v.y * _ax.y + _v.z * _ax.z; v = _v.x * _az.x + _v.y * _az.y + _v.z * _az.z; }
        else {
          let tx = _n.z, tz = -_n.x; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
          u = _v.x * tx + _v.z * tz;
          if (ny > -0.12 && ny < 0.12) v = _v.y;
          else { // slope: v axis = n x t, with t=(tx,0,tz) → (ny*tz, nz*tx - nx*tz, -ny*tx)
            v = _v.x * (_n.y * tz) + _v.y * (_n.z * tx - _n.x * tz) - _v.z * (_n.y * tx);
          }
        }
        u *= us[0]; v *= us[1];
        if (o.uvOff) { u += o.uvOff[0]; v += o.uvOff[1]; }
      }
      b.uv.push(u, v);
      if (vc) { const k = vc(_v, i); b.col.push(k.r, k.g, k.b); } else b.col.push(c.r, c.g, c.b);
    }
    if (g.index) { const I = g.index.array; for (let k = 0; k < I.length; k++) b.idx.push(base + I[k]); }
    else for (let k = 0; k < n; k++) b.idx.push(base + k);
    b.count += n;
    return this;
  }
  // ---- convenience shapes (all positions are the CENTRE except where noted)
  box(w, h, d, x, y, z, mat, color, o) { return this.prim('box', x, y, z, w, h, d, mat, color, o); }
  /** box whose bottom sits at y (centre x,z) */
  boxB(w, h, d, x, y, z, mat, color, o) { return this.prim('box', x, y + h / 2, z, w, h, d, mat, color, o); }
  /** cylinder with base at y */
  cyl(r, h, x, y, z, mat, color, seg = 10, o = {}) { return this.prim('cyl' + seg, x, y + h / 2, z, r, h, r, mat, color, { uv: 'cyl', uvScale: [Math.PI * 2 * r, h], ...o }); }
  cylf(r, h, x, y, z, mat, color, seg = 6, o = {}) { return this.prim('cylf' + seg, x, y + h / 2, z, r, h, r, mat, color, { uv: 'cyl', uvScale: [Math.PI * 2 * r, h], ...o }); }
  cone(r, h, x, y, z, mat, color, seg = 8, flat = true, o = {}) { return this.prim((flat ? 'conef' : 'cone') + seg, x, y + h / 2, z, r, h, r, mat, color, o); }
  sphere(r, x, y, z, mat, color, seg = 12, o = {}) { return this.prim('sph' + seg, x, y, z, r, r, r, mat, color, o); }
  blob(r, x, y, z, mat, color, o = {}) { return this.prim(o.detail === 1 || (o.detail === undefined && r > 2.2 && this.lod === 'near') ? 'ico1' : 'ico0', x, y, z, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1), mat, color, o); }
  /** triangular prism: base width w (x), height h (y, apex at top), depth d (z); base at y */
  prism(w, h, d, x, y, z, mat, color, o) { return this.prim('prism', x, y, z, w, h, d, mat, color, o); }
  /** vertical quad facing +Z (local), centre */
  quad(w, h, x, y, z, mat, color, o = {}) { return this.prim('plane', x, y, z, w, h, 1, mat, color, { uv: 'unit', ...o }); }
  /** flat horizontal quad facing up */
  flat(w, d, x, y, z, mat, color, o = {}) { return this.prim('plane', x, y, z, w, d, 1, mat, color, { rx: -Math.PI / 2, ...o }); }
  /** thin box between two points (x0,y0,z0)-(x1,y1,z1) with square section t (rails, beams, rafters) */
  beam(x0, y0, z0, x1, y1, z1, t, mat, color, o = {}) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0; const L = Math.hypot(dx, dy, dz);
    const ry = Math.atan2(dx, dz); const rx = -Math.atan2(dy, Math.hypot(dx, dz));
    return this.prim('box', (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, t, o.th || t, L, mat, color, { ...o, rx, ry, order: 'YXZ' });
  }
  /** attach an arbitrary Object3D (light, special mesh) at local transform */
  object(obj, x = 0, y = 0, z = 0, ry = 0) {
    obj.position.set(x, y, z); obj.rotation.y = ry; obj.updateMatrix();
    obj.matrix.premultiply(this.m); obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
    this.objects.push(obj); return obj;
  }
  lamp(x, y, z, kind = 'post') { const p = this.world(x, y, z); this.lamps.push({ x: p.x, y: p.y, z: p.z, kind }); }

  /** merge everything into a Group (one Mesh per bucket) */
  build(name = 'world') {
    const group = new THREE.Group(); group.name = name;
    for (const [key, b] of this.buckets) {
      if (!b.count) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, this.getMat(b.mat));
      mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.name = key;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      // front-to-back-ish ordering so early-z rejects hidden ground/backdrop pixels (big win in SwiftShader)
      mesh.renderOrder = (mesh.material.userData.def?.order || 0) + (CHUNK_ORDER[b.chunk] || 0);
      if (mesh.material.transparent) mesh.renderOrder = 20;
      group.add(mesh);
    }
    for (const o of this.objects) group.add(o);
    return group;
  }
}
