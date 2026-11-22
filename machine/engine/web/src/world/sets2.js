// World module — v2 sets (multi-reference): suburban_street, forest_road, hospital_room, warehouse,
// backyard, city_street, town_square, rooftops_sky, card. Registered into SET_BUILDERS (sets.js).
// Same conventions: action near the origin, camera side +Z, background −Z, marks A–D + crowd ≥ 30.
import { pick, range } from './core.js';
import { P } from './props.js';
import { wire } from './props2.js';
import { buildCard } from './cards.js';
import { SET_BUILDERS, INTERIORS, V, M, H, ground, at, backdropHills, treeAt, housePlan, lot, rowSlots, gridSlots, slots, room, outsideView } from './sets.js';

const DESERT_HILLS = { near: ['#9a8466', '#a08a6a', '#8e7a60'], far: ['#8a7a86', '#94848e', '#7e7286'] };

const NEW = {
  suburban_street(ctx, b) {
    // ref5: single-storey stucco/brick ranch houses, dry lawns, driveways, wooden power poles + wires,
    // wide plain asphalt road (camera side), desert haze. Marks on the sidewalk.
    const r = b.rng;
    ground(b, -300, 300, -300, 300, 'grass', '#e2dc9c');
    b.boxB(600, 0.9, 300, 0, -0.95, -250, 'sand', '#e6d6b8', { cast: false });
    at(b, 0, 0, 1, 0, P.sidewalk, { length: 400, width: 4 });
    at(b, 0, 0, 13, 0, P.road_segment, { length: 400, width: 20, centerLine: false, edgeLines: false });
    at(b, 0, 0, 25, Math.PI, P.sidewalk, { length: 400, width: 4 });
    const poles = [];
    for (let i = -4; i <= 4; i++) {
      const x = i * 40 - 4;
      b.lod = Math.abs(x) < 60 ? 'near' : 'mid';
      b.push(x, 0, -24, 0); const info = P.house_ranch(b, { garage: r() < 0.8, boarded: r() < 0.15 }); b.pop();
      if (info.garage) b.boxB(11, 0.1, 21.5, x + info.garage.x, 0, -24 + info.d / 2 + 10.7, 'concrete', '#cfc9be', { cast: false });
      b.boxB(3, 0.1, 18.5, x + info.door.x, 0, -24 + info.d / 2 + 9.3, 'concrete', '#cfc9be', { cast: false });
      if (b.lod === 'near') { for (let k = 0; k < 3; k++) at(b, x - 14 + k * 3.2, 0, -24 + info.d / 2 + 2.2, 0, P.bush, { flowers: false, size: 1.2, color: '#6a8a3a' }); const gx = x + (info.garage ? info.garage.x - 7.5 : 8); if (r() < 0.7 && Math.abs(gx) > 7) at(b, gx, 0, 2.6, 0, P.garbage_can, {}); }
      if (r() < 0.5) treeAt(b, x + 18, -12 + r() * 4, { kind: 'tree_round', height: range(r, 12, 16), color: '#6a8a3a' });
    }
    for (let i = -4; i <= 4; i++) { b.lod = 'far'; b.push(i * 42 + 10, 0, 64, Math.PI); P.house_ranch(b, { garage: r() < 0.6 }); b.pop(); }
    b.lod = 'near';
    for (let x = -200; x <= 200; x += 44) { b.push(x, 0, -2.6, 0); P.power_pole(b, { transformer: Math.round(x / 44) % 2 === 0 }); b.pop(); poles.push(x); }
    for (let i = 0; i < poles.length - 1; i++) for (const dx of [-3.8, 0.8, 3.8]) wire(b, [poles[i] + dx, 25, -2.6], [poles[i + 1] + dx, 25, -2.6], 1.6);
    for (let k = 0; k < 6; k++) { const x = poles[k + 1]; wire(b, [x + 0.8, 25, -2.6], [x + 6, 18, 26], 0.8); }
    backdropHills(b, 0, -100, 420, 22, DESERT_HILLS);
    const crowd = [...rowSlots(-40, 40, 3.4, 1.2, 0, 0.35, (x) => Math.abs(x) < 6), ...rowSlots(-30, 30, 3.6, -5, 0, 0, (x) => Math.abs(x) < 8)];
    return { waterLevel: null,
      marks: { A: M(0, 0.35, 1.2), B: M(3.3, 0.35, 0.8), C: M(-3.3, 0.35, 0.8), D: M(0, 0, -4), road: M(0, 0, 12), driveway: M(-14, 0, -6), crowd },
      pois: { house: V(-4, 6, -24), door: V(-7, 3, -12), garage: V(4, 4, -12), road: V(0, 0, 13), pole: V(-22, 20, -2.6), sky: V(0, 45, -80), across: V(0, 5, 64) },
      cameraHints: { establishing: H([0, 8, 42], [0, 8, -16], 45), aerial: H([40, 60, 70], [0, 0, -20], 45), wide: H([0, 5, 22], [0, 4.5, -1], 50), street: H([70, 6, 13], [-60, 6, 2], 38) },
      env: { day: { top: '#5d8cc4', mid: '#a6bfd2', hor: '#e3d8c4', fog: '#e0d4bf', ground: '#c8b89a', hemiGnd: '#a89470', fogF: 1100 }, golden: { hor: '#ffbf7a', fog: '#e8b888' } },
      shadow: { center: [0, 0, -10], radius: 60 }, lightFocus: [0, 0, 0] };
  },

  forest_road(ctx, b, opts) {
    // ref2: two-lane road running away (−Z) through dense tall pines, guard rail, warning signs
    const r = b.rng;
    ground(b, -300, 300, -600, 120, 'grass', '#a8c890');
    b.push(0, 0, -240, Math.PI / 2); P.road_segment(b, { length: 720, width: 16 }); b.pop();
    for (const s of [-1, 1]) b.boxB(4, 0.06, 720, s * 10, 0, -240, 'dirt', '#c8c0a8', { cast: false });
    for (let z = 30; z > -460; z -= 24) { b.chunk = z < -120 ? 'far' : ''; b.push(12.5, 0, z, Math.PI / 2); P.guard_rail(b, { length: 24 }); b.pop(); }
    b.chunk = '';
    at(b, -11.5, 0, -26, 0.2, P.road_sign, { kind: 'curve' }); at(b, 15, 0, -70, -0.2, P.road_sign, { kind: 'speed', text: '35' });
    if (opts.sign) at(b, -16, 0, -14, 0.35, P.sign_board, { text: opts.sign, width: 9, height: 3.2, y: 5.5, colors: ['#f1e6c8'], bg: '#4a2f1c', underline: false });
    at(b, -10.5, 0, -6, 0, P.lamp_post, {});
    for (let k = 0; k < 300; k++) {
      const side = k % 2 ? 1 : -1; const x = side * (16 + Math.pow(r(), 0.8) * 110); const z = 70 - r() * 560;
      b.lod = z < -120 || Math.abs(x) > 60 ? 'far' : 'near'; b.chunk = z < -120 ? 'far' : '';
      at(b, x, 0, z, r() * 6, P.tree_pine, { height: range(r, 30, 44), trunk: 2.2, color: pick(r, ['#2f5a34', '#35663a', '#2a5030', '#3d6e40']), wide: 0.8 });
    }
    b.chunk = ''; b.lod = 'near';
    backdropHills(b, 0, -250, 420, 22, { near: ['#2f5a3a', '#355f40'], far: ['#56687a', '#5e6e7c'] });
    const crowd = [...rowSlots(-30, 30, 4, 0, 0, 0).map((m) => M(m.x > 0 ? 11 + m.x * 0.05 : -11 + m.x * 0.05, 0, m.x * 1.2 - 6, 0)), ...rowSlots(-6, 6, 3, -10, 0, 0)];
    while (crowd.length < 30) crowd.push(M(crowd.length % 2 ? 10.5 : -10.5, 0, -40 - crowd.length * 2.2, 0));
    return { waterLevel: null,
      marks: { A: M(2.5, 0, 0), B: M(5.8, 0, 0.6), C: M(-0.8, 0, 0.6), D: M(2.5, 0, -4), shoulder: M(-11, 0, 2), crowd },
      pois: { road: V(0, 0, -150), forest: V(-30, 12, -20), sign: V(-11.5, 7.5, -26), rail: V(12.5, 2, -10), horizon: V(0, 6, -460) },
      cameraHints: { establishing: H([2, 6, 32], [0, 7, -120], 48), aerial: H([30, 70, 60], [0, 0, -80], 45), wide: H([2.5, 5, 22], [2, 4.5, -3], 50), shoulder: H([-11, 5, 24], [-2, 5, -40], 45) },
      env: { day: { top: '#6a8cb8', mid: '#9ab2c8', hor: '#c8d4dc', fog: '#b8c6cc', fogN: 50, fogF: 650 }, night: { fogN: 30, fogF: 420 } },
      shadow: { center: [0, 0, -14], radius: 55 }, lightFocus: [0, 0, 0] };
  },

  hospital_room(ctx, b) {
    room(b, { w: 30, d: 32, h: 12, floor: 'tile', floorColor: '#dfe5e8', wall: 'plain', wallColor: '#cfe2ec', backOpen: [{ x: 7.5, y: 3.6, w: 9, h: 6 }], ceilColor: '#f6f8fa' });
    b.push(7.5, 0, -16, 0); P.window(b, { width: 9, height: 6, y: 6.6, mullionY: 0 }); b.quad(9, 2.4, 0, 8.4, 0.75, 'louvre', '#f2f4f6', { cast: false }); b.pop();
    at(b, 0, 0, -9.5, 0, P.hospital_bed, {});
    at(b, -5.2, 0, -12.5, 0.35, P.heart_monitor, { text: '72' });
    at(b, 4.6, 0, -12, 0, P.iv_pole, {});
    b.push(11.5, 0, -3, Math.PI / 2); P.curtain_track(b, { length: 14, h: 11.5 }); b.pop();
    at(b, -10, 0, -4, Math.PI / 2, P.chair, { color: '#7aa0b8' });
    at(b, 5.5, 0, -6.5, 0, P.nightstand, { color: '#c8ccd0' }); at(b, 5.5, 2.8, -6.5, 0, P.potted_plant, { size: 0.7, pot: '#f0f0f0', color: '#e05a7a' });
    at(b, -6, 12, -6, 0, P.ceiling_light, {}); at(b, 6, 12, -6, 0, P.ceiling_light, {});
    b.push(-14.9, 0, 6, Math.PI / 2); P.door(b, { width: 4.5, height: 8.5, color: '#e8ecef' }); b.pop();
    b.push(0, 0, -16, 0); P.clock(b, { y: 10.5 }); b.pop();
    outsideView(b, 'back', 30, 32);
    const crowd = gridSlots(-12, 12, -3, 14, 36, 0, 0, (x, z) => Math.abs(x) < 4.5 && z < 0);
    return { interior: true, waterLevel: null,
      marks: { A: M(4.5, 0, -2.5), B: M(7.8, 0, -2), C: M(-4.5, 0, -2.5), D: M(0, 0, 2), bed: M(0, 3.1, -9, 0), bedside: M(-3.8, 0, -7.5, Math.PI / 2), chair: M(-10, 0, -4, Math.PI / 2), crowd },
      pois: { bed: V(0, 3, -9.5), patient: V(0, 4.5, -12.5), monitor: V(-5.2, 8.5, -12.5), window: V(7.5, 6.6, -16), door: V(-15, 4, 6), curtain: V(11.5, 6, -3) },
      cameraHints: { establishing: H([7, 9.5, 15], [-1, 3.5, -9], 56), aerial: H([0, 11.3, 14], [0, 0, -6], 62), wide: H([1, 6, 15], [0.5, 3.5, -4], 58), monitor: H([-2, 9, -4], [-5.2, 8.3, -12.5], 40), patient: H([1, 7, -1], [0, 4, -12], 45) },
      shadow: { center: [0, 0, -4], radius: 22 }, lightFocus: [0, 6, -6], windowLight: [0.35, 0.55, 0.75] };
  },

  warehouse(ctx, b, opts) {
    // ref5: big corrugated shed, roller door half open, black sign with yellow letters above, crates
    const r = b.rng;
    ground(b, -300, 300, -300, 300, 'grass', '#d8d49a');
    b.boxB(110, 0.1, 60, 0, 0, -6, 'asphalt', '#d8d8d8', { cast: false });
    const W = 64, D = 44, Hh = 22, fz = -16; const zc = fz - D / 2;
    b.boxB(W, Hh, D, 0, 0, zc, 'corrugated', opts.color || '#8f969c');
    b.prim('prism', 0, Hh, zc, W + 2, 6, D + 2, 'corrugated', '#6a7076', { ry: Math.PI / 2 });
    b.boxB(W + 0.6, 0.8, D + 0.6, 0, Hh - 0.4, zc, 'metal', '#5a5f66', { cast: false });
    b.push(0, 0, fz, 0);
    P.roller_door(b, { width: 18, height: 15, open: opts.open ?? 0.4 });
    at(b, 15, 0, 0, 0, P.door, { width: 4, height: 8, color: '#5a5f66', frame: '#3a3f46' });
    P.shop_sign(b, { text: opts.sign || 'TOWN WAREHOUSE', width: 28, height: 4.6, y: 18.6, bg: '#141414', ink: '#f2c230' });
    b.box(1.2, 0.8, 1.2, -11, 14.6, 0.6, 'lampglass', '#fff3c8', { cast: false }); b.box(0.3, 0.3, 1.2, -11, 15.0, 0.3, 'metal', '#333', { cast: false }); b.lamp(-11, 14.0, 1.4, 'post');
    b.pop();
    // crates & pallets outside
    const stacks = [[-17, -9], [-21, -6], [-17, -4.5], [20, -8], [23.5, -5]];
    for (const [x, z] of stacks) { at(b, x, 0, z, r() * 0.4 - 0.2, P.crate, { size: range(r, 3, 3.8) }); if (r() < 0.6) at(b, x + 0.3, 3.3, z, r() * 0.3, P.crate, { size: 2.8 }); }
    at(b, -24, 0, 2, 0.3, P.pallet, {}); at(b, 26, 0, 1, -0.2, P.pallet, {}); at(b, 30, 0, -12, 0, P.garbage_can, { color: '#2f4f3a' }); at(b, 32.5, 0, -12, 0, P.garbage_can, { color: '#2f4f3a' });
    for (let x = -60; x <= 60; x += 40) { b.push(x, 0, 34, 0); P.power_pole(b, {}); b.pop(); }
    for (let i = 0; i < 3; i++) for (const dx of [-3.8, 0.8, 3.8]) wire(b, [-60 + i * 40 + dx, 25, 34], [-20 + i * 40 + dx, 25, 34], 1.6);
    for (let k = 0; k < 4; k++) { b.lod = 'far'; b.push(-120 + k * 80, 0, -110, 0); P.house_ranch(b, {}); b.pop(); }
    b.lod = 'near';
    backdropHills(b, 0, -100, 420, 22, DESERT_HILLS);
    const crowd = gridSlots(-22, 22, -10, 8, 40, 0, 0, (x, z) => Math.abs(x) < 6 && z > -8);
    return { waterLevel: null,
      marks: { A: M(0, 0, -1.5), B: M(3.4, 0, -2), C: M(-3.4, 0, -2), D: M(0, 0, -7), door: M(0, 0, -15), inside: M(0, 0, -22, 0), crowd },
      pois: { door: V(0, 6, -16), sign: V(0, 18.6, -15.8), crates: V(-18, 2, -6), inside: V(0, 4, -32), lamp: V(-11, 14.6, -15) },
      cameraHints: { establishing: H([0, 9, 40], [0, 11.5, -16], 46), aerial: H([40, 50, 50], [0, 5, -20], 45), wide: H([0, 5, 20], [0, 4.5, -3], 50), sign: H([0, 14, 6], [0, 18, -16], 40) },
      env: { day: { hor: '#e3d8c4', fog: '#e0d4bf', mid: '#a6bfd2', top: '#5d8cc4' } },
      shadow: { center: [0, 0, -10], radius: 55 }, lightFocus: [0, 0, -10] };
  },

  backyard(ctx, b) {
    // ref3: lawn behind the house, privacy fence, swing set, treehouse in a big tree; house back at +Z
    const r = b.rng;
    ground(b, -200, 200, -200, 200);
    b.push(0, 0, -30, 0); P.privacy_fence(b, { length: 72 }); b.pop();
    for (const s of [-1, 1]) { b.push(s * 36, 0, 4, Math.PI / 2); P.privacy_fence(b, { length: 68 }); b.pop(); }
    at(b, -14, 0, -18, 0.2, P.treehouse, {});
    at(b, 14, 0, -15, -0.25, P.swing_set, {});
    for (let x = -30; x <= 30; x += 6) if (Math.abs(x + 14) > 6) at(b, x, 0, -27.5, 0, P.bush, { size: 1.3 });
    at(b, 24, 0, -24, 0, P.flowerbed, { width: 8, depth: 3 }); treeAt(b, 28, 10, { kind: 'tree_round' }); treeAt(b, -28, 14, { kind: 'tree_pine' });
    // house back with a deck (behind the camera)
    b.push(0, 0, 58, Math.PI); P.house_victorian(b, { style: 'side', porch: false, color: '#a7c7ea', floors: 2, width: 32, depth: 23 }); b.pop();
    b.boxB(26, 1.3, 9, 0, 0, 42, 'planks', '#9a7452'); for (let k = 0; k < 3; k++) b.boxB(5, 1.3 - k * 0.43, 1.0, 0, 0, 37 - k, 'planks', '#9a7452');
    for (const s of [-1, 1]) b.box(10, 0.3, 0.3, s * 8, 4, 37.6, 'satin', '#f4f1e8', { cast: false });
    at(b, 6, 1.3, 43, Math.PI, P.table, { width: 5, depth: 4 });
    // neighbours over the fence
    for (let k = 0; k < 3; k++) { b.lod = 'mid'; b.push(-46 + k * 46, 0, -72, 0); lot(b, housePlan(r, k + 1), { yard: 6 }); b.pop(); }
    b.lod = 'near';
    for (let k = 0; k < 10; k++) treeAt(b, range(r, -90, 90), -100 - r() * 30, { kind: 'tree_pine' });
    backdropHills(b, 0, 0, 430);
    const crowd = gridSlots(-26, 26, -8, 26, 40, 0, 0, (x, z) => (Math.abs(x) < 5 && z < 6));
    return { waterLevel: null,
      marks: { A: M(0, 0, 2), B: M(3.4, 0, 1.4), C: M(-3.4, 0, 1.4), D: M(0, 0, -4), treehouse: M(-14, 11.3, -18, 0), swing: M(9.5, 0, -15, 0), ladder: M(-11, 0, -10.5, Math.PI), deck: M(0, 1.3, 40, Math.PI), crowd },
      pois: { treehouse: V(-14, 14, -18), swing: V(14, 3, -15), fence: V(0, 3, -30), house: V(0, 12, 48), back_door: V(0, 3, 46.5), tree: V(-14, 22, -18) },
      cameraHints: { establishing: H([8, 7, 30], [-4, 9, -18], 48), aerial: H([30, 45, 50], [0, 0, -10], 45), wide: H([0, 5, 22], [0, 4.5, -2], 50), house: H([0, 6, -12], [0, 9, 48], 50), treehouse: H([-6, 9, 4], [-14, 13, -18], 45) },
      shadow: { center: [0, 0, -6], radius: 55 }, lightFocus: [0, 0, 0] };
  },

  city_street(ctx, b) {
    // ref6: brick brownstone rows with stoops along a street running away (−Z), lamps, trees,
    // parked cars, distant skyline at the vanishing point.
    const r = b.rng;
    ground(b, -300, 300, -700, 120, 'concrete', '#bdbab4');
    b.push(0, 0, -250, Math.PI / 2); P.road_segment(b, { length: 800, width: 20, centerLine: false }); b.pop();
    for (const dx of [-0.35, 0.35]) b.boxB(0.25, 0.03, 800, dx, 0.04, -250, 'plain', '#e8c23a', { cast: false });
    for (const s of [-1, 1]) { b.push(s * 16, 0, -250, s > 0 ? -Math.PI / 2 : Math.PI / 2); P.sidewalk(b, { length: 800, width: 12 }); b.pop(); }
    let i = 0;
    for (let z = 60; z > -420; z -= 18, i++) for (const s of [-1, 1]) {
      const far = z < -90; b.chunk = far ? 'far' : ''; b.lod = far ? 'far' : Math.abs(z) < 50 ? 'near' : 'mid';
      b.push(s * 34, 0, z, s > 0 ? -Math.PI / 2 : Math.PI / 2); P.brownstone(b, { floors: 3 + ((i + (s > 0 ? 1 : 0)) % 3 === 0 ? 1 : 0), flip: ((i + (s > 0 ? 1 : 0)) % 2) === 1 }); b.pop();
    }
    b.chunk = ''; b.lod = 'near';
    for (let z = 40; z > -400; z -= 30) for (const s of [-1, 1]) { b.chunk = z < -90 ? 'far' : ''; at(b, s * 11.2, 0.35, z + (s > 0 ? 15 : 0), 0, P.lamp_post, { height: 12 }); if (z > -150 && ((z / 30) | 0) % 2 === 0) { b.boxB(2.4, 0.3, 2.4, s * 13, 0.3, z + 7, 'dirt', '#ffffff', { cast: false }); at(b, s * 13, 0.35, z + 7, 0, P.tree_round, { height: 14 }); } }
    b.chunk = '';
    for (const [x, z] of [[-7.5, -14], [7.5, -40], [-7.5, -66], [7.5, -100]]) at(b, x, 0, z, 0, P.car, { color: pick(r, ['#c0392b', '#2e6bc6', '#e8e4dc', '#3c8d5a', '#e3b23c']) });
    // skyline
    b.chunk = 'bg'; b.cast = false; b.receive = false;
    for (let k = 0; k < 16; k++) { const x = -160 + k * 21 + range(r, -6, 6); at(b, x, 0, -560 - r() * 120, 0, P.tower, { width: range(r, 18, 34), depth: 24, height: range(r, 70, 190), spire: r() < 0.3, color: pick(r, ['#b8c4d0', '#c8ccd4', '#a8b4c4']) }); }
    b.chunk = ''; b.cast = true; b.receive = true;
    const crowd = [...rowSlots(-36, 36, 3.6, 0, 0, 0).map((m) => M(m.x * 0.2 + 3, 0, -m.x * 0.6 - 10, 0)), ...rowSlots(-24, 24, 4, 0, 0, 0.35).map((m) => M(12, 0.35, m.x - 6, -Math.PI / 2))];
    return { waterLevel: null,
      marks: { A: M(3, 0, 0), B: M(6.4, 0, 0.6), C: M(-0.4, 0, 0.6), D: M(3, 0, -4), sidewalk: M(12.5, 0.35, 4, -Math.PI / 2), stoop: M(18, 5, 6, -Math.PI / 2), crowd },
      pois: { skyline: V(0, 70, -560), road: V(0, 0, -150), stoop: V(18, 3, 4), door: V(22, 7, 4), lamp: V(11.2, 10, 10), buildings: V(-22, 15, -10) },
      cameraHints: { establishing: H([4, 7, 40], [1, 12, -120], 45), aerial: H([40, 55, 60], [0, 0, -50], 45), wide: H([3, 5, 22], [3, 4.5, -2], 50), stoop: H([4, 6, 16], [20, 6, 3], 48) },
      env: { golden: { top: '#6a78b8', mid: '#e8a8a0', hor: '#ffc4a0', fog: '#f0b8a0' }, dusk: { hor: '#ff9a6a', fog: '#c88a8a' } },
      shadow: { center: [0, 0, -14], radius: 60 }, lightFocus: [0, 0, 0] };
  },

  town_square(ctx, b, opts) {
    // ref6: cobbled plaza, statue on a plinth with a bronze plaque, benches, lamps, civic building + rows
    const r = b.rng; const sz = -22;
    ground(b, -300, 300, -300, 300, 'asphalt');
    b.boxB(76, 0.25, 70, 0, 0, sz + 4, 'cobble', '#ffffff', { cast: false });
    at(b, 0, 0.25, sz, 0, P.statue, { kind: opts.statue || 'head', title: opts.title ?? 'ELIAS HART', text: opts.text ?? 'THE ONE WHO NEVER SLEPT' });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; const x = Math.sin(a) * 15, z = sz + Math.cos(a) * 15; if (Math.cos(a) > 0.8) continue; at(b, x, 0.25, z, a + Math.PI, P.bench, {}); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; at(b, Math.sin(a) * 21, 0.25, sz + Math.cos(a) * 21, 0, P.lamp_post, { height: 12 }); }
    for (const [x, z] of [[-30, sz - 26], [30, sz - 26], [-30, sz + 30], [30, sz + 30], [-34, sz], [34, sz]]) { at(b, x, 0.25, z, 0, P.tree_round, { height: 16 }); }
    for (const s of [-1, 1]) at(b, s * 9, 0.25, sz + 22, 0, P.planter, { width: 5 });
    b.push(0, 0, sz - 60, 0); P.civic_building(b, {}); b.pop();
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { b.lod = Math.abs(k - 2) < 2 ? 'mid' : 'far'; b.push(s * 62, 0, sz - 36 + k * 18, s > 0 ? -Math.PI / 2 : Math.PI / 2); P.brownstone(b, { floors: 3 + (k % 2), flip: k % 2 === 1 }); b.pop(); }
    for (let k = 0; k < 6; k++) { b.lod = 'far'; b.push(-45 + k * 18, 0, 46, Math.PI); P.brownstone(b, { floors: 3 + (k % 2) }); b.pop(); }
    b.lod = 'near';
    b.chunk = 'bg'; b.cast = false; b.receive = false;
    for (let k = 0; k < 10; k++) at(b, -220 + k * 48, 0, -520 - r() * 80, 0, P.tower, { width: range(r, 22, 34), height: range(r, 70, 150), spire: r() < 0.3 });
    b.chunk = ''; b.cast = true; b.receive = true;
    // crowd: a ring around the statue facing it (the reference's gathering), then rows facing camera
    const crowd = [];
    for (const R of [10.5, 13, 16]) for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2 + (R > 11 ? 0.17 : 0); const x = Math.sin(a) * R, z = sz + Math.cos(a) * R; if (Math.cos(a) > 0.85) continue; crowd.push(M(+x.toFixed(2), 0.25, +z.toFixed(2), Math.atan2(-x, sz - z))); }
    const audience = gridSlots(-18, 18, -4, 12, 36, 0, 0.25, (x, z) => Math.abs(x) < 5 && z < 4);
    return { waterLevel: null,
      marks: { A: M(0, 0.25, 0), B: M(3.4, 0.25, -0.6), C: M(-3.4, 0.25, -0.6), D: M(0, 0.25, -6), plaque: M(0, 0.25, sz + 8.5, Math.PI), statue_top: M(0, 18, sz, 0), crowd, audience },
      pois: { statue: V(0, 14, sz), plaque: V(0, 5.2, sz + 4.3), hall: V(0, 15, sz - 50), benches: V(14, 1, sz), lamp: V(0, 10, sz + 21), square: V(0, 0, sz) },
      cameraHints: { establishing: H([0, 12, 36], [0, 10, sz - 4], 48), aerial: H([40, 55, 55], [0, 0, sz], 45), wide: H([0, 5, 22], [0, 5.5, -6], 50), plaque: H([0, 6, sz + 15], [0, 5.4, sz + 4.3], 32), statue: H([3, 3, sz + 18], [0, 14, sz], 50) },
      shadow: { center: [0, 0, sz + 6], radius: 50 }, lightFocus: [0, 0, sz + 10] };
  },

  rooftops_sky(ctx, b) {
    // ref3/ref5: low camera looking up over the roofs with lots of sky; marks high above the houses
    // for a giant creature (`giant`, on the ground behind the row) or a face in the sky (`sky`).
    const r = b.rng;
    ground(b, -300, 300, -300, 300);
    at(b, 0, 0, 4, 0, P.sidewalk, { length: 400, width: 4 }); at(b, 0, 0, 16, 0, P.road_segment, { length: 400, width: 16 });
    for (let k = -3; k <= 3; k++) { b.lod = Math.abs(k) <= 1 ? 'near' : 'mid'; b.push(k * 44, 0, -6, 0); lot(b, housePlan(r, k + 4), { yard: 8 }); b.pop(); }
    for (let k = -4; k <= 4; k++) { b.lod = 'far'; b.chunk = 'far'; b.push(k * 46 + 20, 0, -96, 0); lot(b, housePlan(r, k + 9), { yard: 6, fence: false }); b.pop(); }
    for (let k = -3; k <= 3; k++) { b.lod = 'far'; b.chunk = 'far'; b.push(k * 44 + 10, 0, 74, Math.PI); lot(b, housePlan(r, k + 2), { yard: 6 }); b.pop(); }
    b.chunk = ''; b.lod = 'near';
    for (let k = 0; k < 14; k++) treeAt(b, range(r, -150, 150), -70 - r() * 15, { kind: 'tree_pine', height: range(r, 24, 32) });
    for (let x = -132; x <= 132; x += 24) if (Math.abs(x) > 10) at(b, x, 0, 6.6, 0, P.lamp_post, {});
    backdropHills(b, 0, -60, 430);
    const crowd = [...rowSlots(-40, 40, 3.4, 4, 0, 0.35, (x) => Math.abs(x) < 6), ...rowSlots(-30, 30, 3.6, 12, 0, 0, (x) => Math.abs(x) < 5)];
    return { waterLevel: null,
      marks: { A: M(0, 0.35, 4), B: M(3.4, 0.35, 3.4), C: M(-3.4, 0.35, 3.4), D: M(0, 0, 9), giant: M(0, 0, -62, 0), sky: M(0, 58, -110, 0), roof: M(0, 33, -38, 0), crowd },
      pois: { sky: V(0, 60, -110), giant: V(0, 30, -62), rooftops: V(0, 30, -40), moon: V(-60, 90, -260), house: V(0, 14, -30), road: V(0, 0, 16) },
      cameraHints: { establishing: H([0, 1.8, 40], [0, 52, -80], 60), aerial: H([0, 45, 80], [0, 20, -60], 50), wide: H([0, 4, 24], [0, 9, 0], 52), up: H([0, 1.6, 14], [0, 48, -90], 60), over: H([0, 34, 30], [0, 34, -110], 50) },
      shadow: { center: [0, 0, -20], radius: 70 }, lightFocus: [0, 0, 0] };
  },

  card(ctx, b, opts) {
    const def = buildCard(ctx, b, P, opts || {});
    return def;
  },
};

Object.assign(SET_BUILDERS, NEW);
for (const id of ['hospital_room', 'card']) INTERIORS.add(id);
export const NEW_SET_IDS = Object.keys(NEW);
