// World module — set (location) compositions. Every set is built from the props library into one
// Builder (merged by material). Conventions: main action near the origin, main camera side = +Z,
// background toward −Z. Marks yaw = direction an actor faces when facing "camera".
import * as THREE from 'three';
import { Builder, makeRng, pick, range, shade } from './core.js';
import { getMat } from './materials.js';
import { P } from './props.js';
import { HOUSE_COLORS, SHUTTER_COLORS, DOOR_COLORS } from './house.js';
import { createWaterSurface, createRipples } from './water.js';

export const V = (x, y, z) => ({ x, y, z });
export const M = (x, y, z, yaw = 0) => ({ x, y, z, yaw });
export const H = (pos, target, fov) => ({ pos, target, fov });

// ------------------------------------------------------------------ shared layout pieces
export function ground(b, x0, x1, z0, z1, mat = 'grass', color = '#ffffff', y = 0) {
  b.boxB(x1 - x0, 1, z1 - z0, (x0 + x1) / 2, y - 1, (z0 + z1) / 2, mat, color, { cast: false });
}
export function at(b, x, y, z, ry, fn, o) { b.push(x, y, z, ry); const r = fn(b, o || {}); b.pop(); return r; }
export function backdropHills(b, cx, cz, r0 = 430, n = 22, o = {}) {
  // two rings: green wooded hills, then hazy blue-grey mountains (far shore look of the reference)
  const r = b.rng; const keepChunk = b.chunk, keepCast = b.cast, keepRecv = b.receive; b.chunk = 'bg'; b.cast = false; b.receive = false;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2; if (o.skip && o.skip(a)) continue;
    const R = r0 - 60 + r() * 60;
    b.prim('ico1', cx + Math.sin(a) * R, -10, cz + Math.cos(a) * R, range(r, 60, 100), range(r, 22, 42), range(r, 40, 70), 'foliage', pick(r, o.near || ['#4d7a45', '#557f4a', '#4a7050']), { ry: r() * 6 });
    const R2 = r0 + 160 + r() * 140; const a2 = a + 0.13;
    b.prim('ico1', cx + Math.sin(a2) * R2, -20, cz + Math.cos(a2) * R2, range(r, 90, 150), range(r, 50, 95), range(r, 60, 100), 'foliage', pick(r, o.far || ['#62788a', '#6a7a8c', '#5e7286']), { ry: r() * 6 });
  }
  b.chunk = keepChunk; b.cast = keepCast; b.receive = keepRecv;
}
export function treeAt(b, x, z, o = {}) { const k = o.kind || (b.rng() < 0.55 ? 'tree_pine' : 'tree_round'); at(b, x, o.y || 0, z, b.rng() * 6, P[k], o); }

/** plan the houses of a row so the front (porch steps) lands on zFront */
export function housePlan(r, i) {
  const style = pick(r, ['side', 'front', 'tower', 'side', 'front']);
  const W = style === 'side' ? range(r, 30, 33) : range(r, 25, 28); const D = style === 'side' ? range(r, 22, 24) : range(r, 26, 29);
  return { style, width: W, depth: D, color: HOUSE_COLORS[(i * 5 + Math.floor(r() * 3)) % HOUSE_COLORS.length], shutter: pick(r, SHUTTER_COLORS), door: pick(r, DOOR_COLORS), doorX: style === 'side' ? 0 : (W / 2 - 6.5) * (r() < 0.5 ? -1 : 1), floors: r() < 0.12 ? 3 : 2 };
}
/** a house + its front yard (path, bushes, fence, mailbox); front steps at local z=0 facing +Z */
export function lot(b, plan, o = {}) {
  const r = b.rng; const frontZ = plan.depth / 2 + 7.5 + 3.2;
  b.push(0, 0, -frontZ, 0); const info = P.house_victorian(b, plan); b.pop();
  const yard = o.yard ?? 8; const dx = plan.doorX;
  b.boxB(5.5, 0.12, yard, dx, 0, yard / 2 - 0.3, 'concrete', '#d4d1ca', { cast: false });
  if (b.lod !== 'far') {
    const pw = plan.width + 0.6; const zf = -3.2 - 0.6;
    for (let x = -pw / 2 + 1.5; x < pw / 2 - 1; x += 2.6) if (Math.abs(x - dx) > 4.6) at(b, x, 0, zf + 1.4, 0, P.bush, { size: 1.15, blobs: 1, flowers: r() < 0.7 });
    if (o.fence !== false && r() < 0.6) { const L = (plan.width + 8) / 2 - 3.5; for (const s of [-1, 1]) at(b, dx + s * (3.5 + L / 2), 0, yard - 0.8, 0, P.fence, { length: L }); }
    if (o.mailbox !== false) at(b, dx + 8, 0, yard - 0.6, 0, P.mailbox, { color: pick(r, ['#1f2b46', '#202020', '#7a2a2a']) });
    if (r() < 0.5) at(b, (r() < 0.5 ? -1 : 1) * (plan.width / 2 - 3), 0, 3, 0, P.flowerbed, { width: 6, depth: 2.2 });
  } else at(b, -plan.width / 2 + 3, 0, 1, 0, P.bush, { size: 1.6, blobs: 2, flowers: false });
  return { ...info, frontZ };
}

/**
 * One side of the lakeside town in a local frame: water edge at z=0, land toward −z, houses face +z.
 * Strips: lawn (0..-7) | sidewalk (-7..-11) | road (-11..-27) | sidewalk (-27..-31) | yards | houses (front at -39).
 */
