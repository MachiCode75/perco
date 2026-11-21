// World test page: free camera renders of a set (imports the world + characters modules directly).
import * as THREE from 'three';
import * as world from '/engine/web/src/world/index.js';
import * as characters from '/engine/web/src/characters/index.js';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let ctx, state;
window.tw = {
  init({ width = 360, height = 640 } = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(width, height);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
    ctx = { THREE, scene: new THREE.Scene(), renderer, camera, rng: Math.random, textures: new Map(), quality: 'final', width, height };
    return true;
  },
  load(spec) {
    const t0 = performance.now();
    ctx.scene = new THREE.Scene(); ctx.rng = mulberry32(spec.seed || 1);
    const set = world.createSet(ctx, spec.set, spec.setOptions || {});
    ctx.scene.add(set.group);
    world.applyEnvironment(ctx, { time: spec.time || 'day', weather: spec.weather || 'clear', interior: !!set.interior });
    const actors = [];
    const place = (m, depth = 0) => { const ch = characters.createCharacter(ctx, characters.randomSpec(ctx.rng)); ch.root.position.set(m.x, (m.y || 0) - depth, m.z); ch.root.rotation.y = m.yaw || 0; ctx.scene.add(ch.root); actors.push(ch); return ch; };
    for (const a of spec.actors || []) { const ch = place(set.marks[a.mark] || set.marks.A, a.depth || 0); if (a.pose) ch.setPose(a.pose); }
    const slots = set.marks[(spec.crowd && spec.crowd.area) || 'crowd'] || [];
    for (let i = 0; i < ((spec.crowd && spec.crowd.count) || 0) && i < slots.length; i++) place(slots[i], spec.crowd.depth || 0);
    for (const p of spec.props || []) { const o = world.createProp(ctx, p.id, p.opts || {}); o.position.set(...(p.pos || [0, 0, 0])); o.rotation.y = p.ry || 0; ctx.scene.add(o); }
    state = { set, actors, spec };
    return { ms: performance.now() - t0, marks: Object.keys(set.marks), pois: Object.keys(set.pois), hints: Object.keys(set.cameraHints), crowd: slots.length, water: set.waterLevel };
  },
  view(v) {
    const h = typeof v === 'string' ? state.set.cameraHints[v] : v;
    ctx.camera.fov = h.fov || 50; ctx.camera.aspect = ctx.width / ctx.height; ctx.camera.updateProjectionMatrix();
    ctx.camera.position.set(...h.pos); ctx.camera.lookAt(new THREE.Vector3(...h.target));
    return true;
  },
  render(t = 0, q = 0.85) {
    for (const a of state.actors) a.update(t);
    const t0 = performance.now();
    state.set.update(t, ctx.camera);
    ctx.renderer.render(ctx.scene, ctx.camera);
    const url = ctx.renderer.domElement.toDataURL('image/jpeg', q);
    const info = ctx.renderer.info.render;
    return { url, ms: performance.now() - t0, calls: info.calls, tris: info.triangles };
  },
};
window.__ready = true;
// profiling helper: times renderer.render (+1px readback to sync) under toggles
window.tw.profile = function (reps = 3) {
  const gl = ctx.renderer.getContext(); const px = new Uint8Array(4);
  const time = () => { let best = 1e9; for (let i = 0; i < reps; i++) { const t0 = performance.now(); ctx.renderer.render(ctx.scene, ctx.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); } return +best.toFixed(0); };
  const out = {}; state.set.update(0, ctx.camera);
  out.base = time();
  const t0 = performance.now(); ctx.renderer.domElement.toDataURL('image/jpeg', 0.92); out.jpeg = +(performance.now() - t0).toFixed(0);
  ctx.renderer.shadowMap.autoUpdate = false; out.noShadowPass = time(); ctx.renderer.shadowMap.autoUpdate = true;
  const hideBy = (pred) => { const hid = []; ctx.scene.traverse((o) => { if (o.isMesh && pred(o)) { o.visible = false; hid.push(o); } }); const r = time(); hid.forEach((o) => (o.visible = true)); return r; };
  out.noWater = hideBy((o) => o.name === 'water');
  out.noSky = hideBy((o) => o.name === 'sky');
  out.noBg = hideBy((o) => /^(bg|far|bed)\|/.test(o.name));
  out.noNear = hideBy((o) => /^near\|/.test(o.name));
  const mats = []; ctx.scene.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) mats.push(o); });
  const saved = mats.map((o) => o.material); const lam = new Map();
  mats.forEach((o) => { let l = lam.get(o.material); if (!l) { l = new THREE.MeshLambertMaterial({ map: o.material.map, vertexColors: o.material.vertexColors, color: o.material.color }); lam.set(o.material, l); } o.material = l; });
  time(); out.lambert = time(); mats.forEach((o, i) => (o.material = saved[i]));
  ctx.scene.traverse((o) => { if (o.isMesh) o.receiveShadow2 = o.receiveShadow; });
  const recv = []; ctx.scene.traverse((o) => { if (o.isMesh && o.receiveShadow) { recv.push(o); o.receiveShadow = false; } }); ctx.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  time(); out.noReceive = time(); recv.forEach((o) => (o.receiveShadow = true)); ctx.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  const sh = ctx.renderer.shadowMap.type; ctx.renderer.shadowMap.type = THREE.PCFShadowMap; ctx.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); time(); out.pcf = time(); ctx.renderer.shadowMap.type = sh; ctx.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); time();
  return out;
};
// calibration: minimal scene (ground + 10 characters + sun shadow) timed in the same conditions
window.tw.calib = function (reps = 3) {
  const gl = ctx.renderer.getContext(); const px = new Uint8Array(4);
  const sc = new THREE.Scene(); sc.background = new THREE.Color('#8fc1ee');
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#6a9a45' })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; sc.add(g);
  sc.add(new THREE.HemisphereLight('#dfefff', '#6b5a40', 1.3));
  const d = new THREE.DirectionalLight('#ffffff', 2.0); d.position.set(20, 40, 25); d.castShadow = true; d.shadow.mapSize.set(2048, 2048); Object.assign(d.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }); sc.add(d);
  for (let i = 0; i < 10; i++) { const ch = characters.createCharacter(ctx, characters.randomSpec(ctx.rng)); ch.root.position.set(-9 + i * 2, 0, -i); sc.add(ch.root); }
  let best = 1e9; for (let i = 0; i < reps + 1; i++) { const t0 = performance.now(); ctx.renderer.render(sc, ctx.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) best = Math.min(best, performance.now() - t0); }
  let best2 = 1e9; for (let i = 0; i < reps; i++) { const t0 = performance.now(); ctx.renderer.render(ctx.scene, ctx.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best2 = Math.min(best2, performance.now() - t0); }
  return { calib: +best.toFixed(0), scene: +best2.toFixed(0), ratio: +(best2 / best).toFixed(2), calls: ctx.renderer.info.render.calls, tris: ctx.renderer.info.render.triangles };
};
window.tw.stats = function () { const rows = []; state.set.group.traverse((o) => { if (o.isMesh) rows.push([o.name, o.geometry.attributes.position.count, o.geometry.index ? o.geometry.index.count / 3 : 0]); }); rows.sort((a, b) => b[1] - a[1]); return rows.slice(0, 25).map((r) => r.join(' ')).join('\n') + '\nTOTAL verts ' + rows.reduce((s, r) => s + r[1], 0); };
window.tw.prof2 = function (reps = 3) {
  const gl = ctx.renderer.getContext(); const px = new Uint8Array(4);
  const time = () => { let best = 1e9; for (let i = 0; i < reps; i++) { const t0 = performance.now(); ctx.renderer.render(ctx.scene, ctx.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); } return +best.toFixed(0); };
  const out = { base: time() };
  const vis = (objs, v) => objs.forEach((o) => (o.visible = v));
  vis([state.set.group], false); out.noSet = time(); vis([state.set.group], true);
  const chars = state.actors.map((a) => a.root); vis(chars, false); out.noChars = time(); vis(chars, true);
  const W = ctx.width, H = ctx.height; ctx.renderer.setSize(W / 2, H / 2); out.quarterRes = time(); ctx.renderer.setSize(W, H);
  ctx.renderer.setScissorTest(true); ctx.renderer.setScissor(0, 0, 8, 8); out.tinyScissor = time(); ctx.renderer.setScissorTest(false);
  const t0 = performance.now(); for (let i = 0; i < 5; i++) { ctx.scene.updateMatrixWorld(); } out.jsTraverse5 = +(performance.now() - t0).toFixed(1);
  out.calls = ctx.renderer.info.render.calls; let meshes = 0; ctx.scene.traverse((o) => { if (o.isMesh) meshes++; }); out.meshes = meshes;
  return out;
};
window.tw.ab = function (reps = 4) {
  const gl = ctx.renderer.getContext(); const px = new Uint8Array(4);
  const one = () => { const t0 = performance.now(); ctx.renderer.render(ctx.scene, ctx.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
  const meshes = []; state.set.group.traverse((o) => { if (o.isMesh && o.material.isMaterial && o.name !== 'water') meshes.push(o); });
  const orig = meshes.map((m) => m.material); const recv = meshes.map((m) => m.receiveShadow);
  const variants = {
    base: () => {},
    noMap: () => meshes.forEach((m) => { const c = m.material.clone(); c.map = null; c.onBeforeCompile = m.material.onBeforeCompile; m.material = c; }),
    noRecv: () => meshes.forEach((m) => { m.receiveShadow = false; m.material = m.material.clone(); }),
    noPatch: () => meshes.forEach((m) => { const c = m.material.clone(); c.onBeforeCompile = () => {}; c.customProgramCacheKey = () => 'np'; m.material = c; }),
    basic: () => meshes.forEach((m) => { m.material = new THREE.MeshBasicMaterial({ color: '#888' }); }),
  };
  const res = {}; for (const k in variants) res[k] = 1e9;
  for (let r = 0; r < reps; r++) for (const k in variants) {
    variants[k](); one(); res[k] = Math.min(res[k], one());
    meshes.forEach((m, i) => { m.material = orig[i]; m.receiveShadow = recv[i]; });
  }
  for (const k in res) res[k] = +res[k].toFixed(0);
  return res;
};
