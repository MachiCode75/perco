// Browser runtime. Contract: ARCHITECTURE.md §6. Owner: engine-core.
//
//   await window.engine.init({ width, height, quality })
//   await window.engine.loadShot(resolvedShot)   → { ok, ms, warnings, camera, actors }
//   window.engine.renderFrame(t[, mime, quality]) → data URL (JPEG by default) of the frame at t seconds
//   window.engine.setOptions({ quality, shadows, jpegQuality, exposure, maxShadowMap, shadowFollow })
//   window.engine.info() / window.engine.capabilities()
//
// Robustness rule: unknown values never throw — they fall back and log `console.warn('[engine] …')`.
import * as THREE from 'three';
import * as characters from './src/characters/index.js';
import * as world from './src/world/index.js';
import * as director from './src/director/index.js';

const VERSION = 2;
const DEG = Math.PI / 180;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const options = { quality: 'final', shadows: true, jpegQuality: 0.92, exposure: null, maxShadowMap: 4096, shadowFollow: true, pointShadows: true, faceFill: 1, baseZoom: null };
let ctx = null; let state = null;

// ---- track async texture loads so loadShot can wait for them
let pendingLoads = 0;
{
  const m = THREE.DefaultLoadingManager; const s = m.itemStart.bind(m); const e = m.itemEnd.bind(m);
  m.itemStart = (u) => { pendingLoads++; s(u); };
  m.itemEnd = (u) => { pendingLoads = Math.max(0, pendingLoads - 1); e(u); };
}

// ---- warnings (deduplicated per shot)
function W(msg) {
  msg = String(msg);
  if (state) { if (state.warnings.includes(msg)) return; state.warnings.push(msg); }
  console.warn('[engine] ' + msg);
}
function safe(label, fn, fallback) {
  try { return fn(); } catch (e) { W(`${label}: ${e && e.message ? e.message : e}`); return fallback; }
}
const listOf = (mod, k) => { try { return Array.isArray(mod[k]) ? mod[k] : []; } catch (e) { return []; } };

// ---------------------------------------------------------------- scene lifecycle
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'envMap', 'lightMap', 'displacementMap', 'specularMap', 'gradientMap'];
function disposeScene(scene) {
  if (!scene) return;
  const keep = new Set(ctx.textures.values());
  const doneG = new Set(); const doneM = new Set();
  scene.traverse((o) => {
    if (o.geometry && !doneG.has(o.geometry)) { doneG.add(o.geometry); try { o.geometry.dispose(); } catch (e) { /* */ } }
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of ms) {
      if (doneM.has(m)) continue; doneM.add(m);
      for (const k of TEX_KEYS) { const t = m[k]; if (t && t.isTexture && !keep.has(t)) try { t.dispose(); } catch (e) { /* */ } }
      try { m.dispose(); } catch (e) { /* */ }
    }
    if (o.isLight && o.shadow && o.shadow.map) { try { o.shadow.map.dispose(); } catch (e) { /* */ } o.shadow.map = null; }
  });
  for (const k of ['background', 'environment']) { const t = scene[k]; if (t && t.isTexture && !keep.has(t)) try { t.dispose(); } catch (e) { /* */ } }
}

function fallbackSet() {
  const group = new THREE.Group();
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#6a9a45' }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; group.add(g);
  const crowd = []; for (let i = 0; i < 12; i++) crowd.push({ x: -13 + i * 2.4, y: 0, z: -8, yaw: 0 });
  return {
    group, interior: false, waterLevel: null,
    marks: { A: { x: 0, y: 0, z: 0, yaw: 0 }, B: { x: 3, y: 0, z: 0, yaw: 0 }, C: { x: -3, y: 0, z: 0, yaw: 0 }, D: { x: 0, y: 0, z: -4, yaw: 0 }, crowd },
    pois: {}, cameraHints: { establishing: { pos: [0, 9, 28], target: [0, 2, 0], fov: 50 }, wide: { pos: [0, 4, 20], target: [0, 2.5, 0], fov: 50 }, aerial: { pos: [0, 55, 38], target: [0, 0, -10], fov: 50 } },
    update() {},
  };
}
function normalizeSet(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.isObject3D) s = { group: s };
  if (!s.group || !s.group.isObject3D) return null;
  s.marks = s.marks && typeof s.marks === 'object' ? s.marks : {};
  s.pois = s.pois && typeof s.pois === 'object' ? s.pois : {};
  s.cameraHints = s.cameraHints && typeof s.cameraHints === 'object' ? s.cameraHints : {};
  if (typeof s.waterLevel !== 'number' || !isFinite(s.waterLevel)) s.waterLevel = null;
  return s;
}
function fallbackEnvironment(time) {
  const night = time === 'night' || time === 'dusk';
  ctx.scene.background = new THREE.Color(night ? '#0b1630' : '#8fc1ee');
  ctx.scene.add(new THREE.HemisphereLight('#dfefff', '#6b5a40', night ? 0.4 : 1.3));
  const d = new THREE.DirectionalLight(night ? '#8899ff' : '#ffffff', night ? 0.4 : 2.0);
  d.position.set(20, 40, 25); d.castShadow = true; d.shadow.mapSize.set(2048, 2048);
  Object.assign(d.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }); ctx.scene.add(d);
}