export function shoreSide(b, o) {
  const r = b.rng; const half = o.half || 200; const docks = o.docks || [0]; const pitch = o.pitch || 44;
  const lodFor = o.lodFor || (() => b.lod);
  ground(b, -half - 40, half + 40, -230, 0);
  if (o.edge === 'beach') {
    b.boxB(2 * half + 80, 0.6, 14, 0, -0.6, -4, 'sand', '#ffffff', { cast: false });
  } else {
    b.boxB(2 * half + 80, 9.4, 1.4, 0, -9.2, -0.5, 'concrete', '#b8b5ad', { cast: false });
  }
  const nearDock = (x, w = 8) => docks.some((d) => Math.abs(x - d) < w);
  // lawn furniture
  if (o.edge !== 'beach') for (let x = -half + 6; x <= half; x += 22) {
    if (!nearDock(x, 10)) at(b, x, 0, -3.2, 0, P.bench, {});
    if (!nearDock(x + 11, 12) && b.lod !== 'far') at(b, x + 11, 0, -4.2, 0, P.planter, {});
  }
  for (let x = -half + 12; x <= half; x += 24) { const xx = nearDock(x, 7) ? x + 9 : x; at(b, xx, 0, -6.4, 0, P.lamp_post, {}); }
  at(b, 0, 0, -9, 0, P.sidewalk, { length: 2 * half + 80, width: 4 });
  at(b, 0, 0, -19, 0, P.road_segment, { length: 2 * half + 80, width: 16 });
  for (const d of docks) at(b, d, 0, -19, 0, P.crosswalk, { width: 16, length: 6 });
  at(b, 0, 0, -29, Math.PI, P.sidewalk, { length: 2 * half + 80, width: 4 });
  // houses
  const infos = [];
  let i = 0;
  for (let x = -half + 24; x <= half - 20; x += pitch, i++) {
    const keep = b.lod; b.lod = lodFor(x);
    if (o.church !== undefined && Math.abs(x - o.church) < pitch / 2) {
      b.push(x, 0, -39 - 30, 0); const ci = P.church(b, {}); b.pop(); infos.push({ church: true, x, z: -39, info: ci });
      b.boxB(7, 0.12, 9, x, 0, -34.5, 'concrete', '#d4d1ca', { cast: false });
    } else {
      const plan = housePlan(r, i + (o.seedShift || 0));
      b.push(x, 0, -39, 0); const info = lot(b, plan, {}); b.pop();
      infos.push({ x, z: -39, info, plan });
    }
    if (b.lod !== 'far' || i % 2 === 0) treeAt(b, x + pitch / 2 + range(r, -2, 2), -46 - r() * 8, {});
    treeAt(b, x + range(r, -10, 10), -100 - r() * 12, { kind: 'tree_pine', height: range(r, 18, 26) });
    b.lod = keep;
  }
  for (let k = 0; k < (b.lod === 'far' ? 10 : 18); k++) treeAt(b, range(r, -half, half), -118 - r() * 60, { kind: 'tree_pine', height: range(r, 18, 28) });
  // docks
  for (const d of docks) {
    const L = o.dockLen || 24;
    b.push(d, 0, L / 2 - 0.5, 0); P.dock_section(b, { length: L, width: 12, rails: o.rails === false ? null : undefined, depth: 9 }); b.pop();
    b.push(d, 0, L - 0.5 + 4, 0); P.dock_section(b, { length: 8, width: 24, depth: 9 }); b.pop();
    for (const s of [-1, 1]) { b.push(d + s * (5.6), 0, 6, s > 0 ? Math.PI / 2 : -Math.PI / 2); P.rail_fence(b, { length: 11 }); b.pop(); }
    if (b.lod !== 'far') {
      at(b, d - 8.5, 0, L + 2.5, 0, P.bench, {}); at(b, d + 8.5, 0, L + 2.5, 0, P.bench, {});
      at(b, d + 7.2, 0, -1.6, 0, P.lifebuoy, {});
    }
  }
  if (o.gazebo !== undefined) {
    const gx = o.gazebo; b.prim('cylf12', gx, -0.5, 6, 12, 1.0, 10, 'grass', '#ffffff', { cast: false });
    b.prim('cylf12', gx, -5, 6, 12.4, 9, 10.4, 'concrete', '#b8b5ad', { cast: false });
    at(b, gx, 0, 7, 0, P.gazebo, { radius: 6.5 });
  }
  if (o.boats && false) for (const bx of o.boats) at(b, bx, -1.5, 9 + r() * 6, r() * 0.6 - 0.3 + Math.PI / 2, P.boat, {});
  return infos;
}

/** the whole lake town. Lake along X, near shore at z<-8, far shore at z>W-8. */
function lakeTown(b, ctx, o = {}) {
  const W = o.width || 120; const half = o.half || 210; const wl = -1.5;
  b.chunk = 'near'; b.lod = 'near';
  b.push(0, 0, -8, 0);
  const near = shoreSide(b, { half, docks: o.docks || [0], church: o.nearChurch ?? -176, gazebo: o.nearGazebo, boats: [-30, 46], edge: o.edge, lodFor: (x) => (Math.abs(x) < 60 ? 'near' : 'mid'), seedShift: 0 });
  b.pop();
  b.chunk = 'far'; b.lod = 'far'; b.cast = false; b.receive = false;
  b.push(0, 0, W - 8, Math.PI);
  const far = shoreSide(b, { half, docks: [0, -110], church: o.farChurch ?? 88, gazebo: -40, seedShift: 3 });
  b.pop();
  b.cast = true; b.receive = true; b.lod = 'near'; b.chunk = 'near';
  // lake bed + lake ends
  b.chunk = 'bed'; b.cast = false;
  b.boxB(2 * half + 300, 1, W + 4, 0, -10.5, W / 2 - 8, 'bed', '#3d6f86', { cast: false, receive: false });
  b.lod = 'far';
  for (const s of [-1, 1]) {
    ground(b, s > 0 ? half + 20 : -half - 280, s > 0 ? half + 280 : -half - 20, -10, W);
    for (let k = 0; k < 16; k++) treeAt(b, s * (half + 30 + b.rng() * 160), range(b.rng, -5, W - 15), { kind: 'tree_pine', height: range(b.rng, 16, 26) });
  }
  b.cast = true; b.chunk = 'near'; b.lod = 'near';
  backdropHills(b, 0, W / 2, 470);
  const water = createWaterSurface(ctx, { x0: -half - 30, x1: half + 30, z0: -8.6, z1: W - 7.4, level: wl });
  return { near, far, water, waterLevel: wl, W };
}

export function slots(list) { return list.map(([x, y, z, yaw]) => M(x, y, z, yaw || 0)); }
export function rowSlots(x0, x1, step, z, yaw = 0, y = 0, skip = () => false) { const out = []; for (let x = x0; x <= x1 + 1e-6; x += step) if (!skip(x)) out.push(M(+x.toFixed(2), y, z, yaw)); return out; }
export function gridSlots(x0, x1, z0, z1, n, yaw = 0, y = 0, skip = () => false) {
  const out = []; const cols = Math.ceil(Math.sqrt(n * (x1 - x0) / (z1 - z0)));
  const rows = Math.ceil(n / cols);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = x0 + (i + 0.5) * (x1 - x0) / cols, z = z0 + (j + 0.5) * (z1 - z0) / rows; if (!skip(x, z)) out.push(M(+x.toFixed(2), y, +z.toFixed(2), yaw)); }
  return out;
}
/** transform marks/pois/hints by a rotation about Y then translation (for re-oriented sets) */
function xfPoint(p, rot, dx = 0, dz = 0) { const c = Math.cos(rot), s = Math.sin(rot); return { ...p, x: p.x * c + p.z * s + dx, z: -p.x * s + p.z * c + dz, yaw: p.yaw !== undefined ? p.yaw + rot : undefined }; }

