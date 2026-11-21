// Director — camera framing + camera moves for 9:16 vertical shots.
// Contract: ARCHITECTURE.md §5. Owner: engine-core.
//
//   frameShot(ctx, { framing, angle, move, subject, target, set, actors, duration, fov, ... }) → { update(t), info }
//
// Composition rules were measured on the reference reel (720×1280):
//   - subjects centred horizontally, eyes at ≈ 40 % of the frame height from the top (lots of background above);
//   - eye-level (camera a hair below the eye line, pitch ≈ 0, verticals stay vertical);
//   - medium ≈ knees/shins up, medium_close ≈ waist up, close_up ≈ head + shoulders;
//   - binocular shots: long lens, subject inside the mask's visible band (y ≈ 28–57 % of frame), slight handheld wobble;
//   - moves are subtle and eased; all moves are symmetric around mid-shot so the frame at t = duration/2 is the
//     "composed" frame (handy for storyboards).
// Everything is deterministic (seeded noise, no Math.random).

export const FRAMINGS = ['extreme_wide', 'wide', 'aerial', 'establishing', 'medium', 'medium_close', 'close_up',
  'extreme_close_up', 'over_shoulder', 'pov', 'two_shot', 'insert', 'low_angle', 'high_angle', 'back'];
export const MOVES = ['static', 'push_in', 'pull_out', 'pan_left', 'pan_right', 'drift', 'orbit', 'tilt_up', 'tilt_down', 'follow', 'shake'];
export const ANGLES = ['eye', 'low', 'high', 'top'];

export const FRAMING_ALIASES = {
  ews: 'extreme_wide', xws: 'extreme_wide', ws: 'wide', full: 'medium', full_shot: 'medium', ms: 'medium', mid: 'medium',
  mcu: 'medium_close', cu: 'close_up', close: 'close_up', closeup: 'close_up', ecu: 'extreme_close_up', xcu: 'extreme_close_up',
  ots: 'over_shoulder', over_the_shoulder: 'over_shoulder', point_of_view: 'pov', binoculars: 'pov', two: 'two_shot',
  twoshot: 'two_shot', '2shot': 'two_shot', establishing_shot: 'establishing', aerial_shot: 'aerial', drone: 'aerial',
  low: 'low_angle', high: 'high_angle', behind: 'back', from_behind: 'back', detail: 'insert',
};
export const MOVE_ALIASES = {
  none: 'static', still: 'static', locked: 'static', push: 'push_in', dolly_in: 'push_in', zoom_in: 'push_in', slow_push: 'push_in',
  pull: 'pull_out', dolly_out: 'pull_out', zoom_out: 'pull_out', handheld: 'shake', wobble: 'shake', truck: 'drift',
  truck_left: 'drift', truck_right: 'drift', arc: 'orbit', track: 'follow', tracking: 'follow', pan: 'pan_right', tilt: 'tilt_up',
};

// Subject framings. frameH = visible frame height at the subject in subject-heights (H, ≈5.2 units for an adult);
// eyeY = where the eyes land (fraction of frame height from the top); el = camera elevation in degrees as seen
// from the subject's eyes (negative = camera below the eye line); fov = default vertical FOV in degrees.
export const FRAMING_SPECS = {
  extreme_wide: { frameH: 9.0, eyeY: 0.60, el: 8, fov: 50 },
  wide: { frameH: 3.3, eyeY: 0.50, el: 4, fov: 50 },
  medium: { frameH: 1.3, eyeY: 0.40, el: -3, fov: 42 },
  medium_close: { frameH: 0.95, eyeY: 0.40, el: -3, fov: 40 },
  close_up: { frameH: 0.62, eyeY: 0.41, el: -2, fov: 36 },
  extreme_close_up: { frameH: 0.34, eyeY: 0.45, el: -1, fov: 32 },
  two_shot: { frameH: 1.35, eyeY: 0.41, el: -3, fov: 44 },
  low_angle: { frameH: 1.4, eyeY: 0.36, el: -24, fov: 46 },
  high_angle: { frameH: 1.45, eyeY: 0.44, el: 30, fov: 46 },
  back: { frameH: 1.6, eyeY: 0.45, el: 8, fov: 44 },
  insert: { frameH: 0.42, eyeY: 0.48, el: 24, fov: 38 },
  over_shoulder: { fov: 45 },
  pov: { fov: 55 },
  aerial: { fov: 50 },
  establishing: { fov: 50 },
};
// Insert framing size per held prop (frame height in subject heights).
const INSERT_SIZE = { sign: 0.95, umbrella: 1.2, bag: 0.6, binoculars: 0.45, book: 0.42, letter: 0.4, phone: 0.34, stopwatch: 0.34, cup: 0.34, flashlight: 0.42 };
const ANGLE_EL = { eye: null, level: null, low: -22, worm: -40, worms_eye: -40, ground: -30, high: 26, top: 70, birds_eye: 70, overhead: 70 };
// Binocular mask: visible band (fractions of frame height) where the subject must stay. Mask spans y≈326–749 of
// 1280 but the centre column (between the two circles) only shows ≈ 0.28–0.57.
export const BINO_BAND = [0.28, 0.57];
export const BINO_FOV = 20;

