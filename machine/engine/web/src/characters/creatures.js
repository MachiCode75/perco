// v2 creature archetypes (ARCHITECTURE v2). Every builder returns the §3 Character object.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cached, mulberry, col } from './util.js';
import { normalizeSpec, normFace, normPose, POSES, FACES } from './spec.js';
import { createHumanoid, mesh, colMat, texMat } from './humanoid.js';
import { faceTexture, furryFaceTexture, moonTexture, irisTexture, eyeTexture } from './textures.js';
import { Builder, M, HEAD_H, HEAD_D } from './geometry.js';

const TAU = Math.PI * 2;
const RAW_POSE_OK = (id) => { const s = String(id || '').toLowerCase().trim(); return normPose(s) !== 'stand' || s === 'stand'; };
/** unknown poses → fallback (creatures idle instead of standing still) */
const mapPose = (table, fallback) => (id) => { const p = normPose(id); if (!RAW_POSE_OK(id)) return fallback; return table[p] || p; };

function deep(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v === undefined || v === null) continue;
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) ? { ...base[k], ...v } : v;
  }
  return out;
}

// ------------------------------------------------------------------ fur
/** Shaggy fur blob: rounded core + many outward/downward pyramid strands (merged, cached). */
function furGeometry(ctx, key, w, h, d, { density = 9, len = [0.2, 0.42], rad = [0.1, 0.17], down = 1.0, exclude = null, seed = 1 } = {}) {
  return cached(ctx, `chr:geo:fur:${key}:${w}:${h}:${d}:${density}:${down}`, () => {
    const b = new Builder();
    b.add(new RoundedBoxGeometry(w * 0.92, h * 0.96, d * 0.92, 2, Math.min(w, h, d) * 0.34));
    const r = mulberry(seed * 7919 + 13);
    const faces = [
      { n: [0, 0, 1], a: w * h }, { n: [0, 0, -1], a: w * h }, { n: [1, 0, 0], a: d * h }, { n: [-1, 0, 0], a: d * h }, { n: [0, 1, 0], a: w * d * 0.8 },
    ];
    const tot = faces.reduce((s, f) => s + f.a, 0);
    const N = Math.round(tot * density);
    const V = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      let pick = r() * tot, f = faces[0];
      for (const ff of faces) { pick -= ff.a; if (pick <= 0) { f = ff; break; } }
      const [nx, ny, nz] = f.n;
      const u = r() - 0.5, v = r() - 0.5;
      let x, y, z;
      if (nz) { x = u * w * 0.96; y = v * h * 0.96; z = nz * d * 0.44; }
      else if (nx) { x = nx * w * 0.44; y = v * h * 0.96; z = u * d * 0.96; }
      else { x = u * w * 0.9; y = h * 0.47; z = v * d * 0.9; }
      if (exclude && exclude(x, y, z, f.n)) continue;
      // push corners outward so the silhouette is rounded-shaggy (top strands lie flat, combed outward)
      const dir = ny > 0 ? V.set(x / w * 2.2, 0.45, z / d * 2.2 - 0.2).normalize() : V.set(nx + x / w * 0.9, y / h * 0.5 - down, nz + z / d * 0.9).normalize();
      dir.x += (r() - 0.5) * 0.5; dir.y += (r() - 0.5) * 0.4; dir.z += (r() - 0.5) * 0.5;
      b.spike(new THREE.Vector3(x, y, z), dir.clone(), len[0] + r() * (len[1] - len[0]), rad[0] + r() * (rad[1] - rad[0]), r() * 3, 4);
    }
    return b.build();
  });
}
function furMat(ctx, color) {
  return cached(ctx, 'chr:mat:fur:' + color, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 1, metalness: 0, flatShading: true }));
}

