// Held props. Each builder returns { obj, grip } where grip says how the prop is carried:
//   'hand'  – follows the right hand, stays upright facing forward (offset in body space)
//   'front' – two-handed, fixed in front of the chest (sign / carried items) when the pose holds it
//   'eyes'  – at the eyes (binoculars in the binoculars pose)
import * as THREE from 'three';
import { cached, plastic, col } from './util.js';
import { signTexture, dialTexture, letterTexture, screenTexture } from './textures.js';
import { Builder, M } from './geometry.js';

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
    return { obj: g, grip: 'hand', hand: [0, 0.12, 0.42] };
  },
  phone(ctx, p) {
    const g = new THREE.Group();
    const body = cached(ctx, 'chr:geo:prop:phone', () => new THREE.BoxGeometry(0.36, 0.66, 0.06));
    g.add(mesh(body, mat(ctx, 'phone:' + (p.color || ''), () => plastic(col(p.color, '#202226'), { roughness: 0.35 }))));
    const scr = cached(ctx, 'chr:geo:prop:screen', () => new THREE.PlaneGeometry(0.3, 0.58));
    const sm = cached(ctx, 'chr:mat:prop:screen', () => new THREE.MeshStandardMaterial({ map: screenTexture(ctx), emissive: new THREE.Color('#ffffff'), emissiveMap: screenTexture(ctx), emissiveIntensity: 0.7, roughness: 0.2 }));
    const s = new THREE.Mesh(scr, sm); s.position.z = 0.031; g.add(s);
    return { obj: g, grip: 'hand', hand: [0, 0.2, 0.4] };
  },
  flashlight(ctx, p) {
    const g = new THREE.Group();
    const body = cached(ctx, 'chr:geo:prop:torch', () => { const b = new Builder(); b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 10), M(0, 0, 0, Math.PI / 2, 0, 0)); b.add(new THREE.CylinderGeometry(0.15, 0.1, 0.2, 10), M(0, 0, 0.38, Math.PI / 2, 0, 0)); return b.build(); });
    g.add(mesh(body, mat(ctx, 'torch:' + (p.color || ''), () => plastic(col(p.color, '#2c2f36'), { roughness: 0.4, metalness: 0.3 }))));
    const lens = new THREE.Mesh(cached(ctx, 'chr:geo:prop:torchlens', () => new THREE.CircleGeometry(0.13, 12).translate(0, 0, 0.485)), mat(ctx, 'torchlens', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6c8') })));
    g.add(lens);
    const beam = new THREE.Mesh(cached(ctx, 'chr:geo:prop:beam', () => new THREE.ConeGeometry(1.4, 7, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.49 + 3.5)),
      mat(ctx, 'beam', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3b0'), transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    beam.castShadow = false; g.add(beam);
    if (p.light !== false) {
      const L = new THREE.SpotLight('#fff1c4', p.intensity || 40, 30, 0.42, 0.5, 1.6);
      L.position.set(0, 0, 0.45); L.target.position.set(0, -0.4, 6); g.add(L); g.add(L.target);
    }
    return { obj: g, grip: 'hand', hand: [0, 0.1, 0.45] };
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
    return { obj: g, grip: 'hand', hand: [0, 0.3, 0.42] };
  },
  letter(ctx) {
    const g = new THREE.Group();
    const paper = mat(ctx, 'paper', () => plastic('#f3eddd', { roughness: 0.9 }));
    const face = cached(ctx, 'chr:mat:prop:letterface', () => new THREE.MeshStandardMaterial({ map: letterTexture(ctx), roughness: 0.9 }));
    g.add(mesh(cached(ctx, 'chr:geo:prop:letter', () => new THREE.BoxGeometry(0.8, 0.5, 0.02)), [paper, paper, paper, paper, face, paper]));
    return { obj: g, grip: 'hand', hand: [0, 0.22, 0.42] };
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
};

export function buildProp(ctx, propSpec) {
  if (!propSpec) return null;
  const p = typeof propSpec === 'string' ? { type: propSpec } : { ...propSpec };
  const type = String(p.type || '').toLowerCase();
  const fn = BUILD[type];
  if (!fn) return null;
  try {
    const r = fn(ctx, p);
    r.type = type; r.spec = p;
    r.obj.traverse(o => { if (o.isMesh && o.castShadow === false && o.material && !o.material.transparent) o.castShadow = true; });
    return r;
  } catch (e) { console.warn('[characters] prop failed', type, e && e.message); return null; }
}