// ------------------------------------------------------------------ outdoor sets
function lakeCommon(ctx, b, id, o) {
  const town = lakeTown(b, ctx, o);
  const wl = town.waterLevel; const W = town.W;
  const house = town.near.find((h) => Math.abs(h.x) < 1) || town.near[4];
  const fz = house ? -8 - 39 : -47; const hd = house?.info || {};
  const church = town.far.find((h) => h.church);
  const crowd = [
    ...slots([[-4, 0, -1], [4, 0, -1.5], [-2, 0, -4.5], [2.5, 0, -5], [-4.2, 0, -7], [4.2, 0, -7.5]]),
    ...rowSlots(-46, 46, 3.4, -10.5, 0, 0, (x) => Math.abs(x) < 8.5),
    ...slots([[-8.5, 0, 22], [-4.5, 0, 23], [4.5, 0, 23], [8.5, 0, 22]]),
  ];
  const far = [...rowSlots(-4.5, 4.5, 3, W - 8 - 12, Math.PI), ...rowSlots(-40, 40, 3.5, W - 8 + 2.5, Math.PI, 0, (x) => Math.abs(x) < 8.5)];
  const shore = rowSlots(-60, 60, 3.2, -10.5, 0, 0, (x) => Math.abs(x) < 8.5);
  return {
    town, wl, W,
    marks: { A: M(0, 0, 5), B: M(3.2, 0, 3.4), C: M(-3.2, 0, 3.4), D: M(0, 0, 9.5), E: M(-2, 0, -2), bench1: M(-8.5, 0, 26.5 + 0.2, 0), bench2: M(8.5, 0, 26.7, 0), shore1: M(-14, 0, -10.5), shore2: M(14, 0, -10.5), road: M(0, 0, -27), crowd, far, shore },
    pois: { lake: V(0, wl, 45), across: V(0, 4, W - 8 - 14), far_dock: V(0, 0, W - 8 - 14), dock: V(0, 0, 8), dock_end: V(0, 0, 26), shore: V(0, 0, -10), road: V(0, 0, -27), house: V(house?.x || 0, 14, fz - (hd.d || 26) / 2 - 11), door: V((house?.x || 0) + (house?.plan?.doorX || 0), 2, fz - 3), window: V(house?.x || 0, 16, fz - 10.5), church: church ? V(church.x * -1, 20, W - 8 + 39 + 25) : V(-88, 20, W + 60), water: V(0, wl, 18), bench: V(8.5, 0, 26.5), lifebuoy: V(7.2, 4.6, -9.6) },
  };
}

