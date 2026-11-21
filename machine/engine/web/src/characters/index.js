// Characters module — Roblox-classic R6 blocky characters. Contract: ARCHITECTURE.md §3.
// See README.md in this folder for the full spec reference.
import * as THREE from 'three';
import { cached, plastic, shade, col } from './util.js';
import { FACES, POSES, HAIR_STYLES, SHIRT_PATTERNS, PROPS_HELD, ACCESSORIES, PANTS_STYLES, PANTS_PATTERNS,
  normalizeSpec, normFace, normPose, randomSpec } from './spec.js';
import { faceTexture, torsoTexture, armTexture, legTexture } from './textures.js';
import { atlasBox, headGeometry, hairGeometry, capGeometry, glassesGeometry, lensGeometry, beardGeometry, mustacheGeometry,
  bowGeometry, tieGeometry, chainGeometry, gemGeometry, scarfGeometry, apronGeometry, hoodGeometry, skirtGeometry,
  HEAD_H, HEAD_D, EYE_Y } from './geometry.js';
import { computePose } from './poses.js';
import { buildProp } from './props.js';

export { FACES, POSES, HAIR_STYLES, SHIRT_PATTERNS, PROPS_HELD, ACCESSORIES, PANTS_STYLES, PANTS_PATTERNS, randomSpec };

const DOWN = new THREE.Vector3(0, -1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const ROUGH = 0.7;

function texMat(ctx, tex) {
  return cached(ctx, 'chr:mat:tex:' + tex.uuid, () => new THREE.MeshStandardMaterial({ map: tex, roughness: ROUGH, metalness: 0 }));
}
function colMat(ctx, color, kind = 'plastic', extra = {}) {
  const c = col(color, '#888888');
  return cached(ctx, `chr:mat:${kind}:${c}`, () => plastic(c, { roughness: ROUGH, ...extra }));
}
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }

