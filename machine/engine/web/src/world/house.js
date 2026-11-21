// World module — parametric Victorian clapboard house (Roblox lakeside-town style) + church.
// Builds into a Builder at the current transform. Origin = base centre of the main body,
// front (porch, door) toward +Z. Returns layout info (front z, door position, size).
import { windowRect } from './textures.js';
import { pick, range, shade } from './core.js';

export const HOUSE_COLORS = ['#a7c7ea', '#efe0a0', '#ecbcc2', '#b5c7a2', '#a3b4cc', '#f3ead4', '#dccb8e', '#c9dbef', '#c8b8d8'];
export const SHUTTER_COLORS = ['#1f2b46', '#1f2b46', '#24262c', '#2c4634', '#1f2b46', '#5a2a2a'];
export const DOOR_COLORS = ['#b52119', '#b52119', '#b52119', '#1f2b46', '#2c5a3a', '#b52119'];
export const ROOF_COLORS = ['#3a4150', '#3a4150', '#40444c', '#353a46', '#4a4e57'];
const TRIM = '#f6f5f0';

/** a window on a facade frame (facade = plane z=0 facing +Z). y = bottom of glass. */
export function windowUnit(b, x, y, w, h, o = {}) {
  const trim = o.trim || TRIM; const far = b.lod === 'far';
  const lit = o.lit !== undefined ? o.lit : b.rng() < 0.72;
  b.box(w + 0.8, h + 0.8, 0.26, x, y + h / 2, 0.13, 'satin', trim);
  b.quad(w, h, x, y + h / 2, 0.27, lit ? 'win' : 'win_dark', '#ffffff', { uvRect: windowRect(o.variant ?? 0), cast: false });
  if (!far || o.big) {
    b.box(w + 1.5, 0.45, 0.55, x, y + h + 0.62, 0.27, 'satin', trim);
    b.box(w + 1.1, 0.28, 0.6, x, y - 0.52, 0.3, 'satin', trim);
  }
  if (o.shutters) {
    const sw = Math.min(1.9, w * 0.5);
    for (const s of [-1, 1]) b.box(sw, h + 0.5, 0.2, x + s * (w / 2 + 0.5 + sw / 2), y + h / 2, 0.14, far ? 'plain' : 'louvre', o.shutter || '#1f2b46', { uv: 'unit' });
  }
  if (o.flowerbox && !far) {
    b.box(w + 0.7, 0.8, 0.95, x, y - 1.1, 0.55, 'satin', o.boxColor || TRIM);
    b.box(w + 0.5, 0.45, 0.75, x, y - 0.55, 0.55, 'foliage', '#3f8a35');
    const fl = ['#e0303a', '#f05a8a', '#ffffff', '#e0303a', '#f2c230'];
    const n = Math.max(3, Math.round(w / 0.9));
    for (let i = 0; i < n; i++) b.box(0.42, 0.42, 0.42, x - w / 2 + (i + 0.5) * (w / n), y - 0.25, 0.55 + (i % 2 ? 0.2 : -0.15), 'plain', fl[(i + (o.seedK || 0)) % fl.length], { cast: false });
  }
}

/** gable roof over a box footprint (w along x, d along z), ridge along Z, wall top at yT. */
function gableRoof(b, w, d, yT, pitch, o) {
  const ov = o.ov ?? 1.1, t = 0.55; const hw = w / 2 + ov; const a = Math.atan(pitch); const R = (w / 2) * pitch; const yR = yT + R;
  const L = hw / Math.cos(a); const len = d + 2 * (o.ovz ?? ov);
  for (const s of [-1, 1]) {
    const cx = s * (hw / 2 + Math.sin(a) * t / 2), cy = yR - (hw / 2) * Math.tan(a) + Math.cos(a) * t / 2;
    b.prim('box', cx, cy, o.zc || 0, L, t, len, 'shingle', o.roof, { rz: -s * a });
    // fascia board along the eave
    b.box(0.35, 0.75, len, s * (hw - 0.1), yR - hw * Math.tan(a) - 0.05, o.zc || 0, 'satin', TRIM, { cast: false });
  }
  b.box(0.9, 0.5, len + 0.1, 0, yR + t * 0.75, o.zc || 0, 'shingle', shade(o.roof, -0.04));
  // gable infill (siding) + rake trim on both ends
  if (o.gable !== false) b.prism(w, R, d, 0, yT, o.zc || 0, 'siding', o.color);
  for (const e of o.ends || [1, -1]) {
    const zf = (o.zc || 0) + e * (d / 2 + (o.ovz ?? ov) - 0.25);
    for (const s of [-1, 1]) b.beam(s * hw, yR - hw * Math.tan(a) - 0.2, zf, 0, yR - 0.2, zf, 0.35, 'satin', TRIM, { th: 0.9, cast: false });
  }
  return { yR, R };
}