export const SET_BUILDERS = {
  lake_dock(ctx, b) {
    const c = lakeCommon(ctx, b, 'lake_dock', {});
    return { ...c, waterLevel: c.wl, extra: [c.town.water],
      cameraHints: { establishing: H([0, 10, 64], [0, 9, -30], 40), aerial: H([70, 85, 115], [0, 0, -10], 45), wide: H([0, 5.5, 24], [0, 4, 0], 50),
        across: H([0, 6, 8], [0, 6, c.W], 30), reverse: H([0, 6, -14], [0, 4, 8], 50), low: H([0, 1.2, 20], [0, 5, 0], 50) },
      shadow: { center: [0, 0, -18], radius: 72 }, lightFocus: [0, 0, 0] };
  },
  lake_far_shore(ctx, b) {
    const c = lakeCommon(ctx, b, 'lake_far_shore', { nearChurch: 132, nearGazebo: 44 });
    return { ...c, waterLevel: c.wl, extra: [c.town.water],
      pois: { ...c.pois, across: V(0, 4, c.W - 22), viewer: V(0, 6, c.W - 22) },
      cameraHints: { establishing: H([0, 8, c.W - 20], [0, 9, -16], 26), aerial: H([-60, 80, 110], [0, 0, -10], 45), wide: H([0, 6, 70], [0, 6, -6], 24),
        binoculars: H([0, 7, c.W - 20], [0, 4, 4], 8), across: H([0, 6, 8], [0, 6, c.W], 30) },
      shadow: { center: [0, 0, -18], radius: 72 }, lightFocus: [0, 0, 0] };
  },
  lake_aerial(ctx, b) {
    // same town, rotated so the lake runs along Z (camera side +Z looks down the lake's length)
    const rot = Math.PI / 2; b.push(0, 0, 0, rot);
    const c = lakeCommon(ctx, b, 'lake_aerial', { nearChurch: -88, nearGazebo: 110 });
    b.pop();
    c.town.water.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot); c.town.water.rotation.y = rot;
    const xm = (m) => (Array.isArray(m) ? m.map((q) => xfPoint(q, rot)) : xfPoint(m, rot));
    const marks = {}; for (const k in c.marks) marks[k] = xm(c.marks[k]);
    const pois = {}; for (const k in c.pois) pois[k] = xfPoint(c.pois[k], rot);
    const mid = xfPoint(V(0, 0, c.W / 2 - 8), rot);
    return { ...c, marks, pois, waterLevel: c.wl, extra: [c.town.water],
      cameraHints: { establishing: H([mid.x, 70, 230], [mid.x, 0, 20], 45), aerial: H([mid.x, 95, 245], [mid.x, -10, 0], 42), wide: H([mid.x - 10, 45, 120], [mid.x, 0, -20], 50),
        top: H([mid.x, 260, 1], [mid.x, 0, 0], 50) },
      shadow: { center: [mid.x, 0, 0], radius: 130 }, lightFocus: [mid.x, 0, 0] };
  },
  street(ctx, b) {
    // lakeside street seen from the road: origin on the house-side sidewalk, houses toward −Z,
    // road (z≈2..18) and the lake-side lawn/lake behind the camera; church down the street at x≈-44
    const dx = 54, dz = 37; b.push(dx, 0, dz, 0);
    const town = lakeTown(b, ctx, { nearChurch: -176 });
    b.pop(); town.water.position.x += dx; town.water.position.z += dz;
    const crowd = [...rowSlots(-40, 40, 3.4, 0.4, 0, 0.35, (x) => Math.abs(x) < 6 || Math.abs(x - 8) < 1.5), ...rowSlots(-24, 24, 3.4, 20.2, Math.PI, 0.35)];
    const house = town.near.find((h) => Math.abs(h.x + dx) < 1);
    return { waterLevel: town.waterLevel, extra: [town.water],
      marks: { A: M(0, 0.35, 0.6), B: M(3.4, 0.35, 0.2), C: M(-3.4, 0.35, 0.2), D: M(0, 0, 5), crossing: M(dx, 0, 10), lake_side: M(0, 0.35, 20.2), crowd },
      pois: { road: V(0, 0, 10), crosswalk: V(dx, 0, 10), house: V(0, 14, -35), door: V(house?.plan?.doorX || 0, 2, -12), church: V(-132, 20, -40), lake: V(0, -1.5, 60), across: V(0, 4, 149), dock: V(dx, 0, 40) },
      cameraHints: { establishing: H([24, 9, 32], [-18, 8, -12], 42), aerial: H([40, 60, 70], [0, 0, -15], 45), wide: H([0, 5, 22], [0, 4.5, -2], 50), along: H([70, 5, 4], [-60, 7, -6], 35), from_house: H([0, 6, -8], [0, 4, 14], 50) },
      shadow: { center: [0, 0, -10], radius: 60 }, lightFocus: [0, 0, 0] };
  },
  house_front(ctx, b) {
    const r = b.rng;
    ground(b, -200, 200, -200, 200);
    at(b, 0, 0, 4, 0, P.sidewalk, { length: 300, width: 5 });
    at(b, 0, 0, 15, 0, P.road_segment, { length: 300, width: 16 });
    at(b, 0, 0, 26, Math.PI, P.sidewalk, { length: 300, width: 5 });
    const plan = { style: 'side', width: 32, depth: 23, color: '#a7c7ea', shutter: '#1f2b46', door: '#b52119', doorX: 0, floors: 2 };
    b.push(0, 0, -10, 0); lot(b, plan, { yard: 11.5, fence: false }); b.pop();
    for (const s of [-1, 1]) { b.lod = 'mid'; b.push(s * 44, 0, -10, 0); lot(b, housePlan(r, s > 0 ? 1 : 4), { yard: 11.5 }); b.pop(); b.lod = 'near'; }
    at(b, -10, 0, -3.5, 0, P.flowerbed, { width: 8, depth: 2.4 }); at(b, 10, 0, -3.5, 0, P.flowerbed, { width: 8, depth: 2.4 });
    treeAt(b, -22, -2, { kind: 'tree_round' }); treeAt(b, 22, -4, { kind: 'tree_pine' }); treeAt(b, 66, 0, {}); treeAt(b, -66, 0, {});
    at(b, -14, 0, 6.2, 0, P.lamp_post, {}); at(b, 30, 0, 6.2, 0, P.lamp_post, {});
    for (let k = 0; k < 6; k++) { b.lod = 'far'; b.push(-110 + k * 44, 0, 40, Math.PI); lot(b, housePlan(r, k + 2), { yard: 10 }); b.pop(); b.lod = 'near'; }
    for (let k = 0; k < 14; k++) treeAt(b, range(r, -160, 160), -60 - r() * 40, { kind: 'tree_pine' });
    backdropHills(b, 0, 0, 430);
    const crowd = [...rowSlots(-24, 24, 3, 3.5, 0, 0.35, (x) => Math.abs(x) < 4), ...rowSlots(-30, -16, 3.5, -1, 0), ...rowSlots(16, 30, 3.5, -1, 0), ...rowSlots(-15, 15, 3.3, 27, Math.PI, 0.35)];
    return { waterLevel: null,
      marks: { A: M(0, 0, -2), B: M(3.4, 0, -2.6), C: M(-3.4, 0, -2.6), D: M(0, 0, -6.5), porch: M(-6, 1.3, -14.5), steps: M(0, 0, -9.6), sidewalk: M(6, 0.35, 3.5), crowd },
      pois: { house: V(0, 14, -32), door: V(0, 4, -18), porch: V(-6, 3, -15), window: V(-8, 15, -22.5), mailbox: V(8, 4, 0.9), road: V(0, 0, 15), garden: V(10, 1, -3.5) },
      cameraHints: { establishing: H([0, 9, 44], [0, 13, -20], 45), aerial: H([30, 55, 60], [0, 5, -15], 45), wide: H([0, 5.5, 20], [0, 4.5, -3], 50), porch: H([6, 5, -2], [-2, 4, -16], 50) },
      shadow: { center: [0, 0, -12], radius: 50 }, lightFocus: [0, 0, -12] };
  },
  church_front(ctx, b) {
    const r = b.rng;
    ground(b, -200, 200, -200, 200);
    at(b, 0, 0, 8, 0, P.sidewalk, { length: 300, width: 5 }); at(b, 0, 0, 19, 0, P.road_segment, { length: 300, width: 16 });
    b.push(0, 0, -44, 0); P.church(b, {}); b.pop();
    b.boxB(8, 0.12, 21, 0, 0, -2, 'concrete', '#d4d1ca', { cast: false });
    for (const s of [-1, 1]) { at(b, s * 6, 0, 5.2, 0, P.lamp_post, {}); at(b, s * 9, 0, -9, 0, P.flowerbed, { width: 6, depth: 2.2 }); treeAt(b, s * 22, -6, { kind: 'tree_round' }); at(b, s * 12, 0, 2, 0, P.bench, {}); }
    for (const s of [-1, 1]) { b.lod = 'mid'; b.push(s * 50, 0, -22, 0); lot(b, housePlan(r, s > 0 ? 2 : 5), { yard: 10 }); b.pop(); b.lod = 'near'; }
    for (let k = 0; k < 12; k++) treeAt(b, range(r, -120, 120), -80 - r() * 40, { kind: 'tree_pine' });
    at(b, 0, 0, 30, Math.PI, P.sidewalk, { length: 300, width: 5 });
    backdropHills(b, 0, 0, 430);
    const crowd = gridSlots(-18, 18, -10, 4, 48, 0, 0, (x) => Math.abs(x) < 4.5);
    return { waterLevel: null,
      marks: { A: M(0, 0, 1), B: M(3.4, 0, 0.3), C: M(-3.4, 0, 0.3), D: M(0, 0, -4), steps: M(0, 1.4, -13.5), crowd },
      pois: { church: V(0, 20, -40), door: V(0, 4, -15.5), steeple: V(0, 45, -20), road: V(0, 0, 19), bench: V(12, 1, 2) },
      cameraHints: { establishing: H([0, 6, 52], [0, 22, -20], 48), aerial: H([40, 60, 70], [0, 10, -25], 45), wide: H([0, 5, 22], [0, 5, -2], 50), low: H([0, 1.5, 14], [0, 18, -20], 55) },
      shadow: { center: [0, 0, -14], radius: 55 }, lightFocus: [0, 0, -5] };
  },
  park(ctx, b) {
    const r = b.rng;
    ground(b, -250, 250, -250, 250);
    b.boxB(300, 0.12, 4.5, 0, 0, 3, 'concrete', '#d4d1ca', { cast: false });
    b.boxB(4.5, 0.12, 22, 0, 0, -9, 'concrete', '#d4d1ca', { cast: false });
    at(b, 0, 0, -26, 0, P.gazebo, { radius: 7 });
    for (const s of [-1, 1]) { at(b, s * 10, 0, 0, 0, P.bench, {}); at(b, s * 6, 0, 6.2, 0, P.lamp_post, {}); at(b, s * 6, 0, -12, 0, P.flowerbed, { width: 5, depth: 3 }); at(b, s * 28, 0, 0.8, 0, P.lamp_post, {}); }
    at(b, 22, 0, -10, 0.4, P.picnic_table, {}); at(b, -24, 0, -14, -0.3, P.picnic_table, {});
    const tpos = [[-18, -30], [18, -32], [-34, -8], [36, -14], [-46, -40], [44, -44], [-12, -52], [14, -58], [-60, -20], [62, -26], [-30, 22], [32, 24], [0, -70], [-70, -60], [70, -64]];
    for (const [x, z] of tpos) treeAt(b, x + range(r, -2, 2), z + range(r, -2, 2), {});
    for (let k = 0; k < 10; k++) at(b, range(r, -50, 50), 0, range(r, -50, -15), 0, P.bush, {});
    // pond/lake beyond the park with far houses
    for (let k = 0; k < 7; k++) { b.lod = 'far'; b.push(-150 + k * 50, 0, -150, 0); lot(b, housePlan(r, k), { yard: 8 }); b.pop(); b.lod = 'near'; }
    backdropHills(b, 0, 0, 430);
    const crowd = gridSlots(-20, 20, -6, 10, 40, 0, 0, (x, z) => Math.abs(x) < 4 && z < 4 || (Math.abs(Math.abs(x) - 10) < 3.5 && Math.abs(z) < 2));
    return { waterLevel: null,
      marks: { A: M(0, 0, 2.5), B: M(3.4, 0, 2), C: M(-3.4, 0, 2), D: M(0, 0, -3), gazebo: M(0, 1.2, -24), bench1: M(-10, 0, 0.6), bench2: M(10, 0, 0.6), crowd },
      pois: { gazebo: V(0, 5, -26), path: V(0, 0, 3), bench: V(10, 1, 0), trees: V(-34, 8, -8), lamp: V(6, 9, 6) },
      cameraHints: { establishing: H([0, 7, 34], [0, 6.5, -18], 45), aerial: H([40, 70, 70], [0, 0, -15], 45), wide: H([0, 5, 22], [0, 4.5, -2], 50) },
      shadow: { center: [0, 0, -12], radius: 55 }, lightFocus: [0, 0, 0] };
  },
  forest_edge(ctx, b) {
    const r = b.rng;
    ground(b, -250, 250, -250, 250);
    b.boxB(5, 0.08, 120, 1, 0, -55, 'dirt', '#ffffff', { cast: false });
    for (let k = 0; k < 140; k++) {
      const z = -14 - Math.pow(r(), 0.7) * 150, x = range(r, -110, 110);
      if (Math.abs(x - 1) < 5 + (z < -40 ? 0 : 2)) continue;
      b.lod = z < -70 ? 'far' : 'near'; treeAt(b, x, z, { kind: r() < 0.75 ? 'tree_pine' : 'tree_round', height: range(r, 16, 28) });
    }
    b.lod = 'near';
    for (let k = 0; k < 16; k++) at(b, range(r, -40, 40), 0, range(r, -16, -8), 0, P.bush, { flowers: false });
    for (let k = 0; k < 10; k++) { const x = range(r, -30, 30), z = range(r, -14, 14); if (Math.abs(x) < 9 && z > -8) continue; at(b, x, 0, z, 0, P.rock, {}); }
    for (let k = 0; k < 6; k++) treeAt(b, (k % 2 ? 1 : -1) * range(r, 25, 60), range(r, 20, 60), {});
    b.push(-14, 0, -9, 0); P.rail_fence(b, { length: 18, color: '#8a6a4a' }); b.pop(); b.push(16, 0, -9, 0); P.rail_fence(b, { length: 18, color: '#8a6a4a' }); b.pop();
    at(b, 6, 0, -6, -0.3, P.sign_board, { text: 'WOODS', width: 4, height: 1.8, colors: ['#2a4a2a'], bg: '#c8a878', underline: false });
    backdropHills(b, 0, -60, 380);
    const crowd = gridSlots(-22, 22, -4, 12, 40, 0, 0, (x) => Math.abs(x - 1) < 3);
    return { waterLevel: null,
      marks: { A: M(0, 0, 2), B: M(3.4, 0, 1.4), C: M(-3.4, 0, 1.4), D: M(1, 0, -4), path: M(1, 0, -14), crowd },
      pois: { forest: V(0, 6, -40), path: V(1, 0, -30), sign: V(6, 3, -6), trees: V(-12, 8, -20) },
      cameraHints: { establishing: H([0, 8, 46], [0, 9, -30], 45), aerial: H([30, 60, 60], [0, 0, -30], 45), wide: H([0, 5, 22], [0, 5, -4], 50) },
      shadow: { center: [0, 0, -14], radius: 55 }, lightFocus: [0, 0, 0] };
  },
  road_night(ctx, b) {
    const r = b.rng;
    ground(b, -250, 250, -500, 120);
    // road along Z
    b.push(0, 0, -180, Math.PI / 2); P.road_segment(b, { length: 600, width: 16 }); b.pop();
    for (const s of [-1, 1]) { b.push(s * 10, 0, -180, s > 0 ? -Math.PI / 2 : Math.PI / 2); P.sidewalk(b, { length: 600, width: 4 }); b.pop(); }
    at(b, 0, 0, -22, Math.PI / 2, P.crosswalk, { width: 16, length: 6 });
    let i = 0;
    for (let z = 60; z > -420; z -= 40, i++) {
      b.lod = z < -120 ? 'far' : z < -20 ? 'mid' : 'near'; b.chunk = z < -100 ? 'far' : '';
      b.push(-20, 0, z, Math.PI / 2); lot(b, housePlan(r, i), { yard: 8 }); b.pop();
      if (i % 2 === 0) { b.push(20, 0, z - 20, -Math.PI / 2); lot(b, housePlan(r, i + 3), { yard: 8 }); b.pop(); }
      else treeAt(b, 26, z - 20, {});
    }
    b.lod = 'near';
    for (let z = 40; z > -420; z -= 30) { b.chunk = z < -100 ? 'far' : ''; at(b, -9.5, 0, z, 0, P.lamp_post, {}); at(b, 9.5, 0, z - 15, 0, P.lamp_post, {}); }
    b.chunk = '';
    backdropHills(b, 0, -200, 420);
    const crowd = [...rowSlots(-20, 20, 4, 9.8, Math.PI / 2, 0.35).map((m) => M(10.5, 0.35, m.x * 0.9, 0)), ...rowSlots(-20, 20, 4, -9.8, 0, 0.35).map((m) => M(-10.5, 0.35, m.x * 0.9, 0))];
    while (crowd.length < 30) crowd.push(M(crowd.length % 2 ? 11.5 : -11.5, 0.35, -24 - crowd.length * 2, 0));
    return { waterLevel: null,
      marks: { A: M(2, 0, 0), B: M(5.4, 0, 0.6), C: M(-1.4, 0, 0.6), D: M(2, 0, -4), sidewalk: M(-10.5, 0.35, 2), crowd },
      pois: { road: V(0, 0, -120), horizon: V(0, 5, -400), house: V(-40, 10, 0), lamp: V(-9.5, 9, 10), door: V(-30, 3, 0) },
      cameraHints: { establishing: H([3, 6, 30], [0, 4, -120], 45), aerial: H([30, 50, 50], [0, 0, -60], 45), wide: H([2, 5, 22], [1, 4, -4], 50), sidewalk: H([-11, 5, 24], [-4, 4, -40], 45) },
      shadow: { center: [0, 0, -15], radius: 55 }, lightFocus: [0, 0, 0] };
  },
  shore_water(ctx, b) {
    // beach shore: waterline at z=0, land toward −Z, water (camera side) toward +Z
    const dz = 6; b.push(0, 0, -dz, 0);
    const town = lakeTown(b, ctx, { edge: 'beach', docks: [66] });
    b.pop(); town.water.position.z -= dz;
    // beach: dry sand down to the waterline (z≈-3), then the bed drops steeply so wading legs show through the water
    b.chunk = 'near';
    b.prim('box', 0, -1.15, -6.5, 500, 1, 9, 'sand', '#ffffff', { rx: 0.16, cast: false });
    b.prim('box', 0, -4.6, 1.2, 500, 1, 8.5, 'sand', '#d8cca6', { rx: 0.62, cast: false });
    b.boxB(500, 1, 60, 0, -8.6, 34, 'sand', '#b9b08e', { cast: false });
    const wl = town.waterLevel; const wade = wl - 1.8;
    // marks A–D stand in the water at thigh depth by default (actor depth adds to it); beach marks are dry
    const crowd = rowSlots(-48, 48, 3.2, 3.2, 0, wade, (x) => Math.abs(x) < 7).concat(rowSlots(-30, 30, 3.4, 7.5, 0, wade - 1.2, (x) => Math.abs(x) < 9));
    const beach = rowSlots(-48, 48, 3.2, -6.5, 0, -0.7, (x) => Math.abs(x) < 5);
    return { waterLevel: wl, extra: [town.water],
      marks: { A: M(0, wade, 3.5), B: M(3.2, wade, 3.0), C: M(-3.2, wade, 3.0), D: M(0, wade - 1, 7), deep: M(0, wl - 3.5, 10), beach1: M(0, -0.7, -6.5), beach2: M(3.2, -0.7, -6.5), crowd, beach },
      pois: { lake: V(0, wl, 60), across: V(0, 4, 120 - 14), shore: V(0, 0, -8), house: V(0, 14, -78), road: V(0, 0, -33) },
      cameraHints: { establishing: H([0, 4.5, 50], [0, 7, -30], 42), aerial: H([40, 60, 70], [0, 0, -15], 45), wide: H([0, 2.6, 24], [0, 2.2, 2], 50), low: H([0, -0.6, 16], [0, 2.0, 3], 55) },
      shadow: { center: [0, 0, -20], radius: 70 }, lightFocus: [0, 0, 0] };
  },
  underwater(ctx, b) {
    const r = b.rng; const wl = 0; const bed = -14;
    b.chunk = 'near';
    b.boxB(600, 1, 600, 0, bed - 1, 0, 'sand', '#d8cfa8', { cast: false });
    b.prim('box', 0, bed / 2 - 0.4, -46, 600, 1, 34, 'sand', '#ffffff', { rx: 0.42, cast: false });
    ground(b, -300, 300, -300, -60, 'grass', '#ffffff', 0.2);
    const clear = (x, z) => Math.abs(x) < 9 && z > -9 && z < 8;
    for (let k = 0; k < 30; k++) { const x = range(r, -40, 40), z = range(r, -40, 10); if (!clear(x, z)) at(b, x, bed, z, 0, P.rock, { size: range(r, 0.8, 2.8), color: '#7f8a84' }); }
    for (let k = 0; k < 40; k++) { const x = range(r, -45, 45), z = range(r, -45, 12); if (!clear(x, z)) at(b, x, bed, z, 0, P.seaweed, {}); }
    for (const [x, z] of [[-6, -8], [6, -8], [-6, -20], [6, -20]]) at(b, x, wl + 1.5, z, 0, P.pier_post, { height: 17, below: 15.5 });
    b.boxB(14, 0.6, 18, 0, wl + 1.5, -14, 'planks', '#7a5a40');
    const water = createWaterSurface(ctx, { x0: -300, x1: 300, z0: -60, z1: 300, level: wl });
    const crowd = gridSlots(-16, 16, -12, 6, 36, 0, bed);
    return { waterLevel: wl, extra: [water],
      marks: { A: M(0, bed, 0), B: M(3.4, bed, -0.6), C: M(-3.4, bed, -0.6), D: M(0, bed, -4.5), surface: M(0, wl, 6), crowd },
      pois: { surface: V(0, wl, 0), bed: V(0, bed, 0), dock: V(0, wl, -14), shore: V(0, 0, -60) },
      cameraHints: { establishing: H([0, -9, 26], [0, -10, -10], 55), aerial: H([0, -1.5, 22], [0, -12, 0], 60), wide: H([0, -10, 20], [0, -10.5, -2], 55), up: H([0, -12, 12], [0, 0, -2], 60) },
      shadow: { center: [0, bed, -6], radius: 45 }, lightFocus: [0, bed, 0] };
  },

  // ------------------------------------------------------------------ interiors
  kitchen(ctx, b) {
    const R = room(b, { w: 34, d: 36, h: 13, floor: 'tile', floorColor: '#e3cfa6', wall: 'wallpaper', wallColor: '#efe2c0', backOpen: [{ x: 4, y: 4.6, w: 8, h: 5.2 }], leftOpen: [{ x: 2, y: 3.4, w: 7, h: 6.4 }] });
    const bz = -18 + 1.5 + 0.5;
    at(b, -6, 0, bz, 0, P.kitchen_counter, { length: 14, sink: true, sinkX: 4 - -6 });
    at(b, 10.5, 0, bz + 0.2, 0, P.stove, {}); at(b, 14.5, 0, bz + 0.2, 0, P.fridge, {});
    at(b, 16.5, 0, -2, -Math.PI / 2, P.kitchen_counter, { length: 8, upper: false });
    b.push(4, 0, -18, 0); P.window(b, { width: 8, height: 5.2, y: 7.2, mullionY: 0 }); b.pop();
    b.push(-17, 0, 2, Math.PI / 2); P.window(b, { width: 7, height: 6.4, y: 6.6, curtains: '#f2e8d0' }); b.pop();
    at(b, 0, 0, -1, 0, P.table, { width: 10, depth: 5.5, items: true, color: '#8e5a32' });
    for (const s of [-1, 1]) { at(b, s * 2.6, 0, -4.8, 0, P.chair, { color: '#8e5a32' }); at(b, s * 2.6, 0, 2.8, Math.PI, P.chair, { color: '#8e5a32' }); }
    at(b, -6.4, 0, -1, Math.PI / 2, P.chair, { color: '#8e5a32' });
    for (const s of [-1, 1]) at(b, s * 2.6, 13, -1, 0, P.pendant_lamp, { drop: 4.5, color: '#1f5a5a' });
    b.push(14, 0, -18, 0); P.clock(b, { y: 11 }); b.pop();
    at(b, -13, 0, -15.5, 0, P.potted_plant, {});
    outsideView(b, 'back', 34, 36); outsideView(b, 'left', 34, 36);
    const crowd = gridSlots(-14, 14, -12, 15, 36, 0, 0, (x, z) => Math.abs(x) < 7.5 && z > -7 && z < 5);
    return { interior: true, waterLevel: null,
      marks: { A: M(0, 0, 5.5), B: M(3.0, 0, 5), C: M(-3.0, 0, 5), D: M(-8, 0, -10), seat1: M(-2.6, 0, -4.8, 0), seat2: M(2.6, 0, 2.8, Math.PI), stove: M(10.5, 0, -10, Math.PI), crowd },
      pois: { table: V(0, 3, -1), counter: V(-6, 3.4, -16), stove: V(10.5, 3.5, -15.5), fridge: V(14.5, 6, -15.5), window: V(4, 7, -18), door: V(16.5, 4, 8), lamp: V(0, 8, -1) },
      cameraHints: { establishing: H([14, 10, 17], [-3, 3.5, -8], 58), aerial: H([0, 12.3, 16], [0, 0, -5], 62), wide: H([0.5, 6, 17.3], [0, 3.4, 2], 62), table: H([0, 7, 10], [0, 3, -1], 50) },
      shadow: { center: [0, 0, 0], radius: 22 }, lightFocus: [0, 6, 0], windowLight: [-0.55, 0.55, 0.62] };
  },
  living_room(ctx, b) {
    const R = room(b, { w: 34, d: 36, h: 13, floor: 'floorwood', floorColor: '#9a5a32', wall: 'woodpanel', wallColor: '#d8853e', backWall: 'wallpaper', backColor: '#8f9466', leftOpen: [{ x: -2, y: 3.4, w: 7, h: 6.6 }] });
    at(b, 0, 0, -18, 0, P.fireplace, { width: 10, height: 13 });
    b.push(0, 0, -18 + 2.4, 0); P.picture_frame(b, { width: 6, height: 4, y: 9.2, variant: 0 }); b.pop();
    b.push(-11, 0, -18, 0); P.picture_frame(b, { width: 3, height: 3.6, y: 7, variant: 1 }); b.pop();
    at(b, 0, 0, -3, 0, P.rug, { width: 16, depth: 12 });
    at(b, 8.5, 0, -9, -0.6, P.armchair, { color: '#a3352a' });
    at(b, -9, 0, -8.5, 0.6, P.armchair, { color: '#3f5a3a' });
    at(b, -12.5, 0, 3, Math.PI / 2, P.sofa, { length: 10, color: '#a3352a' });
    at(b, 0, 0, -1.5, 0, P.table, { width: 6, depth: 3.5, height: 1.8, color: '#6a3e22' });
    at(b, 14, 0, -16, 0, P.bookshelf, { width: 5, height: 10 });
    at(b, 12.5, 0, -12.5, 0, P.lamp, {}); at(b, -14.5, 0, -15.5, 0, P.lamp, {});
    at(b, 15.6, 0, 6, -Math.PI / 2, P.tv, {});
    b.push(-17, 0, -2, Math.PI / 2); P.window(b, { width: 7, height: 6.6, y: 6.7, curtains: '#c8742e' }); b.pop();
    outsideView(b, 'left', 34, 36);
    const crowd = gridSlots(-13, 13, -6, 15, 36, 0, 0, (x, z) => Math.abs(x) < 4 && Math.abs(z + 1.5) < 3);
    return { interior: true, waterLevel: null,
      marks: { A: M(0, 0, 4), B: M(3.0, 0, 3.4), C: M(-3.0, 0, 3.4), D: M(-3.5, 0, -11), armchair: M(8.5, 0, -9, -0.6), sofa: M(-12.5, 0, 3, Math.PI / 2), fire: M(4, 0, -12.5, 0), crowd },
      pois: { fireplace: V(0, 2.5, -15), armchair: V(8.5, 2, -9), sofa: V(-12.5, 2, 3), tv: V(15.6, 4.5, 6), window: V(-17, 6.7, -2), picture: V(0, 9.2, -15.5), table: V(0, 1.8, -1.5) },
      cameraHints: { establishing: H([10, 9.5, 16], [-2, 4.5, -10], 56), aerial: H([0, 12.3, 16], [0, 0, -5], 62), wide: H([0.5, 6, 17.3], [0, 3.6, 0], 62), fireplace: H([0, 6, 6], [0, 5, -16], 50) },
      shadow: { center: [0, 0, 0], radius: 22 }, lightFocus: [0, 5, -6], windowLight: [-0.6, 0.5, 0.4] };
  },
  bedroom(ctx, b) {
    room(b, { w: 28, d: 26, h: 12, floor: 'floorwood', floorColor: '#a8774a', wall: 'wallpaper', wallColor: '#b9cbe0', backOpen: [{ x: 0, y: 3.6, w: 9, h: 6.6 }] });
    b.push(0, 0, -13, 0); P.window(b, { width: 9, height: 6.6, y: 6.9, curtains: '#3f5f9a' }); b.pop();
    at(b, -9, 0, 2, Math.PI / 2, P.bed, { color: '#2f4f8f' });
    at(b, -11.5, 0, -5.5, 0, P.nightstand, {}); at(b, -11.5, 2.8, -5.5, 0, P.lamp, { kind: 'table' });
    at(b, 8.5, 0, -10.8, 0, P.table, { width: 6, depth: 3.2, height: 3.2, color: '#7a5030' }); at(b, 10, 3.2, -11.3, 0, P.lamp, { kind: 'table', shade: '#e8d29a' });
    at(b, 8.5, 0, -7.6, Math.PI, P.chair, { color: '#7a5030' });
    at(b, 11.5, 0, 4, -Math.PI / 2, P.bookshelf, { width: 5, height: 8 });
    at(b, 0, 0, 1, 0, P.rug, { width: 10, depth: 7 });
    b.push(-13.4, 0, 2, Math.PI / 2); P.picture_frame(b, { width: 4, height: 3, y: 8.5, variant: 2 }); b.pop();
    // view through the window: the lit town across the lake (lower than the 1st-floor room)
    const keep = b.chunk; b.chunk = 'out'; b.cast = false; b.lod = 'far';
    b.push(0, -14, -40, 0);
    ground(b, -200, 200, -20, 10);
    b.push(0, 0, -100, 0); shoreSide(b, { half: 140, docks: [0], church: -44, seedShift: 5 }); b.pop();
    b.boxB(400, 1, 100, 0, -10.5, -50, 'sand', '#3a5a64', { cast: false });
    b.pop(); b.chunk = keep; b.cast = true; b.lod = 'near';
    backdropHills(b, 0, -150, 420);
    const water = createWaterSurface(ctx, { x0: -250, x1: 250, z0: -142, z1: -48, level: -15.5 });
    const crowd = gridSlots(-8, 10, -6, 10, 36, 0, 0, (x, z) => x < -3.5 && z > -4 && z < 8);
    return { interior: true, waterLevel: null, extra: [water],
      marks: { A: M(0, 0, -9.5), B: M(3.4, 0, -8.5), C: M(-3, 0, -8.5), D: M(2, 0, 4), bed: M(-9, 2.6, 2, Math.PI / 2), desk: M(8.5, 0, -7.6, Math.PI), crowd },
      pois: { window: V(0, 7, -14), across: V(0, -8, -150), bed: V(-9, 2, 2), desk: V(8.5, 3.2, -10.8), door: V(13, 4, 8), lamp: V(-11.5, 4, -5.5) },
      cameraHints: { establishing: H([6, 8, 12], [-1, 4.5, -12], 58), aerial: H([0, 11.3, 12], [0, 0, -4], 62), wide: H([1, 6, 12], [0, 4.5, -9], 58), window: H([1.5, 7.5, -4], [0, 2, -80], 40) },
      shadow: { center: [0, 0, 0], radius: 20 }, lightFocus: [0, 5, -6], windowLight: [0.3, 0.5, -0.8] };
  },
  classroom(ctx, b) {
    room(b, { w: 40, d: 34, h: 13, floor: 'floorwood', floorColor: '#c79a62', wall: 'wallpaper', wallColor: '#e9e1c8', leftOpen: [{ x: -8, y: 3.6, w: 7, h: 6.4 }, { x: 4, y: 3.6, w: 7, h: 6.4 }] });
    b.push(0, 0, -17, 0); P.chalkboard(b, { width: 18, height: 6.5, y: 6.8 }); b.pop();
    at(b, 9, 0, -12, 0, P.table, { width: 7, depth: 3.5, height: 3.2, color: '#8a5a36' });
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) at(b, -10.5 + i * 7, 0, -3 + j * 6.5, 0, P.desk, {});
    for (const x of [-8, 4]) { b.push(-20, 0, x, Math.PI / 2); P.window(b, { width: 7, height: 6.4, y: 6.8 }); b.pop(); }
    at(b, 18, 0, -8, -Math.PI / 2, P.bookshelf, { width: 6, height: 8 });
    b.push(-12, 0, -17, 0); P.clock(b, { y: 11 }); b.pop();
    b.push(19.9, 0, 6, -Math.PI / 2); P.picture_frame(b, { width: 5, height: 4, y: 7, variant: 3 }); b.pop();
    for (const x of [-10, 10]) at(b, x, 13, 0, 0, P.ceiling_light, {});
    outsideView(b, 'left', 40, 34);
    const crowd = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) crowd.push(M(-10.5 + i * 7, 0, -1.6 + j * 6.5, Math.PI));
    crowd.push(...gridSlots(-17, 17, 13, 16, 24, Math.PI));
    return { interior: true, waterLevel: null,
      marks: { A: M(0, 0, -12), B: M(3.4, 0, -12.6), C: M(-3.4, 0, -12.6), D: M(-6, 0, -9), teacher: M(9, 0, -14.5), seats: crowd.slice(0, 12), crowd },
      pois: { board: V(0, 6.8, -17), desk: V(9, 3.2, -12), window: V(-20, 6.8, -2), students: V(0, 3, 4), door: V(18, 4, 10) },
      cameraHints: { establishing: H([14, 10, 16], [-3, 4, -10], 58), aerial: H([0, 12.3, 16], [0, 0, -5], 62), wide: H([0, 6.5, 6], [0, 4, -14], 55), students: H([0, 6, -14], [0, 3, 6], 55) },
      shadow: { center: [0, 0, 0], radius: 25 }, lightFocus: [0, 6, -6], windowLight: [-0.6, 0.6, 0.35] };
  },
};