// ---------------------------------------------------------------- shot helpers
const CAMERA_REL = ['camera', 'left', 'right', 'away'];
const DEPTH_WORDS = { wading: 0.28, wade: 0.28, ankle: 0.08, ankles: 0.08, knee: 0.28, knees: 0.28, thigh: 0.38, waist: 0.5, hips: 0.45, chest: 0.66, shoulders: 0.8, shoulder: 0.8, neck: 0.82, head: 0.95, submerged: 1.15, under: 1.15, underwater: 1.15 };
function depthUnits(d, H) {
  if (d == null || d === false) return 0;
  if (typeof d === 'number') return isFinite(d) ? d : 0;
  const s = String(d).toLowerCase().trim();
  if (isFinite(parseFloat(s))) return parseFloat(s);
  if (s in DEPTH_WORDS) return DEPTH_WORDS[s] * H;
  W(`unknown depth "${d}" → 0`); return 0;
}

function makeResolver(set, actorsById, colliders) {
  const ray = new THREE.Raycaster();
  const refY = num(set.marks?.A?.y, 0);
  function groundAt(x, z, fromY) {
    ray.set(new THREE.Vector3(x, num(fromY, refY) + 3.2, z), new THREE.Vector3(0, -1, 0)); ray.near = 0; ray.far = 80;
    let h = []; try { h = ray.intersectObjects(colliders(), false); } catch (e) { h = []; }
    return h.length ? h[0].point.y : null;
  }
  function parse(ref) {
    const s = String(ref).trim(); const i = s.indexOf(':');
    if (i > 0) {
      const kind = s.slice(0, i).toLowerCase(); const name = s.slice(i + 1);
      if (kind === 'extra') return { kind: 'actor', name: s };
      return { kind, name };
    }
    if (actorsById[s]) return { kind: 'actor', name: s };
    if (set.marks?.[s] && !Array.isArray(set.marks[s])) return { kind: 'mark', name: s };
    if (set.pois?.[s]) return { kind: 'poi', name: s };
    return { kind: '?', name: s };
  }
  function point(ref) { // → THREE.Vector3 | null (positions only)
    if (ref == null || ref === '') return null;
    if (Array.isArray(ref)) return ref.length >= 3 ? new THREE.Vector3(num(ref[0], 0), num(ref[1], 0), num(ref[2], 0)) : new THREE.Vector3(num(ref[0], 0), groundAt(num(ref[0], 0), num(ref[1], 0)) ?? refY, num(ref[1], 0));
    if (typeof ref === 'object') { if (ref.isVector3) return ref.clone(); const x = num(ref.x, 0), z = num(ref.z, 0); return new THREE.Vector3(x, typeof ref.y === 'number' ? ref.y : (groundAt(x, z) ?? refY), z); }
    const { kind, name } = parse(ref);
    if (kind === 'actor' && actorsById[name]) { const p = new THREE.Vector3(); actorsById[name].character.root.getWorldPosition(p); return p; }
    if (kind === 'mark') { const m = set.marks?.[name]; if (m && typeof m.x === 'number') return new THREE.Vector3(m.x, num(m.y, 0), m.z); }
    if (kind === 'crowd') { const m = set.marks?.crowd?.[+name]; if (m) return new THREE.Vector3(m.x, num(m.y, 0), m.z); }
    if (kind === 'poi') { const p = set.pois?.[name]; if (p) return Array.isArray(p) ? new THREE.Vector3(num(p[0], 0), num(p[1], 0), num(p[2], 0)) : new THREE.Vector3(num(p.x, 0), num(p.y, 0), num(p.z, 0)); }
    return null;
  }
  return { point, parse, groundAt };
}