/**
 * Victorian house. opts: color, trim, door (colour), shutter, roof, floors (1-3), porch (bool|'none'),
 * style ('front'|'side'|'tower'), width, depth, seed-driven rng (b.rng), chimney (bool), lit windows
 * returns { w, d, frontZ, door:{x,y,z}, height }
 */
export function buildHouse(b, o = {}) {
  const r = b.rng; const far = b.lod === 'far'; const mid = b.lod === 'mid';
  const style = o.style || pick(r, ['front', 'side', 'side', 'tower', 'front']);
  const floors = Math.max(1, Math.min(3, o.floors || 2));
  const color = o.color || pick(r, HOUSE_COLORS); const trim = o.trim || TRIM;
  const shutter = o.shutter || pick(r, SHUTTER_COLORS); const doorC = o.door || pick(r, DOOR_COLORS);
  const roof = o.roof || pick(r, ROOF_COLORS);
  const W = o.width || (style === 'side' ? range(r, 30, 34) : range(r, 25, 29));
  const D = o.depth || (style === 'side' ? range(r, 22, 25) : range(r, 26, 30));
  const F = 1.3, SH = 10.5; const yT = F + floors * SH;
  const porch = o.porch === undefined ? true : (o.porch && o.porch !== 'none');
  const doorX = o.doorX !== undefined ? o.doorX : (style === 'side' ? 0 : (W / 2 - 6.5) * (r() < 0.5 ? -1 : 1));

  // ---- body
  b.box(W + 0.3, F, D + 0.3, 0, F / 2, 0, 'stone', '#8d8a86');                // foundation
  b.box(W, yT - F, D, 0, F + (yT - F) / 2, 0, 'siding', color);               // walls
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (!far || sz > 0) b.box(0.7, yT - F, 0.7, sx * (W / 2), F + (yT - F) / 2, sz * (D / 2), 'satin', trim, { cast: false });
  for (let f = 1; f < floors; f++) b.box(W + 0.35, 0.7, D + 0.35, 0, F + f * SH, 0, 'satin', trim, { cast: false });
  b.box(W + 0.4, 1.0, D + 0.4, 0, yT - 0.5, 0, 'satin', trim, { cast: false });   // frieze under eaves

  // ---- roof
  let ridge;
  if (style === 'side') {
    b.push(0, 0, 0, Math.PI / 2);
    ridge = gableRoof(b, D, W, yT, 0.72, { roof, color, ov: 1.2 });
    b.pop();
    // front cross gable
    const cw = Math.min(W * 0.44, 14); const cp = 1.0; const zc = D / 4 + 0.6;
    gableRoof(b, cw, D / 2 + 0.2, yT, cp, { roof, color, zc, ov: 0.9, ovz: 0.9, ends: [1] });
    if (!far) { b.box(2.6, 1.6, 0.25, 0, yT + cw * cp * 0.42, D / 2 + 0.12, 'satin', trim); b.quad(2.0, 1.1, 0, yT + cw * cp * 0.42, D / 2 + 0.26, 'louvre', '#e8e8e8', { cast: false }); }
  } else {
    ridge = gableRoof(b, W, D, yT, style === 'tower' ? 1.05 : 0.95, { roof, color });
    if (!far) { const vy = yT + ridge.R * 0.45; b.box(2.8, 1.8, 0.25, 0, vy, D / 2 + 0.12, 'satin', trim); b.quad(2.2, 1.3, 0, vy, D / 2 + 0.26, 'louvre', '#e8e8e8', { cast: false }); }
  }
  // chimney
  if (o.chimney !== false) {
    const cx = (style === 'side' ? 1 : -1) * (r() < 0.5 ? 1 : -1) * W * 0.3; const cz = style === 'side' ? -D * 0.15 : -D * 0.2;
    const top = ridge.yR + 2.2;
    b.boxB(2.6, top - yT + 1, 2.6, cx, yT - 1, cz, 'brick', '#ffffff');
    b.boxB(3.0, 0.5, 3.0, cx, top, cz, 'concrete', '#5b5b5b');
  }
  // tower (Queen Anne turret) on a front corner
  if (style === 'tower') {
    const tx = (doorX > 0 ? -1 : 1) * (W / 2 - 1.2), tz = D / 2 - 1.2, tr = 4.0; const th = yT + 2.5;
    b.cylf(tr, th - F, tx, F, tz, 'siding', color, 8);
    b.cylf(tr + 0.35, 0.9, tx, th - 0.9, tz, 'satin', trim, 8);
    b.cylf(tr + 0.25, 0.7, tx, F + SH - 0.35, tz, 'satin', trim, 8);
    b.prim('conef8', tx, th + 5.5, tz, tr + 1.0, 11, tr + 1.0, 'shingle', roof, { ry: Math.PI / 8 });
    b.cyl(0.18, 2.2, tx, th + 10.5, tz, 'metal', '#3a3a3a', 6);
    // two windows per storey on the turret's outward facets
    for (let f = (porch ? 1 : 0); f < floors; f++) for (const ang of [Math.PI / 8, (Math.sign(tx) * 3 * Math.PI) / 8 + (tx > 0 ? 0 : 0)]) {
      const a = tx > 0 ? ang : -ang; b.push(tx + Math.sin(a) * tr * 0.93, 0, tz + Math.cos(a) * tr * 0.93, a);
      windowUnit(b, 0, F + f * SH + 2.4, 1.9, 4.6, { variant: pick(r, [0, 2, 7]), trim }); b.pop();
    }
  }

  // ---- facades
  const facade = (len, floorsN, isFront, isBack) => {
    for (let f = 0; f < floorsN; f++) {
      const y0 = F + f * SH;
      if (isFront && f === 0) {
        // door + big windows
        b.box(4.8, 8.4, 0.3, doorX, y0 + 4.0, 0.15, 'satin', trim);
        b.quad(3.6, 7.3, doorX, y0 + 3.65 + 0.02, 0.32, 'door', doorC, { cast: false });
        b.box(5.4, 0.55, 0.6, doorX, y0 + 8.3, 0.3, 'satin', trim);
        // porch lantern
        b.box(0.6, 0.9, 0.6, doorX + 3.2, y0 + 6.2, 0.45, 'lampglass', '#fff3c8', { cast: false });
        b.box(0.75, 0.2, 0.75, doorX + 3.2, y0 + 6.75, 0.45, 'metal', '#222', { cast: false });
        b.lamp(doorX + 3.2, y0 + 6.2, 1.2, 'porch');
        const slots = [];
        const left = -len / 2 + 1.2, right = len / 2 - 1.2;
        const gapL = [left, doorX - 3.4], gapR = [doorX + 3.4, right];
        for (const [a0, a1] of [gapL, gapR]) {
          const span = a1 - a0; if (span < 4.5) continue;
          const n = span > 15 ? 2 : 1; const ww = Math.min(8.5, span / n - 1.6);
          for (let i = 0; i < n; i++) slots.push([a0 + (i + 0.5) * (span / n), ww]);
        }
        for (const [sx, ww] of slots) windowUnit(b, sx, y0 + 1.9, ww, 6.2, { variant: pick(r, [3, 4, 5, 3]), trim, big: true });
      } else {
        if (far && !isFront) { if (f === floorsN - 1) continue; }
        const n = isFront ? (len > 27 ? 4 : len > 20 ? 3 : 2) : (len > 24 ? 3 : 2);
        const ww = isFront ? 3.3 : 3.0; const hh = 5.3;
        const span = len - 4; const fbK = Math.floor(r() * n);
        for (let i = 0; i < n; i++) {
          let sx = -span / 2 + (i + 0.5) * (span / n);
          if (isFront && n === 4) sx = (i < 2 ? -1 : 1) * (i === 0 || i === 3 ? span * 0.38 : span * 0.13);
          windowUnit(b, sx, y0 + 2.6, ww, hh, {
            variant: pick(r, [0, 1, 2, 6, 7, 0]), trim, shutter,
            shutters: isFront || (!isBack && !mid && !far && r() < 0.5),
            flowerbox: isFront && (i === fbK || (n === 4 && i === 3 - fbK)) && f === floorsN - 1, seedK: i,
          });
        }
      }
    }
  };
  b.push(0, 0, D / 2, 0); facade(W, floors, true, false); b.pop();
  if (!far) {
    b.push(-W / 2, 0, 0, -Math.PI / 2); facade(D, floors, false, false); b.pop();
    b.push(W / 2, 0, 0, Math.PI / 2); facade(D, floors, false, false); b.pop();
    if (!mid) { b.push(0, 0, -D / 2, Math.PI); facade(W, floors, false, true); b.pop(); }
  } else {
    b.push(-W / 2, 0, 0, -Math.PI / 2); facade(D, floors, false, false); b.pop();
    b.push(W / 2, 0, 0, Math.PI / 2); facade(D, floors, false, false); b.pop();
  }

  // ---- porch
  let frontZ = D / 2;
  if (porch) {
    const PD = 7.5, z0 = D / 2, zf = z0 + PD; frontZ = zf + 3.2;
    const pw = W + 0.6; const pfloor = o.porchFloor || '#9b9a97';
    b.box(pw, F, PD, 0, F / 2, z0 + PD / 2, 'planks', pfloor);
    b.box(pw + 0.2, 0.25, PD + 0.2, 0, F - 0.1, z0 + PD / 2, 'satin', trim, { cast: false });
    // steps
    for (let k = 0; k < 3; k++) b.box(6.4, F - k * (F / 3), 1.05, doorX, (F - k * (F / 3)) / 2, zf + 0.5 + k * 1.0, 'planks', shade(pfloor, 0.05));
    // columns
    const yTop = F + SH - 1.5;
    const nC = Math.max(3, Math.round(pw / 7)); const cols = [];
    for (let i = 0; i < nC; i++) cols.push(-pw / 2 + 0.6 + i * ((pw - 1.2) / (nC - 1)));
    for (const cx of cols) {
      b.box(0.85, yTop - F, 0.85, cx, F + (yTop - F) / 2, zf - 0.6, 'satin', trim);
      if (!far) { b.box(1.2, 0.5, 1.2, cx, F + 0.25, zf - 0.6, 'satin', trim, { cast: false }); b.box(1.25, 0.45, 1.25, cx, yTop - 0.25, zf - 0.6, 'satin', trim, { cast: false }); }
    }
    // roof (shed) + beam + ceiling
    const yW = F + SH - 0.2, yF = yTop + 0.9; const ang = Math.atan((yW - yF) / (PD + 0.9));
    const sl = (PD + 1.2) / Math.cos(ang);
    b.prim('box', 0, (yW + yF) / 2 + 0.3, z0 + (PD + 0.9) / 2, pw + 1.2, 0.45, sl, 'shingle', roof, { rx: ang });
    b.box(pw + 0.3, 1.0, 0.7, 0, yTop + 0.5, zf - 0.6, 'satin', trim);
    b.box(pw, 0.25, PD, 0, yTop + 0.95, z0 + PD / 2, 'plain', o.porchCeil || '#a9d0d0', { cast: false });
    // railings (skip stair opening)
    const railY = F + 2.9, railZ = zf - 0.6;
    const segs = [];
    for (let i = 0; i < cols.length - 1; i++) {
      let a0 = cols[i] + 0.45, a1 = cols[i + 1] - 0.45;
      const s0 = doorX - 3.4, s1 = doorX + 3.4;
      if (a1 > s0 && a0 < s1) { if (s0 - a0 > 1) segs.push([a0, s0]); if (a1 - s1 > 1) segs.push([s1, a1]); }
      else segs.push([a0, a1]);
    }
    const rail = (a0, a1, z, axis) => {
      const L = a1 - a0, c = (a0 + a1) / 2;
      const bx = (w, h, d, x, y, zz) => axis === 'x' ? b.box(w, h, d, x, y, zz, 'satin', trim, { cast: false }) : b.box(d, h, w, zz, y, x, 'satin', trim, { cast: false });
      bx(L, 0.32, 0.42, c, railY, z); bx(L, 0.25, 0.3, c, F + 0.45, z);
      if (far || mid) { bx(L, 2.2, 0.12, c, F + 1.65, z); return; }
      const n = Math.max(1, Math.floor(L / 0.72));
      for (let k = 0; k < n; k++) bx(0.22, 2.3, 0.22, a0 + (k + 0.5) * (L / n), F + 1.65, z);
    };
    for (const [a0, a1] of segs) rail(a0, a1, railZ, 'x');
    for (const sx of [-1, 1]) rail(z0 + 0.4, zf - 1.05, sx * (pw / 2 - 0.6), 'z');
    // hanging baskets
    if (!far && o.baskets !== false) for (const hx of [doorX - 5.5, doorX + 5.5]) {
      if (Math.abs(hx) > pw / 2 - 1) continue;
      b.cyl(0.05, 1.4, hx, yTop - 0.4, zf - 2.2, 'metal', '#333', 4, { cast: false });
      b.prim('hemi10', hx, yTop - 1.6, zf - 2.2, 0.8, -0.7, 0.8, 'plain', '#7a5232');
      b.blob(0.85, hx, yTop - 1.3, zf - 2.2, 'foliage', '#3f8f3a', { sy: 0.7 });
      for (let k = 0; k < 4; k++) b.box(0.3, 0.3, 0.3, hx + Math.cos(k * 1.7) * 0.7, yTop - 1.0, zf - 2.2 + Math.sin(k * 1.7) * 0.7, 'plain', k % 2 ? '#e0303a' : '#f070a0', { cast: false });
    }
    // potted plants by the steps
    if (!far) for (const s of [-1, 1]) {
      const px = doorX + s * 3.9; b.cyl(0.55, 0.9, px, F, zf - 1.6, 'plain', '#b5653a', 8); b.blob(0.75, px, F + 1.4, zf - 1.6, 'foliage', '#4d9a3c');
      for (let k = 0; k < 3; k++) b.box(0.28, 0.28, 0.28, px + Math.cos(k * 2.1) * 0.5, F + 1.9, zf - 1.6 + Math.sin(k * 2.1) * 0.5, 'plain', '#e0303a', { cast: false });
    }
  } else {
    // stoop
    frontZ = D / 2 + 3.4;
    for (let k = 0; k < 3; k++) b.box(5.5, F - k * (F / 3), 1.05, doorX, (F - k * (F / 3)) / 2, D / 2 + 0.5 + k, 'concrete', '#c9c6bf');
  }
  return { w: W, d: D, frontZ, height: ridge.yR, door: { x: doorX, y: 0, z: frontZ }, style, color };
}