// ------------------------------------------------------------------ interior helpers
/** room box with wall openings. Walls/ceiling do not cast shadows (window light enters). */
export function room(b, o) {
  const { w, d, h } = o; const T = 1; const keepCast = b.cast; b.cast = false;
  b.boxB(w + 2, 0.6, d + 2, 0, -0.6, 0, o.floor || 'floorwood', o.floorColor || '#9a6a40', { cast: false });
  b.boxB(w + 2, 0.6, d + 2, 0, h, 0, 'plain', o.ceilColor || '#f4efe4', { cast: false });
  const wall = (len, openings, mat, color) => { // local: wall plane at z=0 facing +Z, spans x [-len/2, len/2]
    const ops = (openings || []).slice().sort((a, c) => a.x - c.x); let x = -len / 2;
    const seg = (x0, x1, y0, y1) => { if (x1 - x0 > 0.01 && y1 - y0 > 0.01) b.box(x1 - x0, y1 - y0, T, (x0 + x1) / 2, (y0 + y1) / 2, -T / 2, mat, color); };
    for (const op of ops) { const a = op.x - op.w / 2, c = op.x + op.w / 2; seg(x, a, 0, h); seg(a, c, 0, op.y); seg(a, c, op.y + op.h, h); x = c; }
    seg(x, len / 2, 0, h);
    b.box(len, 0.9, 0.3, 0, 0.45, 0.15, 'satin', o.trim || '#f4f1e8'); b.box(len, 0.6, 0.4, 0, h - 0.3, 0.2, 'satin', o.trim || '#f4f1e8');
  };
  const wm = o.wall || 'wallpaper', wc = o.wallColor || '#efe2c0';
  b.push(0, 0, -d / 2, 0); wall(w, o.backOpen, o.backWall || wm, o.backColor || wc); b.pop();
  b.push(0, 0, d / 2, Math.PI); wall(w, o.frontOpen, wm, wc); b.pop();
  b.push(-w / 2, 0, 0, Math.PI / 2); wall(d, (o.leftOpen || []).map((q) => ({ ...q, x: -q.x })), wm, wc); b.pop();
  b.push(w / 2, 0, 0, -Math.PI / 2); wall(d, o.rightOpen, wm, wc); b.pop();
  b.cast = keepCast;
}
/** a cheap exterior seen through a room's windows (ground, hedge, trees, neighbour house) */
export function outsideView(b, side, w, d) {
  const keep = b.chunk; b.chunk = 'out'; b.cast = false; const lod = b.lod; b.lod = 'far';
  const rot = side === 'back' ? 0 : side === 'left' ? -Math.PI / 2 : Math.PI / 2; const off = side === 'back' ? d / 2 : w / 2;
  b.push(0, 0, 0, rot); b.push(0, 0, -off, 0);
  ground(b, -80, 80, -90, -1, 'grass', '#ffffff', -1.4);
  b.push(0, -1.4, -14, 0); P.fence(b, { length: 70 }); b.pop();
  for (let k = 0; k < 6; k++) treeAt(b, -40 + k * 16 + b.rng() * 4, -24 - b.rng() * 12, { y: -1.4 });
  b.push(0, -1.4, -70, 0); lot(b, housePlan(b.rng, 3), { yard: 6 }); b.pop();
  b.pop(); b.pop(); b.chunk = keep; b.cast = true; b.lod = lod;
}

