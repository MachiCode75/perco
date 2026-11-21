// Browser runtime. Contract: ARCHITECTURE.md §6. Owner: engine-core.
import * as THREE from 'three';
import * as characters from './src/characters/index.js';
import * as world from './src/world/index.js';
import * as director from './src/director/index.js';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const DEG = Math.PI / 180;
let ctx = null, state = null;

function resolvePoint(ref, set, actorsById) {
  if (!ref) return null;
  if (typeof ref === 'object') return new THREE.Vector3(ref.x || 0, ref.y || 0, ref.z || 0);
  const [kind, name] = String(ref).includes(':') ? String(ref).split(':') : ['actor', ref];
  if (kind === 'poi' && set.pois?.[name]) { const p = set.pois[name]; return new THREE.Vector3(p.x, p.y || 0, p.z); }
  if (kind === 'mark' && set.marks?.[name]) { const m = set.marks[name]; return new THREE.Vector3(m.x, m.y || 0, m.z); }
  if (kind === 'actor' && actorsById[name]) return actorsById[name].character.root.position.clone();
  return null;
}

window.engine = {
  async init({ width = 720, height = 1280, quality = 'final' } = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(width, height);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
    ctx = { THREE, scene: new THREE.Scene(), renderer, camera, rng: Math.random, textures: new Map(), quality, width, height };
    window.__ready = true;
    return true;
  },

  async loadShot(shot) {
    const scene = new THREE.Scene(); ctx.scene = scene; ctx.rng = mulberry32(shot.seed || 1);
    const set = world.createSet(ctx, shot.set || 'lake_dock', shot.setOptions || {});
    scene.add(set.group);
    world.applyEnvironment(ctx, { time: shot.time || 'day', weather: shot.weather || 'clear', interior: !!set.interior });

    const actorsById = {}; const actorList = [];
    let crowdIdx = 0;
    for (const a of shot.actors || []) {
      const ch = characters.createCharacter(ctx, a.spec || characters.randomSpec(ctx.rng));
      const m = typeof a.mark === 'object' ? a.mark : (set.marks?.[a.mark] || set.marks?.A || { x: 0, y: 0, z: 0, yaw: 0 });
      ch.root.position.set(m.x || 0, (m.y || 0) - (a.depth || 0), m.z || 0);
      ch.root.rotation.y = m.yaw || 0;
      scene.add(ch.root);
      const entry = { def: a, character: ch, mark: m };
      actorsById[a.id] = entry; actorList.push(entry);
    }
    const crowd = shot.crowd || {};
    const slots = set.marks?.[crowd.area || 'crowd'] || [];
    for (let i = 0; i < (crowd.count || 0) && i < slots.length; i++) {
      const s = slots[i];
      const ch = characters.createCharacter(ctx, characters.randomSpec(ctx.rng));
      ch.root.position.set(s.x, (s.y || 0) - (crowd.depth || 0), s.z); ch.root.rotation.y = s.yaw || 0;
      ch.setPose(crowd.pose || 'stand'); if (crowd.face) ch.setFace(crowd.face);
      scene.add(ch.root); actorList.push({ def: { id: 'crowd:' + (crowdIdx++), facing: null }, character: ch, mark: s });
    }
    // facing (camera-independent first)
    for (const e of actorList) {
      const f = e.def.facing; const pos = e.character.root.position; const base = e.mark.yaw || 0;
      if (f === undefined || f === null || f === 'camera') continue;
      if (f === 'away') e.character.root.rotation.y = base + Math.PI;
      else if (f === 'left') e.character.root.rotation.y = base + Math.PI / 2;
      else if (f === 'right') e.character.root.rotation.y = base - Math.PI / 2;
      else if (typeof f === 'number') e.character.root.rotation.y = f * DEG;
      else { const p = resolvePoint(f, set, actorsById); if (p) e.character.root.rotation.y = Math.atan2(p.x - pos.x, p.z - pos.z); }
    }
    for (const e of actorList) {
      const d = e.def; if (!d.pose && !d.face && !d.prop) continue;
      if (d.pose) e.character.setPose(d.pose, d.poseOptions || {});
      if (d.face) e.character.setFace(d.face);
      if (d.prop) e.character.setProp(typeof d.prop === 'string' ? { type: d.prop } : d.prop);
    }
    const subj = shot.subject && actorsById[shot.subject] ? actorsById[shot.subject] : null;
    const cam = director.frameShot(ctx, {
      framing: shot.framing || 'medium', angle: shot.angle || 'eye', move: shot.move || 'static',
      subject: subj ? subj.character : (resolvePoint(shot.subject, set, actorsById) || null),
      target: resolvePoint(shot.target, set, actorsById), set, actors: actorList.map(e => e.character),
      duration: shot.duration || 1.5, fov: shot.fov, binoculars: !!shot.binoculars,
    });
    state = { set, actorList, cam };
    return true;
  },

  renderFrame(t, mime = 'image/jpeg', q = 0.92) {
    for (const e of state.actorList) e.character.update(t);
    state.cam.update(t);
    state.set.update?.(t, ctx.camera);
    ctx.renderer.render(ctx.scene, ctx.camera);
    return ctx.renderer.domElement.toDataURL(mime, q);
  },
};
