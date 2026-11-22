// R6 humanoid rig (normal characters + humanoid creatures). Supports v2 modifiers: scale, stretch, eyes.
import * as THREE from 'three';
import { cached, plastic, shade, col } from './util.js';
import { normFace, normPose } from './spec.js';
import { faceTexture, torsoTexture, armTexture, legTexture, haloTexture, maskTexture } from './textures.js';
import { atlasBox, headGeometry, hairGeometry, capGeometry, glassesGeometry, lensGeometry, beardGeometry, mustacheGeometry,
  bowGeometry, tieGeometry, chainGeometry, gemGeometry, scarfGeometry, apronGeometry, hoodGeometry, skirtGeometry,
  maskPanelGeometry, maskBandGeometry, HEAD_H, HEAD_W, HEAD_D, EYE_Y } from './geometry.js';
import { computePose } from './poses.js';
import { buildProp } from './props.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const Z3 = [0, 0, 0];
export const ROUGH = 0.7;
/** poses where the skirt block is hidden (legs folded / kneeling) */
const SEATED = new Set(['sit', 'sit_rock', 'crouch']);
/** poses with two-handed carrying in front of the chest (props with a `front` slot go there) */
const FRONT_POSES = new Set(['hold_sign', 'carry']);
const PINCH_POSES = new Set(['pinch', 'giant_pinch']);
/** Fabric sleep mask (+ elastic strap) on the head; slot 'eyes' covers the face decal's eyes, 'forehead' sits pushed up above. */
export function sleepMask(ctx, a, slot) {
  const color = a.color || '#23253a';
  const g = new THREE.Group(); g.name = 'sleep_mask:' + slot;
  g.add(mesh(maskPanelGeometry(ctx), texMat(ctx, maskTexture(ctx, a.text, color, a.textColor))));
  g.add(mesh(maskBandGeometry(ctx), colMat(ctx, shade(color, -0.4), 'plastic', { roughness: 0.85 })));
  if (slot === 'forehead') { g.position.set(0, EYE_Y + 0.3, 0.03); g.rotation.x = -0.24; g.scale.set(1.07, 0.92, 1.12); }
  else g.position.set(0, EYE_Y + 0.02, 0);
  return g;
}

export function texMat(ctx, tex, extra = null) {
  return cached(ctx, 'chr:mat:tex:' + tex.uuid + (extra ? JSON.stringify(extra) : ''), () => new THREE.MeshStandardMaterial({ map: tex, roughness: ROUGH, metalness: 0, ...(extra || {}) }));
}
export function colMat(ctx, color, kind = 'plastic', extra = {}) {
  const c = col(color, '#888888');
  return cached(ctx, `chr:mat:${kind}:${c}:${JSON.stringify(extra)}`, () => plastic(c, { roughness: ROUGH, ...extra }));
}
export function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }

/** Two emissive eye discs + additive halos on the head front (eyes: 'glow'). */
export function glowEyes(ctx, head, color, { dx = 0.185, y = EYE_Y + 0.01, z = HEAD_D / 2 + 0.012, r = 0.075, halo = 0.34 } = {}) {
  const g = new THREE.Group();
  const disc = cached(ctx, 'chr:geo:glowdisc', () => new THREE.CircleGeometry(1, 16));
  const core = cached(ctx, 'chr:mat:glowcore:' + color, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false }));
  const hm = cached(ctx, 'chr:mat:glowhalo:' + color, () => new THREE.MeshBasicMaterial({ map: haloTexture(ctx), color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(disc, core); c.position.set(s * dx, y, z); c.scale.set(r, r * 1.25, 1); g.add(c);
    const h = new THREE.Mesh(disc, hm); h.position.set(s * dx, y, z + 0.01); h.scale.setScalar(halo); h.renderOrder = 2; g.add(h);
  }
  head.add(g);
  return g;
}

/**
 * Build a humanoid character.
 * ov (creature overrides): { width, depth, limb, parts:{torso,arm,leg:{geo?,mat?}}, head:{ build(group, ctx)→{setFace?}, noFace }, hairless,
 *   extras(rig), poseMap(id)→id, defaultPose, faceMap(id)→id, update(t, rig, pose), defaultFace, heightExtra,
 *   poseDefaults{pose:opts}, propScale, handPad[x,y,z], pinchPoint(rig)→[x,y,z] (arm-local) }
 */
export function createHumanoid(ctx, spec, ov = {}) {
  const kid = spec.build === 'kid', elder = spec.build === 'elder';
  const scale = (kid ? 0.82 : 1) * (spec.scale || 1);
  const phase = typeof ctx.rng === 'function' ? ctx.rng() * 10 : 0;
  const st = spec.stretch || { arms: 1, legs: 1, torso: 1, neck: 0 };
  const W = ov.width || 1, D = ov.depth || 1, LW = ov.limb || 1;
  const legLen = 2 * st.legs, torsoH = 2 * st.torso, armLen = 2 * st.arms, neckL = st.neck || 0;
  const tw = 2 * W, shoulderX = tw / 2 + LW / 2 - (ov.shoulderIn || 0), shoulderY = torsoH - 0.5 * Math.min(1.4, st.torso);
  const handY = 0.5 - armLen;

  // ------------------------------------------------------------ rig
  const root = new THREE.Group(); root.name = 'character' + (spec.name ? ':' + spec.name : '') + (spec.creature ? ':' + spec.creature : '');
  root.scale.setScalar(scale);
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = legLen; body.add(hips);
  const upper = new THREE.Group(); hips.add(upper);
  const neck = new THREE.Group(); neck.position.y = torsoH + neckL; upper.add(neck);
  const head = new THREE.Group(); head.position.y = HEAD_H / 2; neck.add(head);
  const armL = new THREE.Group(); armL.position.set(shoulderX, shoulderY, 0); upper.add(armL);
  const armR = new THREE.Group(); armR.position.set(-shoulderX, shoulderY, 0); upper.add(armR);
  const legL = new THREE.Group(); legL.position.set(tw / 4, 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(-tw / 4, 0, 0); hips.add(legR);
  const rig = { ctx, spec, root, body, hips, upper, neck, head, armL, armR, legL, legR, dims: { legLen, torsoH, armLen, neckL, tw, handY, shoulderX, shoulderY, W, D, LW }, phase };

  // ------------------------------------------------------------ body parts
  const P = ov.parts || {};
  const part = (key, defGeo, defMat, sx, sy, sz) => {
    const o = P[key] || {};
    const m = mesh(o.geo || defGeo, o.mat || defMat);
    if (!o.geo) m.scale.set(sx, sy, sz);
    return m;
  };
  const torsoM = part('torso', atlasBox(ctx, 2, 2, 1), P.torso?.mat ? null : texMat(ctx, torsoTexture(ctx, spec)), W, st.torso, D);
  torsoM.position.y = torsoH / 2; upper.add(torsoM);
  const armMat = P.arm?.mat || texMat(ctx, armTexture(ctx, spec));
  const boxGeo = atlasBox(ctx, 1, 2, 1);
  for (const [g] of [[armL], [armR]]) { const m = part('arm', boxGeo, armMat, LW, st.arms, LW); m.position.y = 0.5 - armLen / 2; g.add(m); }
  const legMat = P.leg?.mat || texMat(ctx, legTexture(ctx, spec));
  for (const g of [legL, legR]) { const m = part('leg', boxGeo, legMat, LW, st.legs, LW); m.position.y = -legLen / 2; g.add(m); }
  if (neckL > 0.05 && !ov.noNeck) {
    const nm = mesh(cached(ctx, 'chr:geo:neck', () => new THREE.BoxGeometry(0.6, 1, 0.6)), ov.neckMat || colMat(ctx, spec.skin));
    nm.scale.y = neckL + 0.1; nm.position.y = torsoH + neckL / 2; upper.add(nm);
  }
  let headM = null, headApi = null;
  if (ov.head && ov.head.build) headApi = ov.head.build(head, ctx, rig) || {};
  else { headM = mesh(headGeometry(ctx), null); head.add(headM); }

  // ------------------------------------------------------------ hair & accessories
  const accTypes = new Set(spec.accessories.map(a => a.type));
  const accColor = (t, d) => { const a = spec.accessories.find(x => x.type === t); return (a && a.color) || d; };
  if (!ov.hairless) {
    let hairStyle = spec.hair.style;
    const wantsCap = hairStyle === 'cap' || accTypes.has('cap');
    if (wantsCap && hairStyle !== 'bald') hairStyle = 'cap';
    const hairGeo = hairGeometry(ctx, hairStyle);
    if (hairGeo) head.add(mesh(hairGeo, colMat(ctx, spec.hair.color, 'hair', { flatShading: true, roughness: 0.62 })));
    if (wantsCap) head.add(mesh(capGeometry(ctx), colMat(ctx, accColor('cap', spec.hair.capColor), 'plastic', { flatShading: true })));
  }
  if (accTypes.has('glasses') || accTypes.has('sunglasses')) {
    head.add(mesh(glassesGeometry(ctx), colMat(ctx, accColor(accTypes.has('sunglasses') ? 'sunglasses' : 'glasses', '#151515'), 'frame', { roughness: 0.4 })));
    if (accTypes.has('sunglasses')) head.add(mesh(lensGeometry(ctx), cached(ctx, 'chr:mat:sunlens', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1d24'), roughness: 0.12, metalness: 0.5 }))));
  }
  const fur = spec.hair.style === 'bald' ? (elder ? '#b9b9b9' : spec.hair.color) : spec.hair.color;
  if (accTypes.has('beard')) head.add(mesh(beardGeometry(ctx), colMat(ctx, accColor('beard', fur), 'hair', { flatShading: true, roughness: 0.62 })));
  if (accTypes.has('mustache')) head.add(mesh(mustacheGeometry(ctx), colMat(ctx, accColor('mustache', fur), 'hair', { flatShading: true, roughness: 0.62 })));
  if (accTypes.has('bow')) { const b = mesh(bowGeometry(ctx), colMat(ctx, accColor('bow', '#e84a7f'))); b.position.set(0.42, HEAD_H / 2 + 0.12, 0.12); b.rotation.set(0.2, 0.3, 0.25); head.add(b); }
  const torsoAcc = (geo, mat) => { const m = mesh(geo, mat); m.scale.set(W, st.torso, D); upper.add(m); return m; };
  if (accTypes.has('tie')) torsoAcc(tieGeometry(ctx), colMat(ctx, accColor('tie', '#c0262d')));
  if (accTypes.has('mayor_chain')) {
    torsoAcc(chainGeometry(ctx), cached(ctx, 'chr:mat:gold', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#e3b23c'), roughness: 0.32, metalness: 0.75 })));
    torsoAcc(gemGeometry(ctx), cached(ctx, 'chr:mat:ruby', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#c81d2a'), roughness: 0.2, metalness: 0.2, emissive: new THREE.Color('#3a0006') })));
  }
  if (accTypes.has('scarf')) torsoAcc(scarfGeometry(ctx), colMat(ctx, accColor('scarf', '#c0392b')));
  if (accTypes.has('apron')) torsoAcc(apronGeometry(ctx), colMat(ctx, accColor('apron', '#f4f4f0')));
  if (spec.shirt.pattern === 'hoodie' && !ov.parts?.torso) torsoAcc(hoodGeometry(ctx), colMat(ctx, shade(spec.shirt.colors[0], -0.08)));
  let skirt = null;
  if (!ov.parts?.leg) {
    if (spec.shirt.pattern === 'dress') { skirt = mesh(skirtGeometry(ctx, 1.95, 1.45), colMat(ctx, spec.shirt.colors[0])); hips.add(skirt); }
    else if (spec.pants.style === 'skirt') { skirt = mesh(skirtGeometry(ctx, 0.95, 1.16), colMat(ctx, spec.pants.color)); hips.add(skirt); }
    if (skirt) { skirt.scale.set(W, st.legs, D); }
  }
  if (spec.eyes === 'glow' && headM) glowEyes(ctx, head, spec.glowColor);
  // sleep masks: up to two; a second one (or slot 'forehead' / alias sleep_mask2) is pushed up on the forehead
  // (a mask without its own `text` reuses the text of the other mask: "He wears 2.")
  let eyesTaken = false;
  const masks = spec.accessories.filter((a) => a.type === 'sleep_mask').slice(0, 2);
  const sharedText = (masks.find((a) => a.text) || {}).text || '';
  for (const a of masks) {
    let slot = a.slot || (eyesTaken ? 'forehead' : 'eyes');
    if (slot === 'eyes' && eyesTaken) slot = 'forehead';
    if (slot === 'eyes') eyesTaken = true;
    head.add(sleepMask(ctx, a.text == null ? { ...a, text: sharedText } : a, slot));
  }
  if (ov.extras) ov.extras(rig);

  // ------------------------------------------------------------ state
  let face = spec.face, talkMats = null;
  let pose = 'stand', poseOpts = {};
  let prop = null, lastT = 0;
  const eyeMode = spec.eyes === 'normal' ? 'normal' : spec.eyes;

  function setFace(id) {
    face = ov.faceMap ? ov.faceMap(id) : normFace(id);
    if (headApi && headApi.setFace) { headApi.setFace(face); talkMats = null; return; }
    if (!headM) return;
    const fm = ov.headMat ? ov.headMat(face) : texMat(ctx, faceTexture(ctx, face, spec.skin, eyeMode));
    headM.material = fm;
    talkMats = face === 'talk' ? [fm, texMat(ctx, faceTexture(ctx, 'talk_closed', spec.skin, eyeMode))] : null;
  }
  function placeProp() {
    if (!prop) return;
    const o = prop.obj;
    if (o.parent) o.parent.remove(o);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0);
    if (prop.grip === 'eyes' && pose === 'binoculars') { prop.mode = 'eyes'; head.add(o); o.position.set(0, EYE_Y + 0.02, HEAD_D / 2 + 0.2); return; }
    const actArm = poseOpts.side === 'left' ? armL : armR;
    if (prop.grip === 'arm') { // rigid in the fist (hammer): follows the arm's rotation
      prop.mode = 'arm'; actArm.add(o); const a = prop.arm || Z3; o.position.set(a[0], handY + a[1], a[2]); return;
    }
    const fy = (y) => y + torsoH / 2 - 1; // keep front props at chest height
    if ((pose === 'offer' && prop.grip === 'hand' && prop.type !== 'umbrella') || (pose === 'carry' && prop.small)) { // between the joined hands
      prop.mode = 'hands'; upper.add(o); if (prop.offerRot) o.rotation.set(prop.offerRot[0], prop.offerRot[1], prop.offerRot[2]); return;
    }
    if (prop.front && (FRONT_POSES.has(pose) || (prop.grip === 'front' && (pose === 'hug' || pose === 'offer')))) {
      prop.mode = 'front'; upper.add(o); o.position.set(prop.front[0], fy(prop.front[1]), prop.front[2] + (D - 1) * 0.5);
      if (prop.frontRot) o.rotation.set(prop.frontRot[0], prop.frontRot[1], prop.frontRot[2]);
      return;
    }
    if (prop.grip === 'front' && pose === 'binoculars') { prop.mode = 'front'; upper.add(o); o.position.set(0, fy(0.9), 1.4); return; }
    if (PINCH_POSES.has(pose) && prop.grip === 'hand') { prop.mode = 'pinch'; upper.add(o); return; }
    prop.mode = 'hand'; upper.add(o);
    if (prop.type === 'sign') o.rotation.y = -Math.PI / 2;
    if (prop.type === 'umbrella') o.rotation.z = -0.32;
  }
  function setProp(p) {
    if (prop) { if (prop.obj.parent) prop.obj.parent.remove(prop.obj); prop = null; }
    if (!p) return;
    prop = buildProp(ctx, p);
    if (prop && ov.propScale) prop.obj.scale.multiplyScalar(ov.propScale);
    placeProp();
    update(lastT);
  }
  function setPose(id, opts) {
    pose = ov.poseMap ? ov.poseMap(id) : normPose(id);
    poseOpts = opts && typeof opts === 'object' ? opts : {};
    rig.poseOpts = poseOpts;
    if (skirt) skirt.visible = !SEATED.has(pose);
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
    const tt = pose === 'fall' ? t : (t + phase) * (elder ? 0.85 : 1) * (ov.timeScale || 1);
    // opts.T = raw shot time (scaled like the creature's clock): counted / one-shot actions start at the shot start
    const pd = ov.poseDefaults && ov.poseDefaults[pose];
    const J = computePose(pose, tt, pose === 'fall' ? poseOpts : { ...pd, narrow: !!(prop && prop.small), ...poseOpts, T: t * (ov.timeScale || 1) }, elder);
    rig.J = J;
    body.position.set(J.body.x, J.body.y, J.body.z); body.rotation.set(J.body.rx, J.body.ry, J.body.rz);
    hips.position.y = J.seated ? J.hips.y : J.kneel ? LW * 0.5 + (J.hips.y - 2) : J.hips.y - 2 + legLen * (1 - (J.legDrop || 0));
    hips.rotation.set(J.hips.rx, 0, J.hips.rz);
    upper.position.y = J.upper.y; upper.rotation.set(J.upper.rx, J.upper.ry, J.upper.rz);
    neck.rotation.set(J.neck.rx, J.neck.ry, J.neck.rz);
    setArm(armL, J.armL, J.twistL); setArm(armR, J.armR, J.twistR);
    const oL = J.offL || Z3, oR = J.offR || Z3;
    armL.position.set(shoulderX + oL[0], shoulderY + oL[1], oL[2]); armR.position.set(-shoulderX + oR[0], shoulderY + oR[1], oR[2]);
    legL.rotation.set(J.legL.rx, J.legL.ry, J.legL.rz); legR.rotation.set(J.legR.rx, J.legR.ry, J.legR.rz);
    if (prop) {
      const ps = ov.propScale || 1, pad = ov.handPad || Z3;
      if (prop.mode === 'hand') {
        _v.set(0, handY, 0).applyQuaternion(armR.quaternion).add(armR.position);
        const h = prop.hand || Z3;
        prop.obj.position.set(_v.x + h[0] * ps + pad[0], _v.y + h[1] * ps + pad[1], _v.z + h[2] * ps + pad[2]);
      } else if (prop.mode === 'hands') {
        _v.set(0, handY, 0).applyQuaternion(armL.quaternion).add(armL.position);
        _v2.set(0, handY, 0).applyQuaternion(armR.quaternion).add(armR.position);
        _v.add(_v2).multiplyScalar(0.5);
        const h = prop.palms || [0, 0.2, 0.3];
        prop.obj.position.set(_v.x + h[0] * ps, _v.y + h[1] * ps + pad[1], _v.z + h[2] * ps + pad[2] * 0.5);
      } else if (prop.mode === 'pinch') {
        const a = poseOpts.side === 'left' ? armL : armR;
        const pp = ov.pinchPoint ? ov.pinchPoint(rig) : [0, handY - 0.32, 0.12];
        _v.set(pp[0], pp[1], pp[2]).applyQuaternion(a.quaternion).add(a.position);
        prop.obj.position.copy(_v);
      }
      if (prop.update) prop.update(t + phase);
    }
    if (talkMats) {
      const open = Math.sin(t * 29.0 + phase) + 0.7 * Math.sin(t * 17.3 + 1.3) > -0.15;
      headM.material = open ? talkMats[0] : talkMats[1];
    }
    if (ov.update) ov.update(t + phase, rig, pose);
  }
  function anchors() {
    root.updateWorldMatrix(true, true);
    const w = (o, x, y, z) => o.localToWorld(new THREE.Vector3(x, y, z));
    const handL = w(armL, 0, handY, 0), handR = w(armR, 0, handY, 0);
    return {
      head: w(head, 0, 0, 0),
      eyes: w(head, 0, EYE_Y, HEAD_D / 2),
      chest: w(upper, 0, torsoH * 0.65, 0.5 * D),
      hands: handL.clone().add(handR).multiplyScalar(0.5),
      handL, handR,
      feet: w(body, 0, 0, 0),
      top: w(head, 0, HEAD_H / 2 + 0.25 + (ov.topExtra || 0), 0),
    };
  }

  setFace(spec.face);
  setPose(ov.defaultPose || 'stand');

  const character = {
    root, height: (legLen + torsoH + neckL + HEAD_H + (ov.heightExtra || 0)) * scale, spec, creature: spec.creature || null,
    setFace, setPose, setProp, update, anchors,
    get face() { return face; }, get pose() { return pose; },
    joints: { body, hips, upper, neck, head, armL, armR, legL, legR },
  };
  root.userData.character = character;
  return character;
}

export { HEAD_W, HEAD_H, HEAD_D, EYE_Y };