export const SET_IDS = Object.keys(SET_BUILDERS);
export const INTERIORS = new Set(['kitchen', 'living_room', 'bedroom', 'classroom']);
const RECV_OUTDOOR = new Set(['grass', 'asphalt', 'concrete', 'sand', 'dirt', 'planks', 'stone']);

export function buildSet(ctx, id, opts = {}) {
  const fn = SET_BUILDERS[id] || SET_BUILDERS.lake_dock;
  const rid = SET_BUILDERS[id] ? id : 'lake_dock';
  const rng = makeRng(rid + ':' + (opts.seed ?? 1));
  const interior = INTERIORS.has(rid);
  // outdoors only ground-like surfaces receive shadows (PCF-soft = ~25 taps per fragment in SwiftShader)
  const b = new Builder(ctx, { rng, lod: 'near', grid: true, getMat: (k) => getMat(ctx, k), recvOnly: interior ? null : RECV_OUTDOOR });
  const def = fn(ctx, b, opts);
  // crowd slots: nearest to mark A first, slots between the actors and the camera (+Z side) last
  const A = def.marks.A || { x: 0, z: 0 };
  if (Array.isArray(def.marks.crowd)) def.marks.crowd = def.marks.crowd.map((m, i) => ({ m, i, k: Math.hypot(m.x - A.x, m.z - A.z) + (m.z > A.z + 1.5 && !def.interior ? 1000 : 0) }))
    .sort((p, q) => p.k - q.k || p.i - q.i).map((e) => e.m);
  const group = b.build('set:' + rid);
  for (const e of def.extra || []) group.add(e);
  let ripples = null;
  if (def.waterLevel !== null && def.waterLevel !== undefined) { ripples = createRipples(ctx, def.waterLevel); group.add(ripples.mesh); }
  const inst = {
    id: rid, group, interior: !!def.interior, waterLevel: def.waterLevel ?? null,
    marks: def.marks, pois: def.pois, cameraHints: def.cameraHints,
    shadow: def.shadow, lightFocus: def.lightFocus, windowLight: def.windowLight, env: def.env || null, _lamps: b.lamps,
    update(t, camera) {
      if (ctx.worldSet !== inst) return;
      if (ripples) ripples.update(t, group);
      if (ctx.worldEnv && camera) ctx.worldEnv.update(t, camera);
    },
  };
  return inst;
}