/** white clapboard church with steeple; front +Z. returns info */
export function buildChurch(b, o = {}) {
  const W = o.width || 26, D = o.depth || 44, H = 17, F = 1.4; const white = o.color || '#f3f1ea'; const roof = o.roof || '#3a3f4b'; const trim = '#ffffff';
  b.box(W + 0.4, F, D + 0.4, 0, F / 2, 0, 'stone', '#9a9792');
  b.box(W, H, D, 0, F + H / 2, 0, 'siding', white);
  b.box(W + 0.5, 1.0, D + 0.5, 0, F + H - 0.5, 0, 'satin', trim, { cast: false });
  gableRoof(b, W, D, F + H, 0.9, { roof, color: white, ov: 1.3 });
  // tall arched windows (glass + frame) along the sides
  for (const s of [-1, 1]) {
    b.push(s * W / 2, 0, 0, s * Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const x = -D / 2 + 7 + i * ((D - 14) / 3);
      windowUnit(b, x, F + 4, 3.2, 9, { variant: 7, trim, lit: true });
      b.prism(4.0, 1.8, 0.3, x, F + 13.4, 0.15, 'satin', trim, { cast: false });
    }
    b.pop();
  }
  // tower + steeple at the front
  const tw = 9.5, tz = D / 2 + 1.5; const tH = F + H + 9;
  b.box(tw, tH - F, tw, 0, F + (tH - F) / 2, tz, 'siding', white);
  b.box(tw + 0.6, 0.8, tw + 0.6, 0, tH, tz, 'satin', trim);
  // belfry
  const bh = 6.5; b.box(tw - 1.5, bh, tw - 1.5, 0, tH + 0.4 + bh / 2, tz, 'plain', '#3c3a38', { cast: false });
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) b.box(1.1, bh, 1.1, cx * (tw / 2 - 1.1), tH + 0.4 + bh / 2, tz + cz * (tw / 2 - 1.1), 'satin', trim);
  for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { b.push(0, 0, tz, ang); b.box(tw - 2.6, 0.4, 0.4, 0, tH + 2.0, tw / 2 - 1.1, 'satin', trim, { cast: false }); b.box(tw - 2.6, 1.6, 0.3, 0, tH + bh - 0.2, tw / 2 - 0.9, 'satin', trim); b.pop(); }
  b.box(tw + 0.4, 0.8, tw + 0.4, 0, tH + bh + 0.8, tz, 'satin', trim);
  // spire
  b.prim('conef8', 0, tH + bh + 1.2 + 8.5, tz, tw * 0.55, 17, tw * 0.55, 'shingle', roof, { ry: Math.PI / 8 });
  b.box(0.35, 3.0, 0.35, 0, tH + bh + 19.4, tz, 'metal', '#d8c070'); b.box(1.6, 0.35, 0.35, 0, tH + bh + 19.9, tz, 'metal', '#d8c070');
  // tower front: double door, round window, clock-ish rose window
  b.push(0, 0, tz + tw / 2, 0);
  b.box(6.0, 9.4, 0.35, 0, F + 4.7, 0.17, 'satin', trim);
  b.quad(2.3, 8.2, -1.2, F + 4.1, 0.36, 'door', o.door || '#b52119', { cast: false });
  b.quad(2.3, 8.2, 1.2, F + 4.1, 0.36, 'door', o.door || '#b52119', { cast: false });
  b.prism(6.8, 2.2, 0.5, 0, F + 9.4, 0.25, 'satin', trim);
  windowUnit(b, 0, F + 15, 2.6, 3.4, { variant: 7, trim, lit: true });
  b.prim('cyl16', 0, F + 22.5, 0.2, 1.6, 0.3, 1.6, 'plain', '#ffffff', { rx: Math.PI / 2 });
  b.prim('cyl16', 0, F + 22.5, 0.3, 1.3, 0.3, 1.3, 'plain', '#2a2a2a', { rx: Math.PI / 2 });
  b.pop();
  b.lamp(3.8, F + 6.5, tz + tw / 2 + 0.8, 'porch');
  // steps
  for (let k = 0; k < 3; k++) b.box(10, F - k * (F / 3), 1.2, 0, (F - k * (F / 3)) / 2, tz + tw / 2 + 0.6 + k * 1.15, 'concrete', '#d6d3cc');
  return { w: W, d: D + tw, frontZ: tz + tw / 2 + 4, height: tH + bh + 21, door: { x: 0, y: 0, z: tz + tw / 2 + 4 } };
}
