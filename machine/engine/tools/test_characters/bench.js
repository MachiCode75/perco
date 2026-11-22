// Character test bench: grey floor, fixed camera, lineups of characters. Driven by render.js (playwright).
import * as THREE from 'three';
import * as characters from '../../web/src/characters/index.js';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

let ctx = null, state = null;
window.characters = characters;
window.test = {
  init({ width = 720, height = 1280, quality = 'final' } = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(width, height);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500);
    ctx = { THREE, scene: new THREE.Scene(), renderer, camera, rng: mulberry32(1), textures: new Map(), quality, width, height };
    return true;
  },
  setup(cfg) {
    const scene = new THREE.Scene(); ctx.scene = scene; ctx.rng = mulberry32(cfg.seed || 1);
    scene.background = new THREE.Color(cfg.background || '#9cc7ec');
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: cfg.floor || '#9a9a96', roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    scene.add(new THREE.HemisphereLight('#dfefff', '#6b5a40', 1.3));
    const d = new THREE.DirectionalLight('#ffffff', 2.0); d.position.set(20, 40, 25); d.castShadow = true; d.shadow.mapSize.set(2048, 2048);
    Object.assign(d.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }); d.shadow.bias = -0.0005; d.shadow.normalBias = 0.02; scene.add(d);
    const list = [];
    const t0 = performance.now();
    for (const it of cfg.items || []) {
      const spec = it.spec || characters.randomSpec(ctx.rng, it.overrides || {});
      const ch = characters.createCharacter(ctx, spec);
      ch.root.position.set(it.x || 0, it.y || 0, it.z || 0); ch.root.rotation.y = (it.yaw || 0) * Math.PI / 180;
      if (it.pose) ch.setPose(it.pose, it.poseOptions || {});
      if (it.face) ch.setFace(it.face);
      if (it.prop) ch.setProp(it.prop);
      scene.add(ch.root); list.push({ it, ch });
    }
    const buildMs = performance.now() - t0;
    let cam = cfg.camera || { pos: [0, 4, 18], target: [0, 2.6, 0], fov: 40 };
    if (cam.anchor && list[0]) { for (const e of list) e.ch.update(0); const a = list[0].ch.anchors()[cam.anchor]; cam = { pos: [a.x + (cam.side || 0), a.y + (cam.up || 0), a.z + (cam.dist || 5)], target: [a.x, a.y + (cam.lookUp || 0), a.z], fov: cam.fov || 34 }; }
    else if (cam.fit && list[0]) { const h = list[0].ch.height; cam = { pos: [h * 0.22, h * 0.6, h * 1.75 + 5], target: [0, h * 0.48, 0], fov: cam.fov || 34 }; }
    ctx.camera.fov = cam.fov || 40; ctx.camera.aspect = ctx.width / ctx.height; ctx.camera.updateProjectionMatrix();
    ctx.camera.position.fromArray(cam.pos); ctx.camera.lookAt(new THREE.Vector3().fromArray(cam.target));
    state = { list, cfg };
    return { buildMs, count: list.length, textures: ctx.textures.size };
  },
  render(t = 0, { labels = true, mime = 'image/jpeg', q = 0.9 } = {}) {
    for (const e of state.list) e.ch.update(t);
    const t0 = performance.now();
    ctx.renderer.render(ctx.scene, ctx.camera);
    const gl = ctx.renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const renderMs = performance.now() - t0;
    let url;
    if (labels && state.list.some(e => e.it.label)) {
      const c = document.createElement('canvas'); c.width = ctx.width; c.height = ctx.height;
      const g = c.getContext('2d'); g.drawImage(ctx.renderer.domElement, 0, 0);
      g.font = `700 ${Math.max(15, Math.round(ctx.height / 50))}px Inter, sans-serif`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#000'; g.fillStyle = '#fff';
      for (const e of state.list) {
        if (!e.it.label) continue;
        const p = new THREE.Vector3(e.ch.root.position.x, (e.it.labelY ?? -0.6), e.ch.root.position.z).project(ctx.camera);
        const x = (p.x * 0.5 + 0.5) * ctx.width, y = (-p.y * 0.5 + 0.5) * ctx.height;
        g.strokeText(e.it.label, x, y); g.fillText(e.it.label, x, y);
      }
      url = c.toDataURL(mime, q);
    } else url = ctx.renderer.domElement.toDataURL(mime, q);
    return { url, renderMs, calls: ctx.renderer.info.render.calls, tris: ctx.renderer.info.render.triangles };
  },
  anchors(i = 0) { const a = state.list[i].ch.anchors(); return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.toArray().map(x => +x.toFixed(3))])); },
};
window.__ready = true;