function furryGiant(ctx, raw) {
  const color = col(raw.furColor || (raw.shirt && raw.shirt.colors && raw.shirt.colors[0]), '#161616');
  const spec = normalizeSpec(deep({ build: 'adult', face: 'teeth', hair: { style: 'bald' } }, { ...raw, creature: 'furry_giant' }));
  spec.scale = typeof raw.scale === 'number' ? spec.scale : 2.3;
  spec.stretch = { arms: 1.7, legs: 0.8, torso: 1.3, neck: -0.45, ...(raw.stretch && typeof raw.stretch === 'object' ? raw.stretch : {}) };
  const st = spec.stretch;
  const W = 1.35, D = 1.5, LW = 1.25;
  const fm = furMat(ctx, color);
  const faceOk = ['teeth', 'creepy_grin', 'scream', 'hollow', 'blank'];
  let facePlane = null;
  return createHumanoid(ctx, spec, {
    width: W, depth: D, limb: LW, shoulderIn: 0.2, hairless: true, noNeck: true, heightExtra: 0.4,
    parts: {
      torso: { geo: furGeometry(ctx, 'torso', 2 * W, 2 * st.torso, D, { seed: 1 }), mat: fm },
      arm: { geo: furGeometry(ctx, 'arm', LW, 2 * st.arms, LW, { seed: 2, down: 1.3 }), mat: fm },
      leg: { geo: furGeometry(ctx, 'leg', LW, 2 * st.legs, LW, { seed: 3, density: 7 }), mat: fm },
    },
    head: {
      build(head) {
        const hg = furGeometry(ctx, 'head', 1.8, 1.55, 1.6, { seed: 4, density: 11, down: 0.6, len: [0.22, 0.5], exclude: (x, y, z, n) => n[2] > 0 && Math.abs(x) < 0.62 && y > -0.62 && y < 0.36 });
        const m = mesh(hg, fm); m.position.y = 0.1; head.add(m);
        facePlane = new THREE.Mesh(cached(ctx, 'chr:geo:furface', () => new THREE.PlaneGeometry(1.55, 1.3)), null);
        facePlane.position.set(0, 0.12, 0.79); facePlane.renderOrder = 3; head.add(facePlane);
        return { setFace(f) { facePlane.material = cached(ctx, 'chr:mat:furface:' + f + ctx.quality, () => new THREE.MeshBasicMaterial({ map: furryFaceTexture(ctx, f), transparent: true, depthWrite: false })); } };
      },
    },
    faceMap: (id) => { const f = normFace(id); return faceOk.includes(f) ? f : (f === 'grin' || f === 'smile' || f === 'happy' ? 'teeth' : f === 'cry' || f === 'angry' ? 'scream' : 'teeth'); },
    poseMap: mapPose({ stand: 'hunch', idle: 'hunch', walk: 'lumber', run: 'lumber', wade: 'lumber', loom: 'loom', lean: 'loom', look_down: 'loom', reach: 'reach', point: 'reach', hug: 'reach', arms_up: 'reach', wave: 'reach', hold_sign: 'reach', carry: 'reach', binoculars: 'hunch', talk: 'hunch', cry: 'hunch', shrug: 'hunch' }, 'hunch'),
    defaultPose: 'hunch', timeScale: 0.9,
  });
}

