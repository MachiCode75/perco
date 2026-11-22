// Held props. Each builder returns { obj, grip, ... } where grip says how the prop is carried:
//   'hand'  – follows the right hand, stays upright facing forward (offset `hand`, upper-body space)
//   'front' – two-handed, fixed in front of the chest (sign / carried items) when the pose holds it (`front`)
//   'eyes'  – at the eyes (binoculars in the binoculars pose)
//   'arm'   – rigidly attached to the acting arm at the fist (hammer: swings with the arm)
// Optional: `palms` (offset above the joined hands in the `offer` pose), `offerRot`, `frontRot`, `update(t)` (flicker…).
import * as THREE from 'three';
import { cached, plastic, col } from './util.js';
import { signTexture, dialTexture, letterTexture, screenTexture, cookieTexture, noteTexture, beamTexture, haloTexture } from './textures.js';
import { Builder, M } from './geometry.js';
import { normPropType } from './spec.js';

function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
function mat(ctx, key, make) { return cached(ctx, 'chr:mat:prop:' + key, make); }

const BUILD = {
  binoculars(ctx, p) {
    const g = new THREE.Group();
    const body = cached(ctx, 'chr:geo:prop:binoc', () => {
      const b = new Builder();
      for (const s of [-1, 1]) {
        b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 12), M(s * 0.19, 0, 0.12, Math.PI / 2, 0, 0));
        b.add(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 12), M(s * 0.19, 0, 0.33, Math.PI / 2, 0, 0));
        b.add(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 10), M(s * 0.19, 0, -0.12, Math.PI / 2, 0, 0));
      }
      b.box(0.22, 0.12, 0.3, 0, 0.02, 0.1);
      return b.build();
    });
    g.add(mesh(body, mat(ctx, 'black', () => plastic('#1a1a1c', { roughness: 0.45 }))));
    const lens = cached(ctx, 'chr:geo:prop:binoclens', () => { const b = new Builder(); for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.145, 0.145, 0.02, 14), M(s * 0.19, 0, 0.435, Math.PI / 2, 0, 0)); return b.build(); });
    g.add(mesh(lens, mat(ctx, 'lensblue', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#3d7fe0'), roughness: 0.15, metalness: 0.3, emissive: new THREE.Color('#0d2a66'), emissiveIntensity: 0.6 }))));
    return { obj: g, grip: 'eyes', hand: [0, 0.25, 0.35] };
  },
  sign(ctx, p) {
    const g = new THREE.Group();
    const W = p.width || 3.2, H = p.height || 1.95;
    const geo = cached(ctx, `chr:geo:prop:sign:${W}:${H}`, () => new THREE.BoxGeometry(W, H, 0.08));
    const white = mat(ctx, 'board', () => plastic('#efece4', { roughness: 0.85 }));
    const front = cached(ctx, `chr:mat:prop:signface:${p.text}:${p.color || ''}:${ctx.quality}`, () => new THREE.MeshStandardMaterial({ map: signTexture(ctx, p.text, { color: p.color }), roughness: 0.85 }));
    g.add(mesh(geo, [white, white, white, white, front, white]));
    return { obj: g, grip: 'front', front: [0, 0.95, 1.52], hand: [0, -0.9, 0.3] };
  },
  stopwatch(ctx) {
    const g = new THREE.Group();
    const silver = mat(ctx, 'silver', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#c4c9d1'), roughness: 0.3, metalness: 0.75 }));
    const dial = cached(ctx, 'chr:mat:prop:dial', () => new THREE.MeshStandardMaterial({ map: dialTexture(ctx), roughness: 0.5 }));
    const body = cached(ctx, 'chr:geo:prop:sw', () => new THREE.CylinderGeometry(0.33, 0.33, 0.12, 24).rotateX(Math.PI / 2));
    const m = mesh(body, [silver, dial, silver]);
    // cap UVs: rotate so "60" points up
    m.rotation.z = 0;
    g.add(m);
    const crown = cached(ctx, 'chr:geo:prop:swcrown', () => { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), M(0, 0.39, 0)); b.add(new THREE.TorusGeometry(0.08, 0.025, 5, 10), M(0, 0.5, 0)); b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6), M(0.2, 0.33, 0, 0, 0, -0.7)); return b.build(); });
    g.add(mesh(crown, silver));
    return { obj: g, grip: 'hand', small: true, hand: [0, 0.12, 0.42], palms: [0, 0.4, 0.12] };
  },
  phone(ctx, p) {
    const g = new THREE.Group();
    const body = cached(ctx, 'chr:geo:prop:phone', () => new THREE.BoxGeometry(0.36, 0.66, 0.06));
    g.add(mesh(body, mat(ctx, 'phone:' + (p.color || ''), () => plastic(col(p.color, '#202226'), { roughness: 0.35 }))));
    const scr = cached(ctx, 'chr:geo:prop:screen', () => new THREE.PlaneGeometry(0.3, 0.58));
    const sm = cached(ctx, 'chr:mat:prop:screen', () => new THREE.MeshStandardMaterial({ map: screenTexture(ctx), emissive: new THREE.Color('#ffffff'), emissiveMap: screenTexture(ctx), emissiveIntensity: 0.7, roughness: 0.2 }));
    const s = new THREE.Mesh(scr, sm); s.position.z = 0.031; g.add(s);
    return { obj: g, grip: 'hand', small: true, hand: [0, 0.2, 0.4], palms: [0, 0.38, 0.1] };
  },
  flashlight(ctx, p) { // opts: on (default true), light (SpotLight, default true), beam (length, default 7), intensity, color
    const g = new THREE.Group();
    const on = !(p.on === false || p.on === 'false' || p.on === 0 || p.state === 'off' || p.off === true);
    const body = cached(ctx, 'chr:geo:prop:torch', () => { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 10), M(0, 0, 0, Math.PI / 2, 0, 0)); b.add(new THREE.CylinderGeometry(0.15, 0.1, 0.2, 10), M(0, 0, 0.38, Math.PI / 2, 0, 0)); b.box(0.06, 0.05, 0.12, 0, 0.1, 0.02); return b.build(); });
    g.add(mesh(body, mat(ctx, 'torch:' + (p.color || ''), () => plastic(col(p.color, '#2c2f36'), { roughness: 0.4, metalness: 0.3 }))));
    const lensGeo = cached(ctx, 'chr:geo:prop:torchlens', () => new THREE.CircleGeometry(0.13, 12).translate(0, 0, 0.485));
    const lens = new THREE.Mesh(lensGeo, on ? mat(ctx, 'torchlens', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fffbe6'), toneMapped: false }))
      : mat(ctx, 'torchlens_off', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b3f48'), roughness: 0.15, metalness: 0.4 })));
    g.add(lens);
    if (on) {
      const L = Math.max(2, Math.min(20, +p.beam || 7)), aim = new THREE.Group(); aim.rotation.x = 0.05; g.add(aim);
      const tex = beamTexture(ctx);
      const beamMat = (key, op) => mat(ctx, 'beam:' + key, () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0c0'), map: tex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      for (const [key, r, op] of [['outer', 0.27, 0.2], ['inner', 0.12, 0.32]]) {
        const geo = cached(ctx, `chr:geo:prop:beam:${key}:${L}`, () => new THREE.ConeGeometry(L * r, L, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.47 + L / 2));
        const b = new THREE.Mesh(geo, beamMat(key, op)); b.castShadow = false; b.receiveShadow = false; b.renderOrder = 4; aim.add(b);
      }
      const halo = new THREE.Sprite(mat(ctx, 'torchhalo', () => new THREE.SpriteMaterial({ map: haloTexture(ctx), color: new THREE.Color('#fff2c8'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
      halo.position.set(0, 0, 0.52); halo.scale.setScalar(0.75); halo.renderOrder = 5; g.add(halo);
      if (p.light !== false) {
        const S = new THREE.SpotLight('#fff1c4', +p.intensity || 40, 30, 0.42, 0.5, 1.6);
        S.position.set(0, 0, 0.45); S.target.position.set(0, -0.4, 6); g.add(S); g.add(S.target);
      }
    }
    return { obj: g, grip: 'hand', small: true, hand: [0, 0.1, 0.45], palms: [0, 0.14, 0.3], on };
  },
  book(ctx, p) {
    const g = new THREE.Group();
    const cover = mat(ctx, 'book:' + (p.color || ''), () => plastic(col(p.color, '#b8322c')));
    g.add(mesh(cached(ctx, 'chr:geo:prop:book', () => new THREE.BoxGeometry(0.75, 0.95, 0.2)), cover));
    const pages = mesh(cached(ctx, 'chr:geo:prop:pages', () => new THREE.BoxGeometry(0.7, 0.9, 0.16).translate(0.04, 0, 0)), mat(ctx, 'pages', () => plastic('#f3efe2')));
    g.add(pages);
    return { obj: g, grip: 'hand', hand: [0, 0.3, 0.45], front: [0, 1.0, 1.2] };
  },
  cup(ctx, p) {
    const g = new THREE.Group();
    const geo = cached(ctx, 'chr:geo:prop:cup', () => { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.18, 0.15, 0.38, 14), M()); b.add(new THREE.TorusGeometry(0.1, 0.03, 6, 10), M(0.2, 0.02, 0, 0, 0, 0)); return b.build(); });
    g.add(mesh(geo, mat(ctx, 'cup:' + (p.color || ''), () => plastic(col(p.color, '#f2f2f2'), { roughness: 0.4 }))));
    const coffee = new THREE.Mesh(cached(ctx, 'chr:geo:prop:coffee', () => new THREE.CircleGeometry(0.16, 14).rotateX(-Math.PI / 2).translate(0, 0.17, 0)), mat(ctx, 'coffee', () => plastic('#5a3417', { roughness: 0.3 })));
    g.add(coffee);
    return { obj: g, grip: 'hand', small: true, hand: [0, 0.3, 0.42], palms: [0, 0.22, 0.12] };
  },
  letter(ctx) {
    const g = new THREE.Group();
    const paper = mat(ctx, 'paper', () => plastic('#f3eddd', { roughness: 0.9 }));
    const face = cached(ctx, 'chr:mat:prop:letterface', () => new THREE.MeshStandardMaterial({ map: letterTexture(ctx), roughness: 0.9 }));
    g.add(mesh(cached(ctx, 'chr:geo:prop:letter', () => new THREE.BoxGeometry(0.8, 0.5, 0.02)), [paper, paper, paper, paper, face, paper]));
    return { obj: g, grip: 'hand', small: true, hand: [0, 0.22, 0.42], palms: [0, 0.3, 0.12] };
  },
  umbrella(ctx, p) {
    const g = new THREE.Group();
    const color = col(p.color, '#d63a3a');
    const pole = cached(ctx, 'chr:geo:prop:umbpole', () => { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.04, 0.04, 3.6, 6), M(0, 1.8, 0)); b.add(new THREE.TorusGeometry(0.14, 0.04, 5, 10, Math.PI), M(0.14, 0, 0, 0, 0, Math.PI)); b.add(new THREE.ConeGeometry(0.05, 0.3, 6), M(0, 4.05, 0)); return b.build(); });
    g.add(mesh(pole, mat(ctx, 'umbpole', () => plastic('#2a2a2a'))));
    const canopy = cached(ctx, 'chr:geo:prop:umbcanopy', () => new THREE.ConeGeometry(2.3, 0.9, 8, 1, true).translate(0, 3.55, 0));
    const cm = mat(ctx, 'umb:' + color, () => plastic(color, { side: THREE.DoubleSide, flatShading: true }));
    g.add(mesh(canopy, cm));
    return { obj: g, grip: 'hand', hand: [0.25, -0.05, 0.1] };
  },
  bag(ctx, p) {
    const g = new THREE.Group();
    const geo = cached(ctx, 'chr:geo:prop:bag', () => { const b = new Builder(); b.box(0.85, 0.75, 0.38, 0, -0.55, 0); b.add(new THREE.TorusGeometry(0.22, 0.04, 5, 10, Math.PI), M(0, -0.18, 0)); return b.build(); });
    g.add(mesh(geo, mat(ctx, 'bag:' + (p.color || ''), () => plastic(col(p.color, '#b08655'), { roughness: 0.85 }))));
    return { obj: g, grip: 'hand', hand: [0, 0.1, 0.05], front: [0, 1.25, 1.25] };
  },
  // ---------------------------------------------------------------- v3 props
  cookie(ctx) { // round, light brown, dark chips; the face is turned toward the camera
    const g = new THREE.Group();
    const { caps, side } = cookieGeos(ctx, 'one', [M(0, 0, 0)]);
    g.add(mesh(caps, cookieMat(ctx)), mesh(side, cookieSideMat(ctx)));
    return { obj: g, grip: 'hand', small: true, hand: [0, 0.3, 0.58], palms: [0, 0.42, 0.12], offerRot: [-0.22, 0, 0], front: [0, 0.95, 1.3] };
  },
  plate(ctx, p) { // white plate with 4 cookies, tilted toward the camera so the cookies read
    const g = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.x = 0.55; g.add(tilt);
    const plateGeo = cached(ctx, 'chr:geo:prop:plate', () => { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.92, 0.6, 0.09, 26), M()); b.add(new THREE.CylinderGeometry(0.62, 0.62, 0.02, 22), M(0, 0.05, 0)); return b.build(); });
    tilt.add(mesh(plateGeo, mat(ctx, 'plate:' + (p.color || ''), () => plastic(col(p.color, '#f4f2ec'), { roughness: 0.35 }))));
    const rim = mesh(cached(ctx, 'chr:geo:prop:platerim', () => new THREE.TorusGeometry(0.8, 0.028, 4, 28).rotateX(Math.PI / 2).translate(0, 0.05, 0)), mat(ctx, 'platerim', () => plastic('#3d6fc4', { roughness: 0.4 })));
    tilt.add(rim);
    const flat = (x, z, ry, extra = 0, y = 0.1) => M(x, y, z, -Math.PI / 2 + extra, 0, ry);
    const { caps, side } = cookieGeos(ctx, 'plate', [flat(-0.32, 0.18, 0.4), flat(0.33, 0.16, 1.2), flat(0.02, -0.3, 2.1), flat(0.02, 0.05, 0.7, 0.45, 0.24)]);
    tilt.add(mesh(caps, cookieMat(ctx)), mesh(side, cookieSideMat(ctx)));
    return { obj: g, grip: 'hand', hand: [0.55, 0.12, 0.95], palms: [0, 0.14, 0.42], front: [0, 0.9, 1.45] };
  },
  hammer(ctx) { // wooden handle + steel head, attached to the fist: swings with the arm in the `hammer` pose
    const g = new THREE.Group();
    const handle = cached(ctx, 'chr:geo:prop:hammerhandle', () => { const b = new Builder(); b.rbox(0.22, 0.22, 1.75, 0.06, 0, 0.22, 0.5); return b.build(); });
    g.add(mesh(handle, mat(ctx, 'wood', () => plastic('#c58a4a', { roughness: 0.75 }))));
    const head = cached(ctx, 'chr:geo:prop:hammerhead', () => {
      const b = new Builder();
      b.rbox(0.36, 0.62, 0.4, 0.06, 0, 0.3, 1.36);
      b.add(new THREE.CylinderGeometry(0.21, 0.21, 0.2, 14), M(0, -0.06, 1.36));
      b.add(new THREE.ConeGeometry(0.19, 0.42, 4), M(0, 0.78, 1.36, 0, Math.PI / 4, 0));
      return b.build();
    });
    g.add(mesh(head, mat(ctx, 'steel', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#9aa0aa'), roughness: 0.3, metalness: 0.55 }))));
    return { obj: g, grip: 'arm', arm: [0, 0, 0], palms: [0, 0.1, 0.2] };
  },
  candle(ctx, p) { // white candle in a brass holder; flickering emissive flame + halo + small warm PointLight (light:false disables)
    const g = new THREE.Group();
    const brass = mat(ctx, 'brass', () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#c99a3a'), roughness: 0.35, metalness: 0.65 }));
    const holder = cached(ctx, 'chr:geo:prop:candleholder', () => { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.32, 0.27, 0.06, 18), M(0, 0.03, 0)); b.add(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 14), M(0, 0.11, 0)); b.add(new THREE.TorusGeometry(0.1, 0.03, 5, 10), M(0.33, 0.1, 0)); return b.build(); });
    g.add(mesh(holder, brass));
    const wax = mesh(cached(ctx, 'chr:geo:prop:candle', () => new THREE.CylinderGeometry(0.1, 0.1, 0.52, 12).translate(0, 0.42, 0)), mat(ctx, 'wax:' + (p.color || ''), () => plastic(col(p.color, '#f4efe2'), { roughness: 0.6, emissive: new THREE.Color('#4a3418'), emissiveIntensity: 0.6 })));
    g.add(wax);
    const wick = new THREE.Mesh(cached(ctx, 'chr:geo:prop:wick', () => new THREE.BoxGeometry(0.025, 0.07, 0.025).translate(0, 0.71, 0)), mat(ctx, 'wick', () => plastic('#1c1a18')));
    g.add(wick);
    const flame = new THREE.Group(); flame.position.set(0, 0.74, 0); g.add(flame);
    const fgeo = cached(ctx, 'chr:geo:prop:flame', () => new THREE.SphereGeometry(1, 10, 8).translate(0, 0.75, 0));
    const outer = new THREE.Mesh(fgeo, mat(ctx, 'flameout', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a2a'), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    outer.scale.set(0.085, 0.13, 0.085); outer.castShadow = false;
    const core = new THREE.Mesh(fgeo, mat(ctx, 'flamecore', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4c4'), toneMapped: false })));
    core.scale.set(0.045, 0.08, 0.045); core.castShadow = false; core.userData.noShadow = true;
    flame.add(outer, core);
    const halo = new THREE.Sprite(mat(ctx, 'candlehalo', () => new THREE.SpriteMaterial({ map: haloTexture(ctx), color: new THREE.Color('#ffb04a'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    halo.position.set(0, 0.08, 0); halo.renderOrder = 5; flame.add(halo);
    let L = null; const base = +p.intensity || 2.5;
    if (p.light !== false) { L = new THREE.PointLight('#ffad55', base, +p.distance || 7, 2); L.castShadow = false; L.position.set(0, 0.85, 0.1); g.add(L); }
    const seed = (+p.seed || 0) * 1.7;
    const update = (t) => {
      const n = 0.5 * Math.sin(t * 13.1 + seed) + 0.3 * Math.sin(t * 23.7 + 1.3 + seed) + 0.2 * Math.sin(t * 7.3 + 2.1);
      const m = 0.6 * Math.sin(t * 9.4 + 0.7 + seed) + 0.4 * Math.sin(t * 17.9 + 2.9);
      flame.scale.set(1 + 0.08 * m, 1 + 0.22 * n, 1 + 0.08 * m); flame.rotation.z = 0.12 * m; flame.rotation.x = 0.06 * n;
      halo.scale.setScalar(0.95 + 0.12 * n);
      if (L) L.intensity = base * (0.85 + 0.15 * n);
    };
    update(0);
    return { obj: g, grip: 'hand', small: true, hand: [0, 0.02, 0.66], palms: [0, 0.06, 0.18], front: [0, 0.7, 1.3], update };
  },
  note(ctx, p) { // small paper sheet; `text` is handwritten on it (e.g. "You looked.")
    const g = new THREE.Group();
    const paper = mat(ctx, 'paper', () => plastic('#f3eddd', { roughness: 0.9 }));
    const face = cached(ctx, `chr:mat:prop:note:${p.text || ''}:${ctx.quality}`, () => new THREE.MeshStandardMaterial({ map: noteTexture(ctx, p.text), roughness: 0.9 }));
    const m = mesh(cached(ctx, 'chr:geo:prop:note', () => new THREE.BoxGeometry(0.82, 1.0, 0.015)), [paper, paper, paper, paper, face, paper]);
    m.rotation.z = 0.04; g.add(m);
    return { obj: g, grip: 'hand', small: true, hand: [0, 0.5, 0.6], palms: [0, 0.6, 0.12], offerRot: [-0.1, 0, 0], front: [0, 1.0, 1.45] };
  },
};

// ---------------------------------------------------------------- cookie helpers (caps + side merged per arrangement: 2 draw calls)
const COOKIE_R = 0.36, COOKIE_T = 0.1;
function cookieGeos(ctx, key, mats) {
  return cached(ctx, 'chr:geo:prop:cookie:' + key, () => {
    const caps = new Builder(), side = new Builder();
    const cap = new THREE.CircleGeometry(COOKIE_R, 22);
    const rim = new THREE.CylinderGeometry(COOKIE_R * 0.97, COOKIE_R, COOKIE_T, 22, 1, true).rotateX(Math.PI / 2);
    for (const m of mats) {
      caps.add(cap, new THREE.Matrix4().multiplyMatrices(m, M(0, 0, COOKIE_T / 2)));
      caps.add(cap, new THREE.Matrix4().multiplyMatrices(m, M(0, 0, -COOKIE_T / 2, 0, Math.PI, 0)));
      side.add(rim, m);
    }
    return { caps: caps.build(), side: side.build() };
  });
}
function cookieMat(ctx) { return cached(ctx, 'chr:mat:prop:cookie:' + ctx.quality, () => new THREE.MeshStandardMaterial({ map: cookieTexture(ctx), roughness: 0.85 })); }
function cookieSideMat(ctx) { return mat(ctx, 'cookieside', () => plastic('#b07436', { roughness: 0.9 })); }

export function buildProp(ctx, propSpec) {
  if (!propSpec) return null;
  const p = typeof propSpec === 'string' ? { type: propSpec } : (typeof propSpec === 'object' ? { ...propSpec } : {});
  const type = normPropType(p.type);
  const fn = type && BUILD[type];
  if (!fn) return null;
  try {
    const r = fn(ctx, p);
    r.type = type; r.spec = p;
    const sc = +p.scale;
    if (sc > 0 && isFinite(sc)) r.obj.scale.multiplyScalar(Math.min(6, sc));
    r.obj.traverse(o => { if (o.isMesh && !o.userData.noShadow && o.castShadow === false && o.material && !o.material.transparent) o.castShadow = true; });
    return r;
  } catch (e) { console.warn('[characters] prop failed', type, e && e.message); return null; }
}