const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1)); // easeInOutSine
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const isChar = (o) => !!(o && o.root && o.root.isObject3D);
const warn = (...a) => { try { console.warn('[director]', ...a); } catch (e) { /* ignore */ } };

export function normalizeFraming(f) {
  const k = String(f || 'medium').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (FRAMINGS.includes(k)) return k;
  if (FRAMING_ALIASES[k]) return FRAMING_ALIASES[k];
  warn(`unknown framing "${f}" → medium`);
  return 'medium';
}
export function normalizeMoves(m) {
  const list = Array.isArray(m) ? m : String(m || 'static').split(/[+,&\s]+/);
  const out = [];
  for (const raw of list) {
    const k = String(raw || '').toLowerCase().trim().replace(/-/g, '_');
    if (!k) continue;
    const v = MOVES.includes(k) ? k : MOVE_ALIASES[k];
    if (!v) { warn(`unknown move "${raw}" → static`); continue; }
    if (v !== 'static' && !out.includes(v)) out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------- geometry helpers
function v3(THREE, p, fallback = null) {
  if (!p) return fallback;
  if (p.isVector3) return p.clone();
  if (Array.isArray(p)) return new THREE.Vector3(num(p[0], 0), num(p[1], 0), num(p[2], 0));
  if (typeof p === 'object') return new THREE.Vector3(num(p.x, 0), num(p.y, 0), num(p.z, 0));
  return fallback;
}

// Framing-relevant points of a Character (contract §3), robust to missing/invalid anchors.
export function charGeom(THREE, ch) {
  ch.root.updateMatrixWorld(true);
  const H = ch.height > 0 ? ch.height : 5.2;
  const base = new THREE.Vector3(); ch.root.getWorldPosition(base);
  let a = {};
  try { a = (typeof ch.anchors === 'function' && ch.anchors()) || {}; } catch (e) { a = {}; }
  const ok = (p) => p && p.isVector3 && isFinite(p.x) && isFinite(p.y) && isFinite(p.z);
  const pick = (p, fy) => (ok(p) ? p.clone() : base.clone().add(new THREE.Vector3(0, fy * H, 0)));
  const feet = pick(a.feet, 0), eyes = pick(a.eyes, 0.9), head = pick(a.head, 0.885), chest = pick(a.chest, 0.62), hands = pick(a.hands, 0.42);
  const q = new THREE.Quaternion(); ch.root.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
  fwd.normalize();
  // pivot: head column (x,z) at eye height — keeps leaning/sitting subjects centred.
  const pivot = new THREE.Vector3(head.x, eyes.y, head.z);
  return { H, base, feet, eyes, head, chest, hands, fwd, yaw: Math.atan2(fwd.x, fwd.z), pivot, headTop: Math.max(head.y, eyes.y) + 0.13 * H };
}

function dirFromYaw(THREE, yaw) { return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); }
function rightOf(THREE, fwd) { return new THREE.Vector3(-fwd.z, 0, fwd.x).normalize(); } // camera-right when looking along fwd

// Camera angles (yaw, pitch) so that world point P lands at NDC (u, v) seen from pos. Exact for u = 0.
function aimAngles(pos, P, u, v, fovDeg, aspect) {
  const dx = P.x - pos.x, dy = P.y - pos.y, dz = P.z - pos.z;
  const hd = Math.hypot(dx, dz) || 1e-6;
  const T = Math.tan(fovDeg * DEG / 2);
  const yaw = Math.atan2(dx, dz) + Math.atan(u * T * aspect);
  const pitch = Math.atan2(dy, hd) - Math.atan(v * T);
  return { yaw, pitch };
}

// ---------------------------------------------------------------- collision helpers
export function collectColliders(THREE, set, extra = []) {
  const list = [];
  const wl = typeof set?.waterLevel === 'number' ? set.waterLevel : null;
  const box = new THREE.Box3();
  const visit = (o) => {
    if (!o.isMesh || !o.geometry) return;
    const ud = o.userData || {};
    if (ud.noCollide || ud.cameraIgnore || ud.isWater || ud.water || ud.sky) return;
    if (/water|sky|cloud|snow|rain|particle|fog|glow|beam|halo|flake/i.test(o.name || '')) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.visible === false || m.side === THREE.BackSide || m.colorWrite === false) return;
    if (m.transparent && num(m.opacity, 1) < 0.6) return;
    if (wl !== null && !o.isInstancedMesh) {
      try {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        if (box.max.y - box.min.y < 0.35 && Math.abs(box.max.y - wl) < 0.4) return; // water sheet
      } catch (e) { /* ignore */ }
    }
    list.push(o);
  };
  if (set?.group) { set.group.updateMatrixWorld(true); set.group.traverseVisible(visit); }
  for (const g of extra) if (g) { g.updateMatrixWorld(true); g.traverseVisible(visit); }
  return list;
}