// ------------------------------------------------------------------ shadow with many eyes
function shadowEyes(ctx, raw) {
  const spec = normalizeSpec(deep({ build: 'adult', skin: '#22122f', hair: { style: 'bald' }, face: 'blank' }, { ...raw, creature: 'shadow_eyes' }));
  spec.scale = typeof raw.scale === 'number' ? spec.scale : 1.45;
  spec.stretch = { arms: 1.45, legs: 1.45, torso: 1.2, neck: 0.15, ...(raw.stretch && typeof raw.stretch === 'object' ? raw.stretch : {}) };
  const bodyCol = col(raw.bodyColor, '#2a1838');
  const dark = cached(ctx, 'chr:mat:shadowbody:' + bodyCol, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(bodyCol), emissive: new THREE.Color('#14071f'), roughness: 0.85 }));
  const eyeSets = [];
  return createHumanoid(ctx, spec, {
    hairless: true, neckMat: dark,
    parts: { torso: { mat: dark }, arm: { mat: dark }, leg: { mat: dark } },
    headMat: () => cached(ctx, 'chr:mat:shadowhead:' + ctx.quality, () => { const t = faceTexture(ctx, 'shadow', '#22122f'); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.85, roughness: 0.85 }); }),
    faceMap: () => 'shadow',
    extras(rig) {
      const { dims } = rig;
      // spikes on the head + shoulders
      const spikes = cached(ctx, 'chr:geo:shadowspikes', () => {
        const b = new Builder(), r = mulberry(31);
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * Math.PI * 1.6 - Math.PI * 0.8, up = 0.35 + r() * 0.5;
          const base = new THREE.Vector3(Math.sin(a) * 0.45, HEAD_H / 2 - 0.05, Math.cos(a) * 0.4 - 0.12);
          b.spike(base, new THREE.Vector3(Math.sin(a) * (0.9 - up * 0.5), up + 0.3, Math.cos(a) * 0.6 - 0.35), 0.55 + r() * 0.5, 0.09 + r() * 0.05, r() * 3);
        }
        return b.build();
      });
      rig.head.add(mesh(spikes, cached(ctx, 'chr:mat:shadowspike', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#0e0714'), roughness: 0.6, flatShading: true }))));
      // many eyes (one instanced mesh per body part so they follow the limbs)
      const eg = cached(ctx, 'chr:geo:eyequad', () => new THREE.PlaneGeometry(1, 0.62));
      const em = cached(ctx, 'chr:mat:eyequad', () => new THREE.MeshBasicMaterial({ map: eyeTexture(ctx), transparent: true, alphaTest: 0.35, toneMapped: false }));
      const r = mulberry(4242);
      const addSet = (parent, n, place) => {
        const im = new THREE.InstancedMesh(eg, em, n); im.castShadow = false; im.frustumCulled = false;
        const base = [];
        for (let i = 0; i < n; i++) {
          const [x, y, z, s, ry] = place(r);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, (r() - 0.5) * 0.5)), new THREE.Vector3(s, s, s));
          im.setMatrixAt(i, m); base.push({ m, s, off: r() * 9, x, y, z, ry, rz: (r() - 0.5) * 0.5 });
        }
        parent.add(im); eyeSets.push({ im, base });
      };
      const tz = 0.5 * dims.D + 0.012;
      addSet(rig.upper, 26, (r) => [(r() - 0.5) * 1.7, 0.3 + r() * (dims.torsoH - 0.6), tz, 0.2 + r() * 0.16, 0]);
      addSet(rig.upper, 10, (r) => [(r() - 0.5) * 1.7, 0.3 + r() * (dims.torsoH - 0.6), -tz, 0.12 + r() * 0.1, Math.PI]);
      for (const [arm, s] of [[rig.armL, 1], [rig.armR, -1]]) addSet(arm, 9, (r) => { const side = r() < 0.6; return side ? [(r() - 0.5) * 0.8, dims.handY + 0.3 + r() * (dims.armLen - 0.7), 0.512, 0.16 + r() * 0.1, 0] : [s * 0.512, dims.handY + 0.3 + r() * (dims.armLen - 0.7), (r() - 0.5) * 0.8, 0.16 + r() * 0.1, s * Math.PI / 2]; });
      for (const leg of [rig.legL, rig.legR]) addSet(leg, 6, (r) => [(r() - 0.5) * 0.8, -0.3 - r() * (dims.legLen - 0.6), 0.512, 0.15 + r() * 0.1, 0]);
    },
    update(t) {
      // deterministic blinking
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      for (const set of eyeSets) {
        for (let i = 0; i < set.base.length; i++) {
          const b = set.base[i], ph = (t * 0.33 + b.off) % 3.0;
          const k = ph < 0.16 ? Math.abs(ph - 0.08) / 0.08 : 1;
          m.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.ry, b.rz)), sc.set(b.s, b.s * Math.max(0.08, k), b.s));
          set.im.setMatrixAt(i, m);
        }
        set.im.instanceMatrix.needsUpdate = true;
      }
    },
    poseMap: mapPose({ stand: 'creep', idle: 'creep' }, 'creep'), defaultPose: 'creep', timeScale: 0.8, topExtra: 0.8, heightExtra: 0.6,
  });
}