export function createCharacter(ctx, specIn) {
  if (!ctx.textures) ctx.textures = new Map();
  const spec = normalizeSpec(specIn);
  const kid = spec.build === 'kid', elder = spec.build === 'elder';
  const scale = kid ? 0.82 : 1;
  const phase = typeof ctx.rng === 'function' ? ctx.rng() * 10 : 0;

  // ------------------------------------------------------------ rig
  const root = new THREE.Group(); root.name = 'character' + (spec.name ? ':' + spec.name : '');
  root.scale.setScalar(scale);
  const body = new THREE.Group(); root.add(body);              // whole-body (rotates about the feet)
  const hips = new THREE.Group(); hips.position.y = 2; body.add(hips);
  const upper = new THREE.Group(); hips.add(upper);             // waist pivot
  const neck = new THREE.Group(); neck.position.y = 2; upper.add(neck);
  const head = new THREE.Group(); head.position.y = HEAD_H / 2; neck.add(head);
  const armL = new THREE.Group(); armL.position.set(1.5, 1.5, 0); upper.add(armL);
  const armR = new THREE.Group(); armR.position.set(-1.5, 1.5, 0); upper.add(armR);
  const legL = new THREE.Group(); legL.position.set(0.5, 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(-0.5, 0, 0); hips.add(legR);

  // ------------------------------------------------------------ body parts
  const torsoM = mesh(atlasBox(ctx, 2, 2, 1), texMat(ctx, torsoTexture(ctx, spec))); torsoM.position.y = 1; upper.add(torsoM);
  const armMat = texMat(ctx, armTexture(ctx, spec));
  const armGeo = atlasBox(ctx, 1, 2, 1);
  const aL = mesh(armGeo, armMat); aL.position.y = -0.5; armL.add(aL);
  const aR = mesh(armGeo, armMat); aR.position.y = -0.5; armR.add(aR);
  const legMat = texMat(ctx, legTexture(ctx, spec));
  const lL = mesh(armGeo, legMat); lL.position.y = -1; legL.add(lL);
  const lR = mesh(armGeo, legMat); lR.position.y = -1; legR.add(lR);
  const headM = mesh(headGeometry(ctx), null); head.add(headM);

  // ------------------------------------------------------------ hair & accessories
  const accTypes = new Set(spec.accessories.map(a => a.type));
  const accColor = (t, d) => { const a = spec.accessories.find(x => x.type === t); return (a && a.color) || d; };
  let hairStyle = spec.hair.style;
  const wantsCap = hairStyle === 'cap' || accTypes.has('cap');
  if (wantsCap && hairStyle !== 'bald') hairStyle = 'cap';
  const hairGeo = hairGeometry(ctx, hairStyle);
  if (hairGeo) head.add(mesh(hairGeo, colMat(ctx, spec.hair.color, 'hair', { flatShading: true, roughness: 0.62 })));
  if (wantsCap) head.add(mesh(capGeometry(ctx), colMat(ctx, accColor('cap', spec.hair.capColor), 'plastic', { flatShading: true })));
  const black = colMat(ctx, '#151515', 'frame', { roughness: 0.4 });
  if (accTypes.has('glasses') || accTypes.has('sunglasses')) {
    head.add(mesh(glassesGeometry(ctx), accTypes.has('sunglasses') ? colMat(ctx, accColor('sunglasses', '#151515'), 'frame', { roughness: 0.4 }) : colMat(ctx, accColor('glasses', '#151515'), 'frame', { roughness: 0.4 })));
    if (accTypes.has('sunglasses')) head.add(mesh(lensGeometry(ctx), cached(ctx, 'chr:mat:sunlens', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1d24'), roughness: 0.12, metalness: 0.5 }))));
  }
  const fur = spec.hair.style === 'bald' ? (elder ? '#b9b9b9' : shade(spec.hair.color, 0)) : spec.hair.color;
  if (accTypes.has('beard')) head.add(mesh(beardGeometry(ctx), colMat(ctx, accColor('beard', fur), 'hair', { flatShading: true, roughness: 0.62 })));
  if (accTypes.has('mustache')) head.add(mesh(mustacheGeometry(ctx), colMat(ctx, accColor('mustache', fur), 'hair', { flatShading: true, roughness: 0.62 })));
  if (accTypes.has('bow')) { const b = mesh(bowGeometry(ctx), colMat(ctx, accColor('bow', '#e84a7f'))); b.position.set(0.42, HEAD_H / 2 + 0.12, 0.12); b.rotation.set(0.2, 0.3, 0.25); head.add(b); }
  if (accTypes.has('tie')) upper.add(mesh(tieGeometry(ctx), colMat(ctx, accColor('tie', '#c0262d'))));
  if (accTypes.has('mayor_chain')) {
    upper.add(mesh(chainGeometry(ctx), cached(ctx, 'chr:mat:gold', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#e3b23c'), roughness: 0.32, metalness: 0.75 }))));
    upper.add(mesh(gemGeometry(ctx), cached(ctx, 'chr:mat:ruby', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#c81d2a'), roughness: 0.2, metalness: 0.2, emissive: new THREE.Color('#3a0006') }))));
  }
  if (accTypes.has('scarf')) upper.add(mesh(scarfGeometry(ctx), colMat(ctx, accColor('scarf', '#c0392b'))));
  if (accTypes.has('apron')) upper.add(mesh(apronGeometry(ctx), colMat(ctx, accColor('apron', '#f4f4f0'))));
  if (spec.shirt.pattern === 'hoodie') upper.add(mesh(hoodGeometry(ctx), colMat(ctx, shade(spec.shirt.colors[0], -0.08))));
  let skirt = null;
  if (spec.shirt.pattern === 'dress') { skirt = mesh(skirtGeometry(ctx, 1.95, 1.45), colMat(ctx, spec.shirt.colors[0])); hips.add(skirt); }
  else if (spec.pants.style === 'skirt') { skirt = mesh(skirtGeometry(ctx, 0.95, 1.16), colMat(ctx, spec.pants.color)); hips.add(skirt); }

  // ------------------------------------------------------------ state
  let face = spec.face, faceMat = null, talkMats = null;
  let pose = 'stand', poseOpts = {};
  let prop = null, lastT = 0;

  function setFace(id) {
    face = normFace(id);
    faceMat = texMat(ctx, faceTexture(ctx, face, spec.skin));
    headM.material = faceMat;
    talkMats = face === 'talk' ? [faceMat, texMat(ctx, faceTexture(ctx, 'talk_closed', spec.skin))] : null;
  }

  function placeProp() {
    if (!prop) return;
    const o = prop.obj;
    if (o.parent) o.parent.remove(o);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0);
    if (prop.grip === 'eyes' && pose === 'binoculars') { prop.mode = 'eyes'; head.add(o); o.position.set(0, EYE_Y + 0.02, HEAD_D / 2 + 0.2); return; }
    if (prop.front && (pose === 'hold_sign' || pose === 'carry' || (prop.grip === 'front' && pose === 'hug'))) { prop.mode = 'front'; upper.add(o); o.position.fromArray(prop.front); return; }
    if (prop.grip === 'front' && pose === 'binoculars') { prop.mode = 'front'; upper.add(o); o.position.set(0, 0.9, 1.4); return; }
    prop.mode = 'hand'; upper.add(o);
    if (prop.type === 'sign') o.rotation.y = -Math.PI / 2;
    if (prop.type === 'umbrella') o.rotation.z = -0.32;
  }
  function setProp(p) {
    if (prop) { if (prop.obj.parent) prop.obj.parent.remove(prop.obj); prop = null; }
    if (!p) return;
    prop = buildProp(ctx, p);
    placeProp();
    update(lastT);
  }
  function setPose(id, opts) {
    pose = normPose(id);
    poseOpts = opts && typeof opts === 'object' ? opts : {};
    if (skirt) skirt.visible = pose !== 'sit';
    placeProp();
    update(lastT);
  }

  function setArm(g, d, twist) {
    _v.set(d[0], d[1], d[2]).normalize();
    g.quaternion.setFromUnitVectors(DOWN, _v);
    if (twist) g.quaternion.multiply(_q2.setFromAxisAngle(Y_AXIS, twist));
  }

  function update(t) {
    t = +t || 0; lastT = t;
    const tt = pose === 'fall' ? t : (t + phase) * (elder ? 0.85 : 1);
    const J = computePose(pose, tt, pose === 'fall' ? poseOpts : { ...poseOpts, at: 0 }, elder);
    body.position.set(J.body.x, J.body.y, J.body.z); body.rotation.set(J.body.rx, J.body.ry, J.body.rz);
    hips.position.y = J.hips.y; hips.rotation.set(J.hips.rx, 0, J.hips.rz);
    upper.position.y = J.upper.y; upper.rotation.set(J.upper.rx, J.upper.ry, J.upper.rz);
    neck.rotation.set(J.neck.rx, J.neck.ry, J.neck.rz);
    setArm(armL, J.armL, J.twistL); setArm(armR, J.armR, J.twistR);
    legL.rotation.set(J.legL.rx, J.legL.ry, J.legL.rz); legR.rotation.set(J.legR.rx, J.legR.ry, J.legR.rz);
    if (prop && prop.mode === 'hand') {
      // right hand position in upper space, prop stays upright & facing forward
      _v.set(0, -1.5, 0).applyQuaternion(armR.quaternion).add(armR.position);
      const h = prop.hand || [0, 0, 0];
      prop.obj.position.set(_v.x + h[0], _v.y + h[1], _v.z + h[2]);
    }
    if (talkMats) {
      const open = Math.sin(t * 29.0 + phase) + 0.7 * Math.sin(t * 17.3 + 1.3) > -0.15;
      headM.material = open ? talkMats[0] : talkMats[1];
    }
  }

  function anchors() {
    root.updateWorldMatrix(true, true);
    const w = (o, x, y, z) => o.localToWorld(new THREE.Vector3(x, y, z));
    const handL = w(armL, 0, -1.5, 0), handR = w(armR, 0, -1.5, 0);
    return {
      head: w(head, 0, 0, 0),
      eyes: w(head, 0, EYE_Y, HEAD_D / 2),
      chest: w(upper, 0, 1.3, 0.5),
      hands: handL.clone().add(handR).multiplyScalar(0.5),
      handL, handR,
      feet: w(body, 0, 0, 0),
      top: w(head, 0, HEAD_H / 2 + 0.25, 0),
    };
  }

  setFace(spec.face);
  setPose('stand');

  const character = {
    root, height: 5.2 * scale, spec,
    setFace, setPose, setProp, update, anchors,
    get face() { return face; }, get pose() { return pose; },
    joints: { body, hips, upper, neck, head, armL, armR, legL, legR },
  };
  root.userData.character = character;
  return character;
}
