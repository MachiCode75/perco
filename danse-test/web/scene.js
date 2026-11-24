// Danse sur le toit — scène autonome (three r170). window.renderFrame(t) -> dataURL JPEG.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const P = new URLSearchParams(location.search);
const W = +(P.get('w') || 720), H = +(P.get('h') || 1280);
const BPM = 76, BEAT = 60 / BPM;

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.fog = new THREE.Fog(0xd2f3fa, 80, 480);
const camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 3000);

// sky: grey-blue top, glowing white/cyan band on the horizon (Roblox "realistic" skybox feel)
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 d;
    void main(){ vec3 n = normalize(d); float y = n.y;
      vec3 top = vec3(.35,.40,.47), mid = vec3(.55,.62,.69), band = vec3(.93,1.,1.), cyan = vec3(.55,.94,.98);
      vec3 c = mix(mid, top, smoothstep(.05,.55,y));
      c = mix(c, cyan, .55*exp(-pow((y-.045)/.018,2.)) * (.75+.25*sin(n.x*9.+n.z*5.)));
      c = mix(c, band, exp(-pow((y-.012)/.022,2.)));
      if (y < 0.) c = mix(band, vec3(.12,.42,.80), smoothstep(0.,.06,-y));
      gl_FragColor = vec4(c,1.); }`,
})));

scene.add(new THREE.HemisphereLight(0xd7ecff, 0x55604c, 1.35));
const sun = new THREE.DirectionalLight(0xfff3e2, 2.3);
sun.position.set(18, 30, 22); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ------------------------------------------------------------------ textures
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const STUDS = 4; // studs per tile, tile = 1.6 units
const studCol = canvasTex(256, (g, s) => {
  g.fillStyle = '#4f5564'; g.fillRect(0, 0, s, s);
  const k = s / STUDS;
  for (let i = 0; i < STUDS; i++) for (let j = 0; j < STUDS; j++) {
    const x = i * k + k * .2, y = j * k + k * .2, w = k * .6;
    g.fillStyle = '#353a45'; g.fillRect(x + 4, y + 4, w, w);
    g.fillStyle = '#727889'; g.fillRect(x - 2, y - 2, w, w);
    g.fillStyle = '#5a6070'; g.fillRect(x + 2, y + 2, w - 4, w - 4);
  }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
});
const studBump = canvasTex(256, (g, s) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  const k = s / STUDS;
  for (let i = 0; i < STUDS; i++) for (let j = 0; j < STUDS; j++) {
    const x = i * k + k * .2, y = j * k + k * .2, w = k * .6;
    g.fillStyle = '#777'; g.fillRect(x - 2, y - 2, w + 4, w + 4);
    g.fillStyle = '#fff'; g.fillRect(x + 2, y + 2, w - 4, w - 4);
  }
}, false);
function roofMat(u, v) {
  const m = new THREE.MeshStandardMaterial({ roughness: .82, bumpScale: 2.2 });
  m.map = studCol.clone(); m.map.repeat.set(u / 1.6, v / 1.6); m.map.needsUpdate = true;
  m.bumpMap = studBump.clone(); m.bumpMap.repeat.copy(m.map.repeat); m.bumpMap.needsUpdate = true;
  return m;
}
// shirt: black with a dark monogram-like pattern
const shirtTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#121317'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#2b2d35';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const x = i * 32 + (j % 2) * 16 + 8, y = j * 32 + 8;
    g.save(); g.translate(x + 6, y + 6); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore();
    g.fillRect(x + 18, y + 20, 4, 4);
  }
});
shirtTex.repeat.set(2, 2);

// ------------------------------------------------------------------ materials
const M = {
  fur: new THREE.MeshStandardMaterial({ color: 0x4c4f59, roughness: .72 }),
  furDark: new THREE.MeshStandardMaterial({ color: 0x33353d, roughness: .8 }),
  furLight: new THREE.MeshStandardMaterial({ color: 0x777b86, roughness: .7 }),
  shirt: new THREE.MeshStandardMaterial({ map: shirtTex, roughness: .55 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x3a3b41, roughness: .92 }),
  pocket: new THREE.MeshStandardMaterial({ color: 0x303136, roughness: .95 }),
  shoe: new THREE.MeshStandardMaterial({ color: 0x1d1e22, roughness: .6 }),
  sole: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: .7 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xf2c552, metalness: 1, roughness: .28 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: .3 }),
  eye: new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0x9a6a10, emissiveIntensity: .7, roughness: .2 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xf1f1ef, roughness: .9 }),
  window: new THREE.MeshStandardMaterial({ color: 0x29405e, roughness: .15, metalness: .3 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x56a347, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x67b84f, roughness: .9 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8d929b, roughness: .8 }),
  road: new THREE.MeshStandardMaterial({ color: 0x5d6068, roughness: 1 }),
  sea: new THREE.MeshStandardMaterial({ color: 0x1f6fd6, roughness: .18, metalness: .05 }),
};
const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m); return m;
};
const rbox = (w, h, d, r = .06) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001));

// ------------------------------------------------------------------ map
const GROUND = -22;
mesh(new THREE.BoxGeometry(86, 2, 86), M.grass, 0, GROUND - 1, 0, scene);
const sea = mesh(new THREE.PlaneGeometry(6000, 6000), M.sea, 0, GROUND - .7, 0, scene); sea.rotation.x = -Math.PI / 2;
mesh(new THREE.BoxGeometry(86, .06, 7), M.road, 0, GROUND + .03, 16, scene);
mesh(new THREE.BoxGeometry(7, .06, 86), M.road, -19, GROUND + .03, 0, scene);

function gableHouse({ x = 0, z = 0, ry = 0, len = 10, halfW = 4, rise = 3.2, ridgeY = 0, windows = true }) {
  const g = new THREE.Group(); g.position.set(x, ridgeY, z); g.rotation.y = ry; scene.add(g);
  const a = Math.atan2(rise, halfW), S = Math.hypot(halfW, rise) + .7, th = .26, L = len + .9;
  for (const s of [1, -1]) {
    const m = mesh(new THREE.BoxGeometry(L, th, S), roofMat(L, S), 0,
      -(th / 2) * Math.cos(a) - (S / 2) * Math.sin(a), s * ((S / 2) * Math.cos(a) - (th / 2) * Math.sin(a)), g);
    m.rotation.x = s * a;
  }
  mesh(new THREE.BoxGeometry(L, .17, .36), roofMat(L, .4), 0, -.085, 0, g); // ridge cap (top = ridgeY)
  const sh = new THREE.Shape([new THREE.Vector2(-halfW, -rise), new THREE.Vector2(halfW, -rise), new THREE.Vector2(0, -.08)]);
  const tri = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  tri.rotateY(Math.PI / 2); tri.translate(-len / 2, 0, 0);
  mesh(tri, M.wall, 0, 0, 0, g);
  const wallH = ridgeY - rise - GROUND;
  mesh(new THREE.BoxGeometry(len, wallH, halfW * 2), M.wall, 0, -rise - wallH / 2, 0, g);
  if (windows) for (let f = 0; f < Math.floor(wallH / 3.4); f++) for (let i = -1; i <= 1; i++) for (const s of [1, -1])
    mesh(new THREE.BoxGeometry(1.4, 1.6, .1), M.window, i * len / 3.2, -rise - 2.2 - f * 3.4, s * halfW, g);
  return g;
}
gableHouse({ len: 11, halfW: 4.2, rise: 3.4 });                                 // the dancer's roof
gableHouse({ x: 3.6, z: 4.2, ry: Math.PI / 2, len: 8, halfW: 3, rise: 2.5, ridgeY: -.95 }); // cross gable
gableHouse({ x: -3.8, z: -4.6, ry: Math.PI / 2, len: 6, halfW: 2.6, rise: 2.2, ridgeY: -1.4 });
gableHouse({ x: -15, z: -5, ry: .1, len: 9, halfW: 3.5, rise: 2.8, ridgeY: -2.6 });
gableHouse({ x: 13, z: -13, ry: .35, len: 10, halfW: 4, rise: 3, ridgeY: -2.2 });
gableHouse({ x: -11, z: 15, ry: 0, len: 9, halfW: 3.6, rise: 2.8, ridgeY: -4 });
gableHouse({ x: 17, z: 9, ry: Math.PI / 2, len: 8, halfW: 3.4, rise: 2.6, ridgeY: -3.4 });
gableHouse({ x: 2, z: -24, ry: .05, len: 12, halfW: 4.2, rise: 3.2, ridgeY: -4.2 });
gableHouse({ x: -28, z: -22, ry: -.3, len: 9, halfW: 3.6, rise: 2.8, ridgeY: -5 });
gableHouse({ x: 30, z: 26, ry: .6, len: 9, halfW: 3.6, rise: 2.8, ridgeY: -5.2 });
gableHouse({ x: -30, z: 30, ry: .2, len: 8, halfW: 3.4, rise: 2.6, ridgeY: -6 });
for (const [x, z, r] of [[9, 20, 2.6], [-6, 24, 2.2], [24, -2, 2.8], [-24, 6, 2.4], [8, -34, 3], [-36, -8, 2.6], [36, -22, 2.4], [-16, -36, 2.2]]) {
  mesh(new THREE.CylinderGeometry(.35, .45, 3, 8), M.trunk, x, GROUND + 1.5, z, scene);
  mesh(new THREE.SphereGeometry(r, 16, 12), M.leaf, x, GROUND + 3 + r * .8, z, scene);
}
// distant observation tower: pole + platform discs
{ const tx = -30, tz = -78;
  mesh(new THREE.CylinderGeometry(1.1, 1.3, 31, 16), M.concrete, tx, GROUND + 14.5, tz, scene);
  mesh(new THREE.CylinderGeometry(8, 7.5, .8, 32), M.concrete, tx, GROUND + 30, tz, scene);
  mesh(new THREE.CylinderGeometry(5.5, 5, .6, 32), M.concrete, tx, GROUND + 27.5, tz, scene);
  mesh(new THREE.CylinderGeometry(3, 3, .3, 24), M.sea, tx, GROUND + 30.5, tz, scene);
  mesh(new THREE.BoxGeometry(.8, 1.6, .8), M.wall, tx + 5, GROUND + 31.2, tz + 2, scene);
}
// tiny avatars flying around the map, far away
function miniAvatar(col, hat) {
  const g = new THREE.Group(); const c = new THREE.MeshStandardMaterial({ color: col, roughness: .7 });
  mesh(new THREE.BoxGeometry(1, 1, .5), c, 0, 1.5, 0, g); mesh(new THREE.BoxGeometry(.6, .6, .6), c, 0, 2.3, 0, g);
  for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(.45, 1, .45), c, s * .27, .5, 0, g); mesh(new THREE.BoxGeometry(.4, 1, .4), c, s * .72, 1.5, 0, g); }
  if (hat) mesh(new THREE.BoxGeometry(.5, .3, .5), new THREE.MeshStandardMaterial({ color: hat }), 0, 2.75, 0, g);
  scene.add(g); return g;
}
const flyers = [
  { g: miniAvatar(0xe9e3e6, 0x3c9a3a), p: [10, 7, -26], a: 1.1 },
  { g: miniAvatar(0x15161a, 0x3c9a3a), p: [-7, 10, -34], a: .8 },
  { g: miniAvatar(0xf0e9ec), p: [22, 9, 14], a: .6 },
];

// ------------------------------------------------------------------ dancer (muscular wolf avatar)
const J = {}; const root = new THREE.Group(); scene.add(root);
const LEG = .94, FOOT = .13, HIP_OFF = .05;
J.hips = new THREE.Group(); root.add(J.hips);
mesh(rbox(.6, .32, .4, .1), M.pants, 0, .02, 0, J.hips);
mesh(new THREE.BoxGeometry(.62, .07, .42), M.black, 0, .16, 0, J.hips);
mesh(new THREE.BoxGeometry(.08, .06, .02), M.gold, 0, .16, .215, J.hips);
for (const s of [1, -1]) { // legs: baggy cargo pants + sneakers
  const k = s > 0 ? 'L' : 'R';
  const thigh = J['thigh' + k] = new THREE.Group(); thigh.position.set(s * .16, -HIP_OFF, 0); thigh.rotation.order = 'ZXY'; J.hips.add(thigh);
  mesh(new THREE.CylinderGeometry(.18, .16, .52, 14), M.pants, 0, -.24, 0, thigh);
  mesh(rbox(.07, .2, .22, .02), M.pocket, s * .17, -.3, 0, thigh);
  const knee = J['knee' + k] = new THREE.Group(); knee.position.y = -.48; thigh.add(knee);
  mesh(new THREE.SphereGeometry(.165, 12, 10), M.pants, 0, 0, 0, knee);
  mesh(new THREE.CylinderGeometry(.155, .185, .46, 14), M.pants, 0, -.23, 0, knee);
  const ankle = J['ankle' + k] = new THREE.Group(); ankle.position.y = -.46; ankle.rotation.order = 'ZXY'; knee.add(ankle);
  mesh(rbox(.21, .14, .38, .06), M.shoe, 0, -.05, .06, ankle);
  mesh(new THREE.BoxGeometry(.22, .045, .39), M.sole, 0, -.11, .06, ankle);
}
J.waist = new THREE.Group(); J.waist.position.y = .17; J.hips.add(J.waist);
mesh(rbox(.54, .26, .38, .1), M.shirt, 0, .08, 0, J.waist);
J.chest = new THREE.Group(); J.chest.position.y = .15; J.waist.add(J.chest);
{ // V-shaped torso
  const g = rbox(.92, .64, .46, .14); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getY(i) + .32) / .64;
    p.setX(i, p.getX(i) * (.64 + .36 * Math.pow(u, .8)));
    p.setZ(i, p.getZ(i) * (.9 + .14 * Math.sin(u * Math.PI * .85)));
  }
  g.computeVertexNormals(); mesh(g, M.shirt, 0, .33, 0, J.chest);
  for (const s of [1, -1]) mesh(new THREE.SphereGeometry(.2, 16, 12), M.shirt, s * .17, .46, .12, J.chest).scale.set(1.15, .8, .55); // pecs
}
for (const [r, y, z, tilt] of [[.23, .6, .07, .62], [.25, .55, .08, .7]]) { // gold chains
  const c = mesh(new THREE.TorusGeometry(r, .016, 8, 48), M.gold, 0, y, z, J.chest); c.rotation.x = Math.PI / 2 + tilt;
}
mesh(rbox(.07, .09, .03, .01), M.gold, 0, .39, .27, J.chest);
J.neck = new THREE.Group(); J.neck.position.y = .63; J.chest.add(J.neck);
mesh(new THREE.CylinderGeometry(.14, .18, .18, 12), M.fur, 0, .05, 0, J.neck);
J.head = new THREE.Group(); J.head.position.y = .13; J.neck.add(J.head);
{ const h = J.head;
  mesh(rbox(.4, .37, .38, .12), M.fur, 0, .17, 0, h);
  mesh(rbox(.22, .15, .26, .06), M.furLight, 0, .1, .25, h);          // snout
  mesh(rbox(.2, .07, .22, .03), M.furLight, 0, .015, .22, h);          // jaw
  mesh(rbox(.1, .07, .07, .03), M.black, 0, .155, .38, h);             // nose
  mesh(new THREE.BoxGeometry(.33, .06, .08), M.furDark, 0, .265, .17, h).rotation.x = -.2; // brow
  for (const s of [1, -1]) {
    mesh(new THREE.SphereGeometry(.03, 10, 8), M.eye, s * .095, .215, .19, h);
    const ear = mesh(new THREE.ConeGeometry(.085, .24, 4), M.fur, s * .13, .43, -.03, h); ear.rotation.set(-.15, Math.PI / 4, -s * .28);
    const tuft = mesh(new THREE.ConeGeometry(.07, .2, 4), M.fur, s * .23, .1, -.02, h); tuft.rotation.z = s * -1.9;
  }
  const mane = mesh(new THREE.ConeGeometry(.16, .3, 5), M.furDark, 0, .02, -.17, h); mane.rotation.x = -2.5;
}
for (const s of [1, -1]) { // arms: big furry biceps, short black sleeves
  const k = s > 0 ? 'L' : 'R';
  const sh = J['sh' + k] = new THREE.Group(); sh.position.set(s * .5, .54, 0); sh.rotation.order = 'ZXY'; J.chest.add(sh);
  mesh(new THREE.SphereGeometry(.2, 16, 12), M.shirt, s * .03, -.02, 0, sh);
  mesh(new THREE.CylinderGeometry(.205, .19, .2, 16), M.shirt, s * .01, -.1, 0, sh);
  mesh(new THREE.CapsuleGeometry(.14, .3, 6, 12), M.fur, 0, -.27, 0, sh);
  mesh(new THREE.SphereGeometry(.14, 14, 10), M.fur, 0, -.24, .05, sh).scale.set(1.05, 1.35, 1.1); // bicep
  const el = J['el' + k] = new THREE.Group(); el.position.y = -.5; el.rotation.order = 'ZXY'; sh.add(el);
  mesh(new THREE.CapsuleGeometry(.12, .28, 6, 12), M.fur, 0, -.2, 0, el);
  const wr = J['wr' + k] = new THREE.Group(); wr.position.y = -.42; el.add(wr);
  mesh(rbox(.17, .19, .18, .07), M.fur, 0, -.07, .01, wr);
}

// ------------------------------------------------------------------ choreography
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
// arm pose for the dancer's LEFT arm (+x); right arm is mirrored. [shX, shZ, shY, elX, elZ]
const POSE = {
  out:    { L: [-1.15, .75, -.2, -.45, 0], R: [-1.15, .75, -.2, -.45, 0] },   // arms out wide & forward
  outIn:  { L: [-1.3, .35, -.2, -.75, 0], R: [-1.3, .35, -.2, -.75, 0] },   // arms come in (push)
  head:   { L: [.35, 2.55, .1, 0, 1.95], R: [.35, 2.55, .1, 0, 1.95] },    // hands behind the head
  swingA: { L: [-1.25, .3, 0, -.55, 0], R: [.35, .18, 0, -.45, 0] },
  swingB: { L: [.35, .18, 0, -.45, 0], R: [-1.25, .3, 0, -.55, 0] },
};
// keyframes in beats over an 8-beat phrase
const KEYS = [[0, 'out'], [.6, 'outIn'], [1.2, 'out'], [1.6, 'outIn'], [2.1, 'out'], [2.7, 'head'], [5.3, 'head'],
  [5.9, 'swingA'], [6.6, 'swingB'], [7.3, 'swingA'], [8, 'out']];
function armPose(b8) {
  let i = 0; while (i < KEYS.length - 2 && b8 >= KEYS[i + 1][0]) i++;
  const [b0, p0] = KEYS[i], [b1, p1] = KEYS[i + 1], u = sm((b8 - b0) / (b1 - b0));
  const out = {};
  for (const k of ['L', 'R']) out[k] = POSE[p0][k].map((v, j) => v + (POSE[p1][k][j] - v) * u);
  return out;
}
function applyArm(k, s, a, t, b) {
  const sh = J['sh' + k], el = J['el' + k];
  sh.rotation.set(a[0], s * a[2], s * a[1]);
  el.rotation.set(a[3], 0, s * a[4]);
  J['wr' + k].rotation.set(.15 * Math.sin(Math.PI * 2 * b + (s > 0 ? 0 : 1)), 0, 0);
}

function pose(t) {
  const b = t / BEAT, b8 = ((b % 8) + 8) % 8;
  const wHead = sm((b8 - 2.3) / .6) * (1 - sm((b8 - 5.2) / .6));
  const sway = Math.sin(Math.PI * b);                         // one side per beat
  const beatDip = .5 + .5 * Math.cos(2 * Math.PI * b);        // 1 on the beat
  // hips: side sway + (in the "head" part) a slow sensual hip circle
  const hx = .075 * sway + .03 * wHead * Math.sin(Math.PI * b);
  const hz = .06 * wHead * Math.cos(Math.PI * b);
  const k = .14 + .12 * beatDip + .1 * wHead;                 // knee bend
  J.hips.position.set(hx, HIP_OFF + FOOT + LEG * Math.cos(k) - .02, hz);
  J.hips.rotation.set(.04 + .14 * wHead * Math.cos(Math.PI * b + .6), .16 * Math.sin(Math.PI * b - .7), -.09 * sway);
  // spine: body roll (wave travelling up), shoulders counter the hips
  const roll = .08 + .1 * wHead;
  J.waist.rotation.set(roll * Math.sin(Math.PI * b + .9), -.5 * J.hips.rotation.y, .07 * sway);
  J.chest.rotation.set(roll * Math.sin(Math.PI * b - .3) - .02, -.4 * J.hips.rotation.y, .06 * sway);
  J.neck.rotation.set(-.05 - .12 * wHead, 0, -.05 * sway);
  J.head.rotation.set(.12 * Math.sin(2 * Math.PI * b - .9) - .1 * wHead, .12 * Math.sin(Math.PI * b * .5), -.06 * sway);
  // legs: keep feet planted while the hips move
  const hy = J.hips.position.y - HIP_OFF - FOOT;
  for (const s of [1, -1]) {
    const kk = s > 0 ? 'L' : 'R';
    const footX = s * .29, hipX = hx + s * .16 * Math.cos(J.hips.rotation.z);
    const phi = Math.atan2(footX - hipX, hy);
    const lean = Math.asin(Math.max(-.5, Math.min(.5, hz / LEG)));
    J['thigh' + kk].rotation.set(-k + lean, -J.hips.rotation.y, phi - J.hips.rotation.z);
    J['knee' + kk].rotation.set(2 * k, 0, 0);
    J['ankle' + kk].rotation.set(-k - lean, 0, -phi);
  }
  // arms (+ small groove on top of the key poses)
  const A = armPose(b8);
  const groove = (1 - wHead) * .12 * Math.sin(Math.PI * b);
  A.L[1] += groove; A.R[1] -= groove;
  applyArm('L', 1, A.L, t, b); applyArm('R', -1, A.R, t, b);
  root.updateMatrixWorld(true);
}

// ------------------------------------------------------------------ camera: one continuous 360° orbit
const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
function cameraAt(t) {
  const th = 2 * Math.PI * (.12 * ease(t / 3) + .88 * ease((t - 1.6) / 13)) + .1 * Math.sin(t * .7) - .05;
  const r = 4.7 + .4 * Math.sin(t * .45 + 1) - .3 * sm((t - 8) / 4);
  const y = 2.45 + .3 * Math.sin(t * .6) - .3 * sm((t - 6) / 5) + .25 * sm((t - 12) / 3);
  const n = (f, p) => Math.sin(t * f + p);                     // handheld wobble
  camera.position.set(Math.sin(th) * r + .03 * n(2.3, 1), y + .025 * n(3.1, 2), Math.cos(th) * r + .03 * n(1.9, 3));
  camera.lookAt(J.hips.position.x * .6, .95 + .03 * n(2.7, 4), J.hips.position.z * .5);
  camera.rotation.z += .015 * n(1.3, 5);
}

window.renderFrame = (t, q = .92) => {
  pose(t); cameraAt(t);
  sea.material.color.setHSL(.595, .75, .45 + .015 * Math.sin(t));
  for (const f of flyers) {
    f.g.position.set(f.p[0] + 2 * Math.sin(t * .3 * f.a), f.p[1] + .6 * Math.sin(t * f.a), f.p[2] + 1.5 * Math.cos(t * .25 * f.a));
    f.g.rotation.y = t * .4 * f.a;
  }
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/jpeg', q);
};
window.ready = true;