// ---------------------------------------------------------------- main entry
export function frameShot(ctx, opts = {}) {
  const { THREE, camera } = ctx;
  const notes = [];
  const note = (s) => { notes.push(s); warn(s); };
  const framing = normalizeFraming(opts.framing);
  const moves = normalizeMoves(opts.move);
  const duration = Math.max(0.05, num(opts.duration, 1.5));
  const set = opts.set || {};
  const camOpt = (opts.camera && typeof opts.camera === 'object') ? opts.camera : {};
  const bino = !!opts.binoculars;
  const aspect = (ctx.width && ctx.height) ? ctx.width / ctx.height : (camera.aspect || 9 / 16);
  const rng = mulberry32((num(opts.seed, 1) ^ 0x9E3779B9) >>> 0);
  const amount = clamp(num(opts.moveAmount, 1), 0, 4);
  const waterLevel = typeof set.waterLevel === 'number' ? set.waterLevel : null;
  const allowUnderwater = !!opts.allowUnderwater;
  const fovOverride = typeof opts.fov === 'number' && opts.fov > 1 && opts.fov < 170 ? opts.fov : null;

  let subject = opts.subject || null;
  let subjectPoint = null;
  if (subject && !isChar(subject)) { subjectPoint = v3(THREE, subject); subject = null; }
  const actors = (opts.actors || []).filter(isChar);
  const targetChar = isChar(opts.target) ? opts.target : null;
  const targetPoint = targetChar ? null : v3(THREE, opts.target);

  // Characters are never "geometry" for camera collision except as listed blockers.
  const blockers = (opts.blockers || []).filter(isChar).filter((c) => c !== subject && c !== targetChar).map((c) => c.root);
  let colliders = null;
  const getColliders = () => (colliders ||= collectColliders(THREE, set, blockers));
  const ray = new THREE.Raycaster();
  const segFree = (from, to, margin = 0.35) => { // distance of first hit along from→to, or Infinity
    const dir = to.clone().sub(from); const len = dir.length(); if (len < 1e-4) return Infinity;
    dir.divideScalar(len); ray.set(from, dir); ray.near = 0.25; ray.far = len + margin;
    let hits; try { hits = ray.intersectObjects(getColliders(), false); } catch (e) { return Infinity; }
    return hits.length ? hits[0].distance : Infinity;
  };
  const groundBelow = (p) => {
    ray.set(new THREE.Vector3(p.x, p.y + 0.8, p.z), new THREE.Vector3(0, -1, 0)); ray.near = 0; ray.far = 80;
    let hits; try { hits = ray.intersectObjects(getColliders(), false); } catch (e) { return null; }
    return hits.length ? hits[0].point.y : null;
  };
  const ceilingAbove = (p) => {
    ray.set(p, new THREE.Vector3(0, 1, 0)); ray.near = 0; ray.far = 3;
    let hits; try { hits = ray.intersectObjects(getColliders(), false); } catch (e) { return null; }
    return hits.length ? hits[0].point.y : null;
  };
  // Keep the camera out of the floor, the ceiling and (unless intended) the water.
  const constrainY = (pos, check = true) => {
    if (check) {
      const g = groundBelow(pos);
      if (g !== null && pos.y < g + 0.45) pos.y = g + 0.45;
      const c = ceilingAbove(pos);
      if (c !== null && pos.y > c - 0.35) pos.y = c - 0.35;
    }
    if (waterLevel !== null && !allowUnderwater && pos.y < waterLevel + 0.35) pos.y = waterLevel + 0.35;
    return pos;
  };

  // ------------------------------------------------------------ compose the base pose
  // base = { pos, pivot, u, v, fov, kind } ; pivot lands at NDC (u, v).
  let base = null;
  const spec = FRAMING_SPECS[framing] || FRAMING_SPECS.medium;
  const angleEl = (() => {
    const a = opts.angle;
    if (typeof a === 'number' && isFinite(a)) return a;
    if (a == null || a === '') return null;
    const k = String(a).toLowerCase();
    if (k in ANGLE_EL) return ANGLE_EL[k];
    if (isFinite(parseFloat(k))) return parseFloat(k);
    note(`unknown angle "${a}" → eye`); return null;
  })();

  const hintNames = { extreme_wide: ['extreme_wide', 'wide', 'establishing'], establishing: ['establishing', 'wide'], aerial: ['aerial'], wide: ['wide', 'establishing'] };
  function hintPose(names) {
    const H = set.cameraHints || {};
    for (const n of names) {
      const h = H[n];
      if (!h) continue;
      const pos = v3(THREE, h.pos || h.position), tgt = v3(THREE, h.target || h.lookAt);
      if (!pos || !tgt) continue;
      let p = pos.clone();
      // derive extreme_wide / aerial from other hints when missing
      if (framing === 'extreme_wide' && n !== 'extreme_wide') { p = tgt.clone().add(pos.clone().sub(tgt).multiplyScalar(n === 'wide' ? 1.8 : 1.35)); p.y += 4; }
      return { pos: p, pivot: tgt, u: 0, v: 0, fov: fovOverride || num(h.fov, spec.fov || 50), kind: 'hint:' + n };
    }
    return null;
  }
  function setCentre() {
    const ms = set.marks || {}; const pts = [];
    for (const k of Object.keys(ms)) { const m = ms[k]; if (m && !Array.isArray(m) && typeof m.x === 'number') pts.push(m); }
    const c = new THREE.Vector3();
    if (pts.length) { for (const m of pts) c.add(new THREE.Vector3(m.x, num(m.y, 0), m.z)); c.divideScalar(pts.length); }
    return c;
  }
  function fallbackSetPose() {
    const c = subjectPoint ? subjectPoint.clone() : setCentre();
    const presets = { aerial: [0, 55, 38, 0], extreme_wide: [0, 14, 46, 1], establishing: [0, 9, 28, 1.5], wide: [0, 5, 20, 2] };
    const p = presets[framing] || presets.wide;
    return { pos: c.clone().add(new THREE.Vector3(p[0], p[1], p[2])), pivot: c.clone().add(new THREE.Vector3(0, p[3], 0)), u: 0, v: 0, fov: fovOverride || 50, kind: 'fallback' };
  }
  function aerialFromHints() {
    const h = hintPose(['establishing', 'wide']);
    if (!h) return null;
    const off = h.pos.clone().sub(h.pivot); off.y = 0;
    const dist = Math.max(25, off.length() * 1.3);
    if (off.lengthSq() < 1e-6) off.set(0, 0, 1);
    off.normalize();
    return { pos: h.pivot.clone().add(off.multiplyScalar(dist * 0.75)).add(new THREE.Vector3(0, dist * 0.95, 0)), pivot: h.pivot.clone(), u: 0, v: 0, fov: fovOverride || 50, kind: 'aerial-derived' };
  }

  // A subject-relative pose: camera at azimuth `az` (world yaw of the camera direction seen from the subject).
  function subjectPose(g, sp, az, extra = {}) {
    let fov = fovOverride || (bino ? BINO_FOV : sp.fov);
    let frameH = sp.frameH * num(camOpt.distance, 1);
    let eyeY = sp.eyeY;
    if (bino) { frameH = frameH / (BINO_BAND[1] - BINO_BAND[0]); eyeY = BINO_BAND[0] + eyeY * (BINO_BAND[1] - BINO_BAND[0]); }
    let el = extra.el != null ? extra.el : (angleEl != null && !extra.lockEl ? angleEl : sp.el);
    if (typeof camOpt.elevation === 'number') el = camOpt.elevation;
    const H = g.H;
    // lying / very low subjects: look from above
    if (g.eyes.y - g.feet.y < 0.3 * H && el < 20) el = 35;
    const d = Math.max(1.2, frameH * H / (2 * Math.tan(fov * DEG / 2)));
    const pivot = (extra.pivot || g.pivot).clone();
    const dir = dirFromYaw(THREE, az);
    const pos = pivot.clone().addScaledVector(dir, d * Math.cos(el * DEG)).add(new THREE.Vector3(0, d * Math.sin(el * DEG) + num(camOpt.height, 0), 0));
    return { pos, pivot, u: num(extra.u, 0), v: 1 - 2 * eyeY, fov, d, frameH, H, az, el, kind: 'subject' };
  }

  // Try azimuth offsets until the line pivot→camera is clear; else pull in and widen the lens.
  function unblock(makePose, az0, from) {
    const offsets = num(camOpt.azimuth, null) !== null ? [0] : [0, 14, -14, 28, -28, 45, -45, 70, -70];
    let best = null;
    for (const off of offsets) {
      const p = makePose(az0 + off * DEG);
      const f = from ? from(p) : p.pivot;
      constrainY(p.pos);
      const free = segFree(f, p.pos);
      if (free === Infinity) { if (off) notes.push(`azimuth +${off}° to clear the view`); return p; }
      if (!best || free > best.free) best = { p, free, off };
    }
    // nothing clear: take the most open direction and dolly in front of the blocker
    const p = best.p; const f = from ? from(p) : p.pivot;
    const dir = p.pos.clone().sub(f); const len = dir.length(); dir.normalize();
    const newLen = Math.max(1.0, best.free - 0.6);
    if (newLen < len) {
      p.pos = f.clone().addScaledVector(dir, newLen);
      if (p.frameH && !fovOverride) p.fov = clamp(2 * Math.atan(p.frameH * p.H / (2 * newLen)) / DEG, p.fov, bino ? 45 : 80);
      constrainY(p.pos);
      notes.push(`view blocked: camera pulled in to ${newLen.toFixed(1)} (fov ${p.fov.toFixed(0)}°)`);
    }
    return p;
  }

  const azOffset = () => {
    if (typeof camOpt.azimuth === 'number') return camOpt.azimuth * DEG;
    // subtle deterministic variety (±7°) for character framings, like a human operator
    return (rng() * 2 - 1) * 7 * DEG;
  };
  const lockAz = typeof opts.azimuthWorld === 'number' ? opts.azimuthWorld : null;

  const useHints = ['establishing', 'aerial'].includes(framing) || (framing === 'extreme_wide' && (set.cameraHints?.extreme_wide || (!subject && !subjectPoint))) || (framing === 'wide' && !subject && !subjectPoint);

  if (camOpt.pos && camOpt.target) {
    base = { pos: v3(THREE, camOpt.pos), pivot: v3(THREE, camOpt.target), u: 0, v: 0, fov: fovOverride || num(camOpt.fov, 50), kind: 'manual' };
  } else if (useHints) {
    base = hintPose(hintNames[framing] || ['establishing']) || (framing === 'aerial' ? aerialFromHints() : null) || fallbackSetPose();
    if (subjectPoint && framing !== 'aerial' && base.kind === 'fallback') base.pivot = subjectPoint.clone();
  } else if (!subject && subjectPoint) {
    // framing a point of interest: a virtual subject of nominal size at that point
    const sizes = { extreme_wide: 60, wide: 30, medium: 14, medium_close: 10, close_up: 7, extreme_close_up: 4, insert: 3, two_shot: 14, low_angle: 14, high_angle: 14, back: 14, over_shoulder: 14, pov: 14 };
    const dist = sizes[framing] || 14;
    const h = hintPose(['establishing', 'wide']);
    let az = h ? Math.atan2(h.pos.x - subjectPoint.x, h.pos.z - subjectPoint.z) : 0;
    if (typeof camOpt.azimuth === 'number') az += camOpt.azimuth * DEG;
    const el = (angleEl != null ? angleEl : (framing === 'high_angle' ? 30 : framing === 'low_angle' ? -15 : framing === 'insert' ? 40 : 8)) * DEG;
    const pivot = subjectPoint.clone(); pivot.y += Math.min(2, dist * 0.1);
    const mk = (a) => ({ pos: pivot.clone().addScaledVector(dirFromYaw(THREE, a), dist * Math.cos(el)).add(new THREE.Vector3(0, dist * Math.sin(el), 0)), pivot: pivot.clone(), u: 0, v: 0.05, fov: fovOverride || (bino ? BINO_FOV : 50), kind: 'poi' });
    base = unblock(mk, az);
  } else if (!subject) {
    note(`framing ${framing} needs a subject; using set camera hints`);
    base = hintPose(['wide', 'establishing']) || fallbackSetPose();
  } else if (framing === 'pov') {
    const g = charGeom(THREE, subject);
    const eye = g.eyes.clone().addScaledVector(g.fwd, 0.35 * g.H / 5.2);
    let pivot, v = 0, fov = fovOverride || (bino ? BINO_FOV : spec.fov);
    if (targetChar) {
      const tg = charGeom(THREE, targetChar);
      pivot = tg.pivot.clone();
      const sp = FRAMING_SPECS.medium_close;
      if (bino) {
        const fh = sp.frameH / (BINO_BAND[1] - BINO_BAND[0]);
        const dist = eye.distanceTo(pivot);
        if (!fovOverride) fov = clamp(2 * Math.atan(fh * tg.H / (2 * dist)) / DEG, 3, 45);
        v = 1 - 2 * (BINO_BAND[0] + sp.eyeY * (BINO_BAND[1] - BINO_BAND[0]));
      } else v = 1 - 2 * 0.42;
    } else if (targetPoint) { pivot = targetPoint.clone(); v = bino ? 1 - 2 * ((BINO_BAND[0] + BINO_BAND[1]) / 2) : 0; }
    else { pivot = eye.clone().addScaledVector(g.fwd, 30); pivot.y = eye.y - 1; v = bino ? 1 - 2 * ((BINO_BAND[0] + BINO_BAND[1]) / 2) : 0; }
    base = { pos: eye, pivot, u: 0, v, fov, kind: 'pov', zoomMoves: true };
  } else if (framing === 'over_shoulder') {
    const g = charGeom(THREE, subject);
    let T = targetChar ? charGeom(THREE, targetChar).pivot : targetPoint;
    if (!T) { T = g.eyes.clone().addScaledVector(g.fwd, 40); T.y = Math.max(0, g.feet.y); }
    const fwd = T.clone().sub(g.eyes); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.copy(g.fwd);
    fwd.normalize();
    const sgn = camOpt.side === 'left' ? -1 : 1; // +1: over the right shoulder → subject on the left of frame
    const right = rightOf(THREE, fwd);
    const H = g.H;
    let back = 0.62 * H * num(camOpt.distance, 1), side = 0.17 * H, rise = 0.2 * H + num(camOpt.height, 0);
    const fov = fovOverride || (bino ? BINO_FOV : spec.fov);
    const vT = 1 - 2 * 0.40, uT = 0.12 * sgn;
    const mk = () => constrainY(g.eyes.clone().addScaledVector(fwd, -back).addScaledVector(right, side * sgn).add(new THREE.Vector3(0, rise, 0)));
    let pos = mk();
    // refine so the subject's head sits in the lower third, on its side, but inside the frame
    for (let i = 0; i < 8; i++) {
      setCam(camera, pos, aimAngles(pos, T, uT, vT, fov, aspect), 0, fov, aspect);
      const hp = g.head.clone().project(camera);
      let changed = false;
      if (Math.abs(hp.x) > 0.8) { side *= 0.72; changed = true; }
      if (hp.y < -0.8) { rise *= 0.7; changed = true; } else if (hp.y > -0.2) { rise = rise * 1.25 + 0.1; changed = true; }
      if (!changed) break;
      pos = mk();
    }
    // wall right behind the subject? dolly towards the head
    const free = segFree(g.eyes, pos);
    if (free !== Infinity) { const dir = pos.clone().sub(g.eyes).normalize(); pos = g.eyes.clone().addScaledVector(dir, Math.max(0.8, free - 0.4)); notes.push('over_shoulder: camera pulled in (wall behind subject)'); }
    base = { pos, pivot: T.clone(), u: uT, v: vT, fov, kind: 'ots' };
  } else if (framing === 'two_shot') {
    const g = charGeom(THREE, subject);
    let partner = targetChar && targetChar !== subject ? targetChar : null;
    if (!partner) {
      let bd = Infinity;
      for (const a of actors) { if (a === subject) continue; const d = a.root.position.distanceTo(subject.root.position); if (d < bd) { bd = d; partner = a; } }
    }
    if (!partner) {
      note('two_shot: no other actor → medium');
      const az0 = lockAz != null ? lockAz : g.yaw + azOffset();
      base = unblock((a) => subjectPose(g, FRAMING_SPECS.medium, a), az0);
    } else {
      const p = charGeom(THREE, partner);
      const L = p.base.clone().sub(g.base); L.y = 0;
      const len = L.length();
      let n = len > 1e-3 ? new THREE.Vector3(L.z, 0, -L.x).divideScalar(len) : g.fwd.clone();
      const facing = g.fwd.clone().add(p.fwd);
      if (facing.lengthSq() > 0.04 ? n.dot(facing) < 0 : n.dot(g.fwd) < 0) n.negate();
      const H = Math.max(g.H, p.H);
      const mid = g.pivot.clone().add(p.pivot).multiplyScalar(0.5); mid.y = Math.max(g.pivot.y, p.pivot.y);
      const sp = FRAMING_SPECS.two_shot;
      const mk = (az) => {
        const pose = subjectPose({ ...g, H, pivot: mid }, sp, az, { pivot: mid });
        const fovR = pose.fov * DEG / 2;
        const halfW = len / 2 + 0.45 * H;
        const dH = halfW / (Math.tan(fovR) * aspect);
        if (dH > pose.d) {
          const k = dH / pose.d; pose.pos = mid.clone().add(pose.pos.clone().sub(mid).multiplyScalar(k)); pose.d = dH; pose.frameH *= k;
        }
        return pose;
      };
      const az0 = lockAz != null ? lockAz : Math.atan2(n.x, n.z) + azOffset() * 0.5;
      base = unblock(mk, az0);
    }
  } else if (framing === 'insert') {
    const g = charGeom(THREE, subject);
    const pt = String(opts.subjectProp?.type || opts.subjectProp || '').toLowerCase();
    const sp = { ...FRAMING_SPECS.insert, frameH: INSERT_SIZE[pt] || FRAMING_SPECS.insert.frameH };
    if (pt === 'sign') sp.el = 6;
    const pivot = g.hands.clone();
    const az0 = lockAz != null ? lockAz : g.yaw + (typeof camOpt.azimuth === 'number' ? camOpt.azimuth * DEG : 0);
    base = unblock((a) => { const p = subjectPose(g, sp, a, { pivot }); p.v = 1 - 2 * sp.eyeY; return p; }, az0, (p) => p.pivot);
  } else {
    // subject framings: medium, medium_close, close_up, extreme_close_up, wide, extreme_wide, low/high angle, back
    const g = charGeom(THREE, subject);
    const sp = FRAMING_SPECS[framing] || FRAMING_SPECS.medium;
    const behind = framing === 'back';
    const extra = {};
    if (framing === 'low_angle' || framing === 'high_angle') extra.lockEl = true;
    const az0 = lockAz != null ? lockAz : g.yaw + (behind ? Math.PI : 0) + azOffset();
    base = unblock((a) => subjectPose(g, sp, a, extra), az0);
  }

  if (!base) base = fallbackSetPose();
  constrainY(base.pos, base.kind !== 'pov' && base.kind !== 'manual' && !base.kind.startsWith('hint'));
  if (!fovOverride && typeof camOpt.fov === 'number') base.fov = camOpt.fov;

  // ------------------------------------------------------------ moves
  const subjPivot0 = subject ? charGeom(THREE, subject).pivot : null;
  const dist0 = base.pos.distanceTo(base.pivot);
  const baseAngles = aimAngles(base.pos, base.pivot, base.u, base.v, base.fov, aspect);
  const dirSign = rng() < 0.5 ? -1 : 1;
  const ph = Array.from({ length: 12 }, () => rng() * Math.PI * 2);
  const has = (m) => moves.includes(m);
  const wob = (t, f, i) => 0.55 * Math.sin(t * 2 * Math.PI * f + ph[i]) + 0.3 * Math.sin(t * 2 * Math.PI * f * 2.31 + ph[i + 1]) + 0.15 * Math.sin(t * 2 * Math.PI * f * 4.7 + ph[i + 2]);
  const PUSH = 0.09 * amount, PAN = 5 * DEG * amount, TILT = 4 * DEG * amount, ORBIT = 8 * DEG * amount, DRIFT = 0.035 * amount;
  const tmp = new THREE.Vector3();
  const follow = has('follow') && !!subject;
  if (has('follow') && !subject) notes.push('follow without subject → drift');

  function update(t) {
    t = num(t, 0);
    const e = ease(t / duration) - 0.5; // −0.5 … +0.5 eased, 0 at mid-shot
    let pos = base.pos.clone(); let pivot = base.pivot.clone(); let fov = base.fov;
    if (follow) {
      const now = charGeom(THREE, subject).pivot;
      tmp.copy(now).sub(subjPivot0); tmp.y *= 0.5;
      pos.add(tmp); pivot.add(tmp);
    }
    const reAim = !(has('drift') || (has('follow') && !subject));
    if (has('push_in') || has('pull_out')) {
      const k = (has('push_in') ? -1 : 1) * PUSH * e; // push_in: 1.045 → 0.955
      if (base.zoomMoves) fov = fov * (1 + k);
      else pos = pivot.clone().add(pos.clone().sub(pivot).multiplyScalar(1 + k));
    }
    if (has('orbit')) {
      const off = pos.clone().sub(pivot); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), ORBIT * e * dirSign); pos = pivot.clone().add(off);
    }
    if (has('drift') || (has('follow') && !subject)) {
      const fwd = pivot.clone().sub(pos); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      const right = rightOf(THREE, fwd);
      pos.addScaledVector(right, DRIFT * dist0 * e * dirSign * 2).add(new THREE.Vector3(0, DRIFT * dist0 * e * 0.4, 0));
    }
    if (!allowUnderwater && waterLevel !== null && pos.y < waterLevel + 0.35) pos.y = waterLevel + 0.35;
    let { yaw, pitch } = reAim ? aimAngles(pos, pivot, base.u, base.v, fov, aspect) : baseAngles;
    let roll = 0;
    if (has('pan_left')) yaw += PAN * e;
    if (has('pan_right')) yaw -= PAN * e;
    if (has('tilt_up')) pitch += TILT * e;
    if (has('tilt_down')) pitch -= TILT * e;
    if (has('shake')) {
      const A = 0.55 * DEG * amount;
      yaw += A * wob(t, 1.3, 0); pitch += A * wob(t, 1.1, 3); roll += A * 0.5 * wob(t, 0.9, 6);
      pos.y += 0.02 * dist0 * 0.05 * wob(t, 1.7, 9);
    }
    if (bino) { // handheld binoculars: slow wobble scaled with the (narrow) field of view
      const A = fov * DEG * 0.011;
      yaw += A * wob(t, 0.55, 1); pitch += A * 0.8 * wob(t, 0.47, 4); roll += A * 0.6 * wob(t, 0.35, 7);
    }
    setCam(camera, pos, { yaw, pitch }, roll, fov, aspect);
  }

  update(duration / 2);
  const info = {
    framing, moves, kind: base.kind, binoculars: bino,
    pos: base.pos.toArray().map((x) => +x.toFixed(2)), pivot: base.pivot.toArray().map((x) => +x.toFixed(2)),
    fov: +base.fov.toFixed(1), distance: +dist0.toFixed(2), notes,
  };
  return { update, info, framing, moves, basePosition: base.pos.clone(), pivot: base.pivot.clone() };
}

function setCam(camera, pos, { yaw, pitch }, roll, fov, aspect) {
  camera.position.copy(pos);
  camera.rotation.order = 'YXZ';
  // three.js camera looks down −Z: yaw = atan2(dx, dz) of the look direction → rotation.y = yaw + π
  camera.rotation.set(pitch, yaw + Math.PI, roll || 0);
  if (Math.abs(camera.fov - fov) > 1e-6 || (aspect && Math.abs(camera.aspect - aspect) > 1e-6)) {
    camera.fov = fov; if (aspect) camera.aspect = aspect; camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
}