const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// ---------------------------------------------------------------- engine API
window.engine = {
  version: VERSION,

  async init({ width = 720, height = 1280, quality = 'final', antialias = true, ...rest } = {}) {
    if (ctx) { // re-init: resize only
      ctx.renderer.setSize(width, height); ctx.width = width; ctx.height = height; ctx.quality = options.quality = quality;
      ctx.camera.aspect = width / height; ctx.camera.updateProjectionMatrix();
      this.setOptions(rest); window.__ready = true; return true;
    }
    const renderer = new THREE.WebGLRenderer({ antialias, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.setSize(width, height);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 3000);
    options.quality = quality;
    ctx = { THREE, scene: new THREE.Scene(), renderer, camera, rng: mulberry32(1), textures: new Map(), quality, width, height };
    this.setOptions(rest);
    window.__ready = true;
    return true;
  },

  setOptions(o = {}) {
    if (!o || typeof o !== 'object') return { ...options };
    for (const k of Object.keys(o)) {
      if (!(k in options)) { console.warn(`[engine] unknown option "${k}" ignored`); continue; }
      options[k] = o[k];
    }
    if (ctx) {
      ctx.quality = options.quality;
      ctx.renderer.shadowMap.enabled = !!options.shadows;
      if (options.exposure != null) ctx.renderer.toneMappingExposure = num(+options.exposure, 1);
    }
    return { ...options };
  },

  capabilities() {
    return {
      version: VERSION,
      FRAMINGS: director.FRAMINGS, MOVES: director.MOVES,
      SETS: listOf(world, 'SETS'), PROPS: listOf(world, 'PROPS'),
      FACES: listOf(characters, 'FACES'), POSES: listOf(characters, 'POSES'), HAIR_STYLES: listOf(characters, 'HAIR_STYLES'),
      SHIRT_PATTERNS: listOf(characters, 'SHIRT_PATTERNS'), PROPS_HELD: listOf(characters, 'PROPS_HELD'),
    };
  },

  async loadShot(shot = {}) {
    if (!ctx) await this.init({});
    const T0 = performance.now();
    if (state) { disposeScene(ctx.scene); }
    shot = (shot && typeof shot === 'object') ? shot : {};
    const seed = (num(shot.seed, null) ?? hashStr(shot.id || 'shot')) >>> 0;
    state = { shot, warnings: [], actorList: [], walkers: [], set: null, cam: null, info: null, setId: null, ready: false };
    const scene = new THREE.Scene(); ctx.scene = scene; ctx.rng = mulberry32(seed || 1);
    ctx.shot = shot;
    const R = ctx.renderer;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0; R.setClearColor(0x000000, 1);
    R.shadowMap.enabled = !!options.shadows;
    const cam = ctx.camera; cam.near = 0.1; cam.far = 3000; cam.zoom = 1; cam.aspect = ctx.width / ctx.height; cam.updateProjectionMatrix();
    const duration = Math.max(0.05, num(shot.duration, 1.5));

    // ---------------- set
    const SETS = listOf(world, 'SETS');
    let setId = String(shot.set || SETS[0] || 'lake_dock');
    if (SETS.length && !SETS.includes(setId)) W(`unknown set "${setId}" (world module may fall back)`);
    let set = null;
    try { set = normalizeSet(await world.createSet(ctx, setId, shot.setOptions || {})); } catch (e) { W(`createSet("${setId}") failed: ${e.message}`); }
    if (!set && SETS.length && SETS[0] !== setId) {
      try { set = normalizeSet(await world.createSet(ctx, SETS[0], {})); W(`using set "${SETS[0]}" instead`); setId = SETS[0]; } catch (e) { W(`createSet("${SETS[0]}") failed: ${e.message}`); }
    }
    if (!set) { set = fallbackSet(); W('using built-in fallback set'); }
    // per-shot view of the (cached, shared) set: shot props register pois without leaking into later shots
    set = { ...set, pois: { ...set.pois } };
    state.set = set; state.setId = setId;
    scene.add(set.group);

    // ---------------- environment
    const interior = shot.interior != null ? !!shot.interior : !!set.interior;
    const time = shot.time || 'day', weather = shot.weather || 'clear';
    const power = shot.power || shot.setOptions?.power || 'on';
    try { await world.applyEnvironment(ctx, { time, weather, interior, set: setId, power }); } catch (e) { W(`applyEnvironment failed: ${e.message}`); fallbackEnvironment(time); }
    if (options.exposure != null) R.toneMappingExposure = num(+options.exposure, 1);
    if (typeof shot.exposure === 'number') R.toneMappingExposure *= shot.exposure;

    // ---------------- placed props (optional extension: shot.props = [{ type, at, yaw, scale, opts }])
    let colliderCache = null;
    const colliders = () => (colliderCache ||= director.collectColliders(THREE, set));
    const actorsById = {};
    const res = makeResolver(set, actorsById, colliders);
    // Props live in a per-shot group (the set group is cached across shots). Each prop registers a poi
    // (its name, or type, type2, …) at userData.focus or its bounding-box centre so shots can frame it;
    // userData.update(t) animates it.
    state.props = [];
    const propGroup = new THREE.Group(); propGroup.name = 'shot-props'; scene.add(propGroup);
    for (const p of Array.isArray(shot.props) ? shot.props : []) {
      const id = p && (p.type || p.id); if (!id) continue;
      const obj = safe(`createProp("${id}")`, () => world.createProp(ctx, id, p.opts || {}), null);
      if (!obj || !obj.isObject3D) { W(`prop "${id}" not created`); continue; }
      const atRef = p.at ?? p.mark;
      const at = res.point(atRef);
      if (!at && atRef != null) W(`prop "${id}": position "${JSON.stringify(atRef)}" not found → origin`);
      obj.position.copy(at || new THREE.Vector3());
      if (Array.isArray(p.offset)) obj.position.add(new THREE.Vector3(num(p.offset[0], 0), num(p.offset[1], 0), num(p.offset[2], 0)));
      obj.rotation.y = num(p.yaw, 0) * DEG; if (num(p.scale, 0) > 0) obj.scale.setScalar(p.scale);
      propGroup.add(obj); obj.updateMatrixWorld(true);
      safe(`prop ${id} update(0)`, () => obj.userData.update?.(0));
      const f = obj.userData.focus;
      let c;
      if (f && typeof f.x === 'number') c = obj.localToWorld(new THREE.Vector3(f.x, num(f.y, 0), num(f.z, 0)));
      else { const bb = new THREE.Box3().setFromObject(obj); c = bb.isEmpty() ? obj.position.clone() : bb.getCenter(new THREE.Vector3()); }
      let name = String(p.name || p.opts?.name || id), k = 2;
      while (set.pois[name]) name = `${p.name || p.opts?.name || id}${k++}`;
      set.pois[name] = { x: c.x, y: c.y, z: c.z };
      state.props.push(obj);
    }

    // ---------------- actors
    const POSES = listOf(characters, 'POSES'), FACES = listOf(characters, 'FACES');
    const markIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].filter((k) => set.marks[k] && typeof set.marks[k].x === 'number');
    const usedMarks = new Set();
    const markA = set.marks.A && typeof set.marks.A.x === 'number' ? set.marks.A : { x: 0, y: 0, z: 0, yaw: 0 };
    const placed = [];
    const resolveMark = (m, i) => {
      if (m && typeof m === 'object' && !Array.isArray(m)) {
        if (typeof m.x === 'number' || typeof m.z === 'number') {
          const p = res.point(m);
          return { x: p.x, y: p.y, z: p.z, yaw: typeof m.yaw === 'number' ? m.yaw * DEG : num(markA.yaw, 0) };
        }
      }
      if (Array.isArray(m)) { const p = res.point(m); return { x: p.x, y: p.y, z: p.z, yaw: num(markA.yaw, 0) }; }
      if (typeof m === 'string' && m) {
        const { kind, name } = res.parse(m.includes(':') ? m : (set.marks[m] ? 'mark:' + m : m));
        if (kind === 'mark' && set.marks[name] && typeof set.marks[name].x === 'number') { usedMarks.add(name); const k = set.marks[name]; return { x: k.x, y: num(k.y, 0), z: k.z, yaw: num(k.yaw, 0) }; }
        if (kind === 'crowd' && set.marks.crowd?.[+name]) { const k = set.marks.crowd[+name]; return { x: k.x, y: num(k.y, 0), z: k.z, yaw: num(k.yaw, 0) }; }
        if (kind === 'poi') { const p = res.point(m); if (p) return { x: p.x, y: p.y, z: p.z, yaw: num(markA.yaw, 0) }; }
        W(`unknown mark "${m}" → auto placement`);
      }
      const free = markIds.find((k) => !usedMarks.has(k));
      if (free) { usedMarks.add(free); const k = set.marks[free]; return { x: k.x, y: num(k.y, 0), z: k.z, yaw: num(k.yaw, 0) }; }
      const yaw = num(markA.yaw, 0); const side = (i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2) * 2.8;
      return { x: markA.x + Math.cos(yaw) * side, y: num(markA.y, 0), z: markA.z - Math.sin(yaw) * side, yaw };
    };
    const makeChar = (spec, label) => {
      let ch = null;
      try { ch = characters.createCharacter(ctx, spec || {}); } catch (e) { W(`createCharacter(${label}) failed: ${e.message}`); }
      if (!ch || !ch.root || !ch.root.isObject3D) {
        try { ch = characters.createCharacter(ctx, {}); } catch (e) { return null; }
        if (!ch || !ch.root) return null;
      }
      for (const k of ['setFace', 'setPose', 'setProp', 'update']) if (typeof ch[k] !== 'function') ch[k] = () => {};
      if (!(ch.height > 0)) ch.height = 5.2;
      return ch;
    };
    const applyLook = (e, d) => {
      const ch = e.character;
      if (d.pose) { if (POSES.length && !POSES.includes(d.pose)) W(`unknown pose "${d.pose}"`); safe(`setPose(${d.pose})`, () => ch.setPose(d.pose, d.poseOptions || {})); e.pose = d.pose; }
      if (d.face) { if (FACES.length && !FACES.includes(d.face)) W(`unknown face "${d.face}"`); safe(`setFace(${d.face})`, () => ch.setFace(d.face)); }
      if (d.prop !== undefined && d.prop !== null && d.prop !== false && d.prop !== 'none') {
        const ps = typeof d.prop === 'string' ? { type: d.prop } : d.prop;
        const before = new Set(); ch.root.traverse((o) => before.add(o));
        safe(`setProp(${ps && ps.type})`, () => ch.setProp(ps));
        const added = []; ch.root.traverse((o) => { if (!before.has(o) && before.has(o.parent)) added.push(o); });
        e.propObject = added.length === 1 ? added[0] : null;
      }
    };
    const actorDefs = Array.isArray(shot.actors) ? shot.actors.filter((a) => a && typeof a === 'object') : [];
    actorDefs.forEach((def, i) => {
      const id = String(def.id || `extra:${900 + i}`);
      let spec = def.spec;
      if (!spec || typeof spec !== 'object') {
        if (!/^extra:/.test(id)) W(`actor "${id}" has no spec → random townsperson`);
        spec = safe('randomSpec', () => characters.randomSpec(mulberry32(hashStr(id) ^ 0x5bd1e995), def.overrides || {}), {});
      }
      const ch = makeChar(spec, id); if (!ch) { W(`actor "${id}" skipped`); return; }
      const m = resolveMark(def.mark, i);
      const H = ch.height;
      const depth = depthUnits(def.depth, H);
      let y = m.y;
      if (depth > 0) {
        if (set.waterLevel !== null) {
          y = set.waterLevel - depth;
          const g = res.groundAt(m.x, m.z, set.waterLevel);
          if (g !== null && g > y + 0.25) { W(`actor "${id}": ground at mark is above the requested depth → standing on it (use a mark further in the water)`); y = g; }
        } else { y = m.y - depth; W(`actor "${id}": depth without water in set "${setId}"`); }
      }
      const pos = new THREE.Vector3(m.x, y, m.z);
      // keep actors from standing inside each other
      for (const q of placed) {
        if (Math.hypot(q.x - pos.x, q.z - pos.z) < 1.2) { pos.x += Math.cos(m.yaw) * 2.6; pos.z -= Math.sin(m.yaw) * 2.6; W(`actor "${id}" overlapped another actor → shifted`); }
      }
      placed.push(pos.clone());
      ch.root.position.copy(pos); ch.root.rotation.y = m.yaw;
      if (def.scale > 0) ch.root.scale.multiplyScalar(def.scale);
      scene.add(ch.root);
      const entry = { id, def, character: ch, mark: m, depth, phase: 0, crowd: false, pose: null };
      actorsById[id] = entry; state.actorList.push(entry);
      if (def.id && def.id !== id) actorsById[def.id] = entry;
    });

    // ---------------- crowd
    const crowd = shot.crowd && typeof shot.crowd === 'object' ? shot.crowd : {};
    const count = Math.max(0, Math.floor(num(+crowd.count, 0)));
    if (count > 0) {
      let slots = set.marks[crowd.area || 'crowd'];
      if (!Array.isArray(slots)) { if (crowd.area) W(`crowd area "${crowd.area}" not found → "crowd"`); slots = Array.isArray(set.marks.crowd) ? set.marks.crowd : []; }
      slots = slots.filter((s) => s && typeof s.x === 'number');
      if (!slots.length) {
        W(`set "${setId}" has no crowd marks → row behind mark A`);
        const yaw = num(markA.yaw, 0);
        for (let i = 0; i < 12; i++) { const side = (i - 5.5) * 2.5; slots.push({ x: markA.x - Math.sin(yaw) * 7 + Math.cos(yaw) * side, y: num(markA.y, 0), z: markA.z - Math.cos(yaw) * 7 - Math.sin(yaw) * side, yaw }); }
      }
      const order = slots.map((s, i) => i);
      if (crowd.pick === 'near' && state.actorList.length) { const c = state.actorList[0].character.root.position; order.sort((a, b) => Math.hypot(slots[a].x - c.x, slots[a].z - c.z) - Math.hypot(slots[b].x - c.x, slots[b].z - c.z)); }
      if (count > slots.length) W(`crowd.count ${count} > ${slots.length} slots → extra rows`);
      const crng = mulberry32(hashStr(`crowd:${setId}`) ^ num(crowd.seed, 0));
      const pickOf = (v, r) => (Array.isArray(v) ? (v.length ? v[Math.floor(r() * v.length) % v.length] : null) : v);
      for (let i = 0; i < count; i++) {
        const si = order[i % order.length]; const row = Math.floor(i / order.length);
        const s = slots[si];
        const srng = mulberry32(hashStr(`crowd:${setId}:${si}:${row}`) ^ num(crowd.seed, 0));
        const spec = safe('randomSpec', () => characters.randomSpec(srng, crowd.spec || {}), {});
        const ch = makeChar(spec, 'crowd'); if (!ch) continue;
        const yaw = num(s.yaw, 0);
        const depth = depthUnits(crowd.depth, ch.height);
        let y = num(s.y, 0);
        if (depth > 0) { if (set.waterLevel !== null) { y = set.waterLevel - depth; const g = res.groundAt(s.x, s.z, set.waterLevel); if (g !== null && g > y + 0.25) y = g; } else y -= depth; }
        const back = row * 2.6, jit = row ? (crng() - 0.5) * 1.2 : 0;
        ch.root.position.set(s.x - Math.sin(yaw) * back + Math.cos(yaw) * jit, y, s.z - Math.cos(yaw) * back - Math.sin(yaw) * jit);
        ch.root.rotation.y = yaw;
        scene.add(ch.root);
        const def = { id: `crowd:${i}`, facing: crowd.facing ?? 'mark', pose: pickOf(crowd.pose, srng) || 'stand', face: pickOf(crowd.face, srng) || null, prop: pickOf(crowd.prop, srng) || null };
        const entry = { id: def.id, def, character: ch, mark: { ...s, yaw }, depth, phase: srng() * 10, crowd: true, pose: null };
        state.actorList.push(entry);
      }
    }

    // ---------------- target / subject
    const targetRef = shot.target;
    const targetEntry = (() => { if (!targetRef || typeof targetRef !== 'string') return null; const { kind, name } = res.parse(targetRef); return kind === 'actor' ? actorsById[name] || null : null; })();
    const subjRef = shot.subject;
    let subjEntry = null, subjPoint = null;
    if (subjRef && subjRef !== 'set') {
      if (typeof subjRef === 'string') {
        const { kind, name } = res.parse(subjRef);
        if (kind === 'actor') subjEntry = actorsById[name] || null;
        if (!subjEntry) subjPoint = res.point(subjRef);
        if (!subjEntry && !subjPoint) W(`subject "${subjRef}" not found`);
      } else subjPoint = res.point(subjRef);
    }
    const framing = director.normalizeFraming(shot.framing || (subjEntry ? 'medium' : 'establishing'));
    const subjectFramings = !['establishing', 'aerial'].includes(framing);
    if (!subjEntry && !subjPoint && subjectFramings && subjRef !== 'set' && !['extreme_wide', 'wide'].includes(framing)) {
      subjEntry = state.actorList.find((e) => !e.crowd) || null;
    }

    // ---------------- absolute facings + walks (camera-relative facings are resolved after framing)
    const isCamRel = (f) => f == null || f === '' || CAMERA_REL.includes(String(f).toLowerCase()) || f === 'back';
    const facingOf = (e) => { const f = e.def.facing; if (f === 'back') return 'away'; return f == null || f === '' ? (e.crowd ? 'mark' : 'camera') : f; };
    const resolveAbsFacing = (e) => {
      const f = facingOf(e); const pos = e.character.root.position;
      if (typeof f === 'number') return f * DEG;
      const s = String(f).trim();
      if (s === 'mark' || s === 'default') return e.mark.yaw;
      if (CAMERA_REL.includes(s.toLowerCase())) return null;
      if (isFinite(parseFloat(s)) && /^-?[\d.]+$/.test(s)) return parseFloat(s) * DEG;
      if (s === 'target') { const p = res.point(targetRef); return p ? yawTo(pos, p) : null; }
      const p = typeof f === 'object' ? res.point(f) : res.point(s);
      if (p && (Math.abs(p.x - pos.x) + Math.abs(p.z - pos.z)) > 1e-3) return yawTo(pos, p);
      W(`unknown facing "${typeof f === 'object' ? JSON.stringify(f) : f}" for ${e.id} → mark yaw`);
      return e.mark.yaw;
    };
    for (const e of state.actorList) {
      const y = resolveAbsFacing(e); if (y !== null) e.character.root.rotation.y = y;
    }
    // the subject of over_shoulder / pov / back looks at the target by default
    if (subjEntry && ['over_shoulder', 'pov', 'back'].includes(framing) && isCamRel(subjEntry.def.facing) && targetRef) {
      const p = targetEntry ? targetEntry.character.root.position : res.point(targetRef);
      if (p) subjEntry.character.root.rotation.y = yawTo(subjEntry.character.root.position, p);
    }
    for (const e of state.actorList) {
      const w = e.def.walk; if (!w) continue;
      const wd = typeof w === 'object' && !Array.isArray(w) && !(typeof w.x === 'number') ? w : { to: w };
      const from = e.character.root.position.clone();
      let dest = res.point(wd.to);
      if (!dest) { W(`walk target "${JSON.stringify(wd.to)}" for ${e.id} not found`); continue; }
      const dir = dest.clone().sub(from); dir.y = 0; let dist = dir.length();
      if (typeof wd.to === 'string' && res.parse(wd.to).kind === 'actor') dist = Math.max(0, dist - 2.2); // stop beside an actor
      if (dist < 0.05) { W(`walk for ${e.id}: already at destination`); continue; }
      dir.normalize();
      const speed = clamp(num(+wd.speed, 4.5), 0.2, 40);
      const run = wd.pose === 'run' || e.def.pose === 'run' || speed >= 8;
      e.walk = {
        from, dir, dist, speed, delay: Math.max(0, num(+wd.delay, 0)), pose: wd.pose || (run ? 'run' : 'walk'),
        restPose: (e.def.pose && !['walk', 'run'].includes(e.def.pose)) ? e.def.pose : 'stand',
        arrivePose: wd.arrivePose || ((e.def.pose && !['walk', 'run'].includes(e.def.pose)) ? e.def.pose : 'stand'),
        ground: wd.ground !== false && !(e.depth > 0), baseY: from.y,
      };
      e.character.root.rotation.y = Math.atan2(dir.x, dir.z);
      state.walkers.push(e);
    }

    // ---------------- looks (pose / face / prop) then settle at t=0
    for (const e of state.actorList) {
      const d = { ...e.def };
      if (e.walk) d.pose = e.walk.delay > 0 ? e.walk.restPose : e.walk.pose;
      applyLook(e, d);
    }
    for (const e of state.walkers) this._stepWalk(e, 0);
    for (const e of state.actorList) safe(`update(${e.id})`, () => e.character.update(e.phase));
    scene.updateMatrixWorld(true);

    // ---------------- camera
    const camFov = typeof shot.fov === 'number' ? shot.fov : (shot.camera && typeof shot.camera.fov === 'number' ? shot.camera.fov : undefined);
    const frameArgs = {
      framing, angle: shot.angle, move: shot.move || 'static',
      subject: subjEntry ? subjEntry.character : subjPoint,
      target: targetEntry ? targetEntry.character : res.point(targetRef),
      set, actors: state.actorList.filter((e) => !e.crowd).map((e) => e.character),
      blockers: state.actorList.filter((e) => !e.crowd && e !== subjEntry && e !== targetEntry).map((e) => e.character),
      duration, fov: camFov, binoculars: !!(shot.binoculars || shot.pov), seed, setId,
      allowUnderwater: !!(shot.underwater || shot.camera?.underwater || setId === 'underwater'),
      subjectTravel: subjEntry && subjEntry.walk ? [0.33, 0.66, 1].map((k) => { const w = subjEntry.walk; const tt = Math.max(0, k * duration - w.delay); const d = Math.min(w.dist, w.speed * Math.max(0, tt - 0.15)); return w.dir.clone().multiplyScalar(d); }) : null,
      baseZoom: typeof shot.zoom === 'number' ? shot.zoom : (options.baseZoom ?? undefined), subjectProp: subjEntry ? subjEntry.def.prop : null, subjectPropObject: subjEntry ? subjEntry.propObject : null, camera: shot.camera || {}, moveAmount: shot.moveAmount,
    };
    const frame = (extra = {}) => {
      try { return director.frameShot(ctx, { ...frameArgs, ...extra }); } catch (e) {
        W(`director failed (${e.message}) → static wide`);
        return director.frameShot(ctx, { framing: 'establishing', set, duration, seed });
      }
    };
    let camCtl = frame();
    const subjYaw0 = subjEntry ? subjEntry.character.root.rotation.y : 0;

    // ---------------- camera-relative facings: "camera", "away", "left", "right" (screen directions)
    camCtl.update(duration / 2);
    const camPos = ctx.camera.position.clone();
    for (const e of state.actorList) {
      if (e.walk) continue;
      const f = String(facingOf(e)).toLowerCase();
      if (!CAMERA_REL.includes(f)) continue;
      if (e === subjEntry && ['over_shoulder', 'back', 'pov'].includes(framing)) continue;
      const toCam = yawTo(e.character.root.position, camPos);
      e.character.root.rotation.y = f === 'camera' ? toCam : f === 'away' ? toCam + Math.PI : f === 'right' ? toCam + Math.PI / 2 : toCam - Math.PI / 2;
    }
    scene.updateMatrixWorld(true);
    for (const e of state.actorList) safe(`update(${e.id})`, () => e.character.update(e.phase));
    if (subjEntry && Math.abs(Math.atan2(Math.sin(subjEntry.character.root.rotation.y - subjYaw0), Math.cos(subjEntry.character.root.rotation.y - subjYaw0))) > 3 * DEG) {
      const p = camCtl.pivot; const b = camCtl.basePosition;
      camCtl = frame({ azimuthWorld: Math.atan2(b.x - p.x, b.z - p.z) });
    }
    if (framing === 'pov' && subjEntry) subjEntry.character.root.visible = false;

    // hide crowd members that block the view or stand on top of the camera
    camCtl.update(duration / 2);
    const piv = camCtl.pivot.clone(); const cpos = ctx.camera.position.clone();
    const seg = piv.clone().sub(cpos); const segLen = seg.length(); seg.normalize();
    for (const e of state.actorList) {
      if (!e.crowd) continue;
      const p = e.character.root.position.clone(); p.y += e.character.height * 0.6;
      const tproj = clamp(p.clone().sub(cpos).dot(seg), 0, segLen);
      const closest = cpos.clone().addScaledVector(seg, tproj);
      if (p.distanceTo(cpos) < 2.2 || (tproj > 0.5 && tproj < segLen - 1.5 && closest.distanceTo(p) < e.character.height * 0.3)) { e.character.root.visible = false; }
    }

    // near plane adapted to the shot scale
    const dist = camCtl.info.distance || 10;
    cam.near = dist > 80 ? 1.0 : dist > 25 ? 0.3 : 0.1; cam.updateProjectionMatrix();

    // ---------------- lights: quality / shadow options, shadow frustum follows the action
    const pivot = camCtl.pivot;
    scene.traverse((o) => {
      if (!o.isLight) return;
      if (!options.shadows) o.castShadow = false;
      if (o.isPointLight || o.isSpotLight) { if (!options.pointShadows || options.quality === 'preview') o.castShadow = false; }
      if (o.castShadow && o.shadow) {
        const max = options.quality === 'preview' ? 1024 : num(options.maxShadowMap, 4096);
        if (o.shadow.mapSize.x > max || o.shadow.mapSize.y > max) { o.shadow.mapSize.set(Math.min(o.shadow.mapSize.x, max), Math.min(o.shadow.mapSize.y, max)); o.shadow.map?.dispose?.(); o.shadow.map = null; }
      }
      if (options.shadowFollow && o.isDirectionalLight && o.castShadow && o.target && pivot && !o.userData?.fixedShadow) {
        o.updateMatrixWorld(true); o.target.updateMatrixWorld(true);
        const tp = new THREE.Vector3(); o.target.getWorldPosition(tp);
        const sc = o.shadow.camera; const half = Math.max(Math.abs(sc.right - sc.left), Math.abs(sc.top - sc.bottom)) / 2;
        const off = new THREE.Vector3(pivot.x - tp.x, 0, pivot.z - tp.z);
        if (off.length() > half * 0.4) {
          o.position.add(off); o.target.position.add(off);
          if (!o.target.parent) scene.add(o.target);
          o.updateMatrixWorld(true); o.target.updateMatrixWorld(true);
        }
      }
    });

    // face fill: a soft light from the camera side so faces stay readable (the reference never has dark faces).
    // Point light with a short range ≈ subject distance → lifts the subject, barely touches the background.
    const ff = num(+(shot.faceFill ?? options.faceFill), 1);
    if (ff > 0 && subjEntry && framing !== 'pov' && camCtl.info.kind !== 'hint' && dist < 40) {
      const dark = time === 'night' || time === 'dusk' || interior;
      const E = (dark ? 1.1 : 0.45) * ff;
      // Spot cone sized to the subject (not a point light): with the camera near the ground (low angle)
      // a point light 3 m above the grass burned the foreground into a white-green band.
      const cp = camCtl.basePosition.clone(); const toS = camCtl.pivot.clone().sub(cp);
      const lp = cp.clone().addScaledVector(toS, 0.15).add(new THREE.Vector3(0, 0.6, 0));
      const subjH = subjEntry.character?.height || 4;
      const R = Math.max(subjH * 0.6, framing === 'two_shot' ? 5 : 3.2);
      const outer = Math.min(Math.PI / 2.6, Math.atan(R / Math.max(0.5, lp.distanceTo(camCtl.pivot))) * 1.35);
      const L = new THREE.SpotLight('#fff4e6', E * dist * dist, dist * 2.2, outer, 0.3, 2);
      L.position.copy(lp); L.target.position.copy(camCtl.pivot); scene.add(L.target);
      L.castShadow = false; L.userData.faceFill = true; scene.add(L);
    }

    state.cam = camCtl;
    // wait for async textures / fonts (bounded)
    const tWait = performance.now();
    while (pendingLoads > 0 && performance.now() - tWait < 8000) await new Promise((r) => setTimeout(r, 25));
    if (pendingLoads > 0) W(`${pendingLoads} asset(s) still loading after 8 s`);
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]); } catch (e) { /* */ }
    safe('compile', () => R.compile(scene, ctx.camera));
    state.ready = true;
    state.info = {
      ok: true, ms: Math.round(performance.now() - T0), set: setId, framing, seed,
      camera: camCtl.info, warnings: state.warnings,
      actors: state.actorList.filter((e) => !e.crowd).map((e) => ({ id: e.id, pos: e.character.root.position.toArray().map((x) => +x.toFixed(2)), yaw: +(e.character.root.rotation.y / DEG).toFixed(1), walk: !!e.walk })),
      crowd: state.actorList.filter((e) => e.crowd).length,
    };
    return state.info;
  },

  _stepWalk(e, t) {
    const w = e.walk; const tt = Math.max(0, t - w.delay); const a = 0.3;
    let s = tt < a ? w.speed * tt * tt / (2 * a) : w.speed * (tt - a / 2);
    let pose;
    if (s >= w.dist) { s = w.dist; pose = w.arrivePose; } else if (tt <= 0) pose = w.restPose; else pose = w.pose;
    if (pose !== e.pose) { safe(`setPose(${pose})`, () => e.character.setPose(pose, e.def.poseOptions || {})); e.pose = pose; }
    const p = w.from.clone().addScaledVector(w.dir, s);
    if (w.ground) {
      if (!e._ray) e._ray = new THREE.Raycaster();
      const r = e._ray; r.set(new THREE.Vector3(p.x, w.baseY + 2.5, p.z), new THREE.Vector3(0, -1, 0)); r.near = 0; r.far = 6;
      let hits = []; try { hits = r.intersectObjects(state._colliders ||= director.collectColliders(THREE, state.set), false); } catch (err) { hits = []; }
      p.y = hits.length ? hits[0].point.y : w.baseY;
    }
    e.character.root.position.copy(p);
  },

  renderFrame(t = 0, mime = 'image/jpeg', q) {
    if (!state || !state.ready) throw new Error('engine.renderFrame: no shot loaded (call loadShot first)');
    t = num(+t, 0);
    const T0 = performance.now();
    for (const e of state.walkers) this._stepWalk(e, t);
    for (const e of state.actorList) { try { e.character.update(t + e.phase); } catch (err) { W(`update(${e.id}): ${err.message}`); } }
    try { state.cam.update(t); } catch (err) { W(`camera update: ${err.message}`); }
    try { state.set.update?.(t, ctx.camera); } catch (err) { W(`set.update: ${err.message}`); }
    for (const o of state.props || []) { try { o.userData.update?.(t); } catch (err) { W(`prop update: ${err.message}`); } }
    ctx.renderer.render(ctx.scene, ctx.camera);
    const T1 = performance.now();
    const url = ctx.renderer.domElement.toDataURL(mime, q ?? options.jpegQuality);
    state.lastStats = { renderMs: T1 - T0, encodeMs: performance.now() - T1 };
    return url;
  },

  // QA helper: what does the director's collision ray see between two points?
  debugRay(from, to) {
    if (!state) return null;
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const all = []; ctx.scene.traverse((o) => { if (o.isMesh) all.push(o); });
    const col = new Set(director.collectColliders(THREE, state.set));
    const r = new THREE.Raycaster(a, b.clone().sub(a).normalize(), 0, a.distanceTo(b));
    return r.intersectObjects(all, false).slice(0, 12).map((h) => ({ name: h.object.name, type: h.object.type, d: +h.distance.toFixed(2), collider: col.has(h.object), mat: [].concat(h.object.material).map((m) => `${m.type}${m.transparent ? ' t' + m.opacity : ''}`).join(',') }));
  },

  info() {
    if (!state) return null;
    const c = ctx.camera;
    const ri = ctx.renderer.info.render;
    return { ...state.info, warnings: state.warnings, stats: state.lastStats || null, draw: { calls: ri.calls, triangles: ri.triangles }, cameraNow: { pos: c.position.toArray().map((x) => +x.toFixed(3)), fov: +c.fov.toFixed(2) }, options: { ...options } };
  },
};