// ------------------------------------------------------------------ tall thin / stretched / doll / scarecrow (humanoid presets)
function tallThin(ctx, raw) {
  const spec = normalizeSpec(deep({ build: 'adult', skin: '#e9e9e9', hair: { style: 'bald' }, shirt: { pattern: 'suit', colors: ['#18181b', '#efefef', '#151515'] }, pants: { style: 'pants', color: '#18181b' }, face: 'blank' }, { ...raw, creature: 'tall_thin' }));
  spec.stretch = { arms: 2.3, legs: 2.1, torso: 1.45, neck: 0.7, ...(raw.stretch && typeof raw.stretch === 'object' ? raw.stretch : {}) };
  return createHumanoid(ctx, spec, { width: 0.62, depth: 0.7, limb: 0.55, poseMap: mapPose({ stand: 'creep', idle: 'creep' }, 'creep'), defaultPose: 'creep', timeScale: 0.7 });
}
function stretched(ctx, raw) {
  const spec = normalizeSpec({ ...raw, creature: 'stretched', face: raw.face && raw.face !== 'smile' ? raw.face : 'creepy_grin' });
  spec.stretch = { arms: 2.1, legs: 1.9, torso: 1.3, neck: 0.55, ...(raw.stretch && typeof raw.stretch === 'object' ? raw.stretch : {}) };
  return createHumanoid(ctx, spec, { poseMap: mapPose({ idle: 'creep' }, 'creep'), timeScale: 0.75 });
}
function doll(ctx, raw) {
  const spec = normalizeSpec(deep({ build: 'kid', skin: '#f8eee8', hair: { style: 'long', color: '#3b2416' }, shirt: { pattern: 'dress', colors: ['#f2b6c9', '#ffffff'] }, pants: { style: 'none' }, accessories: ['bow'], face: 'doll' }, { ...raw, creature: 'doll' }));
  const own = ['creepy_grin', 'hollow', 'wide_eyes', 'blank', 'teeth', 'scream'];
  return createHumanoid(ctx, spec, {
    faceMap: (id) => { const f = normFace(id); return own.includes(f) ? f : 'doll'; },
    headMat: (f) => texMat(ctx, faceTexture(ctx, f === 'doll' ? 'doll' : f, spec.skin, spec.eyes === 'normal' ? 'normal' : spec.eyes)),
    poseMap: mapPose({ idle: 'creep' }, 'creep'), timeScale: 0.7,
  });
}
// faceTexture() falls back to 'smile' for unknown ids → register the internal doll face through normFace bypass
function scarecrow(ctx, raw) {
  const spec = normalizeSpec(deep({ build: 'adult', skin: '#c9a56b', hair: { style: 'bald' }, shirt: { pattern: 'plaid', colors: ['#b5462f', '#3a2a1a'], sleeves: 'long' }, pants: { style: 'pants', color: '#4a6a9a', pattern: 'jeans' } }, { ...raw, creature: 'scarecrow' }));
  return createHumanoid(ctx, spec, {
    faceMap: () => 'scarecrow',
    headMat: () => texMat(ctx, faceTexture(ctx, 'scarecrow', spec.skin, spec.eyes === 'normal' ? 'normal' : spec.eyes)),
    extras(rig) {
      const straw = colMat(ctx, '#e3c15a', 'straw', { flatShading: true, roughness: 0.9 });
      const hat = cached(ctx, 'chr:geo:strawhat', () => { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.5, 0.62, 0.55, 8), M(0, HEAD_H / 2 + 0.3, -0.02, -0.08, 0, 0.06)); b.add(new THREE.CylinderGeometry(1.25, 1.25, 0.06, 10), M(0, HEAD_H / 2 + 0.04, 0, -0.08, 0, 0.06)); return b.build(); });
      rig.head.add(mesh(hat, colMat(ctx, '#c9a24a', 'straw', { flatShading: true, roughness: 0.9 })));
      const tuft = cached(ctx, 'chr:geo:tuft', () => { const b = new Builder(), r = mulberry(5); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; b.spike(new THREE.Vector3(Math.sin(a) * 0.3, 0.05, Math.cos(a) * 0.3), new THREE.Vector3(Math.sin(a) * 0.5, -1, Math.cos(a) * 0.5), 0.35 + r() * 0.25, 0.08, r() * 3, 3); } return b.build(); });
      for (const a of [rig.armL, rig.armR]) { const m = mesh(tuft, straw); m.position.y = rig.dims.handY; a.add(m); }
      for (const l of [rig.legL, rig.legR]) { const m = mesh(tuft, straw); m.position.y = -rig.dims.legLen; l.add(m); }
      const collar = mesh(tuft, straw); collar.position.y = rig.dims.torsoH + 0.08; collar.scale.set(1.6, 0.6, 1.4); collar.rotation.x = Math.PI; rig.upper.add(collar);
    },
    poseMap: mapPose({ stand: 'arms_out', idle: 'arms_out' }, 'arms_out'), defaultPose: 'arms_out',
  });
}

// ------------------------------------------------------------------ sky face (giant moon)
function skyFace(ctx, raw) {
  const spec = normalizeSpec({ ...raw, creature: 'sky_face' });
  const scale = typeof raw.scale === 'number' ? spec.scale : 5;
  const R = 2.6, glow = col(raw.glowColor, '#ffc21a');
  const phase = typeof ctx.rng === 'function' ? ctx.rng() * 10 : 0;
  const root = new THREE.Group(); root.name = 'creature:sky_face';
  root.scale.setScalar(scale);
  const pivot = new THREE.Group(); pivot.position.y = R; root.add(pivot);
  const face = new THREE.Group(); pivot.add(face);
  const tex = moonTexture(ctx);
  const moonMat = cached(ctx, 'chr:mat:moon:' + ctx.quality, () => new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#9fb0d8'), emissiveIntensity: 0.38, roughness: 0.95 }));
  face.add(mesh(cached(ctx, 'chr:geo:moon', () => new THREE.SphereGeometry(R, 48, 32)), moonMat));
  const dirOf = (az, el, r = R) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(r);
  const D2R = Math.PI / 180;
  // eyes: bulging socket ball + glowing iris disc
  const irisM = cached(ctx, 'chr:mat:iris:' + glow, () => new THREE.MeshBasicMaterial({ map: irisTexture(ctx, glow), toneMapped: false }));
  const ballM = cached(ctx, 'chr:mat:eyeball', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#d8a640'), emissive: new THREE.Color('#5a2a00'), roughness: 0.4 }));
  const irises = [];
  for (const s of [-1, 1]) {
    const p = dirOf(s * 18 * D2R, 10 * D2R, R * 0.92);
    const ball = mesh(cached(ctx, 'chr:geo:moonball', () => new THREE.SphereGeometry(R * 0.23, 20, 14)), ballM); ball.position.copy(p); ball.scale.set(1, 0.85, 0.75); face.add(ball);
    const iris = new THREE.Mesh(cached(ctx, 'chr:geo:iris', () => new THREE.CircleGeometry(R * 0.19, 28)), irisM);
    iris.position.copy(dirOf(s * 18 * D2R, 10 * D2R, R * 0.92 + R * 0.175)); iris.lookAt(iris.position.clone().multiplyScalar(2)); face.add(iris); irises.push(iris);
    // angry brow ridge (inner end low)
    const brow = mesh(cached(ctx, 'chr:geo:moonbrow', () => new RoundedBoxGeometry(R * 0.5, R * 0.14, R * 0.2, 2, R * 0.05)), moonMat);
    brow.position.copy(dirOf(s * 17 * D2R, 24 * D2R, R * 0.99)); brow.lookAt(brow.position.clone().multiplyScalar(2)); brow.rotateZ(-s * 0.38); face.add(brow);
  }
  // nose
  const nose = mesh(cached(ctx, 'chr:geo:moonnose', () => new RoundedBoxGeometry(R * 0.2, R * 0.3, R * 0.22, 2, R * 0.08)), moonMat);
  nose.position.copy(dirOf(0, -6 * D2R, R * 0.97)); nose.lookAt(nose.position.clone().multiplyScalar(2)); nose.rotateX(0.25); face.add(nose);
  // crooked teeth (upper + lower rows)
  const teeth = cached(ctx, 'chr:geo:moonteeth', () => {
    const b = new Builder(), r = mulberry(77);
    for (const [el, n, h, dir] of [[-21.5, 13, 0.17, -1], [-31, 11, 0.13, 1]]) {
      for (let i = 0; i < n; i++) {
        const az = (-36 + 72 * (i + 0.5) / n) * D2R, e = (el + Math.pow(Math.abs(az / D2R) / 36, 2) * (dir > 0 ? -2 : 4)) * D2R;
        const p = dirOf(az, e, R * 0.985);
        const hh = R * h * (0.75 + r() * 0.5), ww = R * (dir < 0 ? 0.1 : 0.09) * (0.85 + r() * 0.3);
        const g = new RoundedBoxGeometry(ww, hh, R * 0.09, 1, ww * 0.25);
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), p, new THREE.Vector3(0, 1, 0)));
        const m = new THREE.Matrix4().compose(p.clone().add(new THREE.Vector3(0, dir * hh * 0.25, 0)), q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, (r() - 0.5) * 0.35))), new THREE.Vector3(1, 1, 1));
        b.add(g, m);
      }
    }
    return b.build();
  });
  face.add(mesh(teeth, cached(ctx, 'chr:mat:moonteeth', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#efe3b8'), emissive: new THREE.Color('#3a3020'), roughness: 0.55 }))));

  let pose = 'idle', poseOpts = {}, lastT = 0;
  const POSE_SET = { idle: 1, loom: 1, reach: 1, walk: 1 };
  function update(t) {
    t = +t || 0; lastT = t; const tt = t + phase;
    const loom = pose === 'loom' ? 1 : pose === 'reach' ? 0.6 : 0;
    face.rotation.set(0.25 * loom + 0.035 * Math.sin(TAU * tt / 6.3), 0.06 * Math.sin(TAU * tt / 8.1) + (pose === 'walk' ? 0.12 * Math.sin(TAU * tt / 4) : 0), 0.04 * Math.sin(TAU * tt / 7.3));
    pivot.position.y = R + 0.06 * R * Math.sin(TAU * tt / 5.2) - loom * 0.08 * R;
    pivot.position.z = loom * 0.12 * R;
    const k = 1 + 0.05 * Math.sin(TAU * tt * 0.9);
    for (const i of irises) i.scale.setScalar(k);
  }
  function anchors() {
    root.updateWorldMatrix(true, true);
    const w = (o, x, y, z) => o.localToWorld(new THREE.Vector3(x, y, z));
    const eyes = w(face, 0, Math.sin(11 * D2R) * R, R);
    return { head: w(face, 0, 0, 0), eyes, chest: w(face, 0, -0.4 * R, R * 0.9), hands: w(face, 0, -0.5 * R, R), handL: w(face, 0.5 * R, -0.5 * R, R * 0.8), handR: w(face, -0.5 * R, -0.5 * R, R * 0.8), feet: w(root, 0, 0, 0), top: w(face, 0, R, 0) };
  }
  const ch = {
    root, height: 2 * R * scale, spec, creature: 'sky_face',
    setFace() { /* the moon keeps its face */ },
    setPose(id, opts) { const p = normPose(id); pose = POSE_SET[p] ? p : (p === 'look_down' || p === 'lean' ? 'loom' : p === 'run' ? 'walk' : 'idle'); poseOpts = opts || {}; update(lastT); },
    setProp() { }, update, anchors,
    get face() { return 'creepy_grin'; }, get pose() { return pose; },
    joints: { body: pivot, head: face },
  };
  root.userData.character = ch;
  ch.setPose('idle');
  return ch;
}

const BUILDERS = { furry_giant: furryGiant, sky_face: skyFace, shadow_eyes: shadowEyes, tall_thin: tallThin, stretched, doll, scarecrow };
export function buildCreature(ctx, id, raw) {
  const fn = BUILDERS[id];
  return fn ? fn(ctx, raw || {}) : null;
}
export { FACES, POSES };
