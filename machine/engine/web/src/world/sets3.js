// World module — v3 sets: bedroom (variants boy | girl | parents, window rig with stacked curtains, sill items,
// boards, open sash, moonlight), library, shop_front. Registered into SET_BUILDERS (sets.js).
// Same conventions: action near the origin, camera side +Z, background −Z, marks A–D + crowd ≥ 30.
import { pick, range, shade } from './core.js';
import { P } from './props.js';
import { SET_BUILDERS, INTERIORS, V, M, H, ground, at, backdropHills, treeAt, housePlan, lot, shoreSide, rowSlots, gridSlots, room, outsideView } from './sets.js';
import { createWaterSurface } from './water.js';
import { windowRig } from './windows.js';
import { windowUnit } from './house.js';
import { drawingsMaterial, postersMaterial, starsMaterial, canvasMaterial } from './props3.js';
import { drawNewsSheet } from './cards.js';
import { artRect } from './textures.js';

const LOOKS = {
  default: { wall: '#b9cbe0', bed: '#2f4f8f', curtains: '#3f5f9a', floor: '#a8774a', rug: '#ffffff' },
  boy: { wall: '#86b0da', wains: '#5f9a6e', bed: '#2f7a4a', curtains: '#2c4f86', floor: '#a8774a', rug: '#8ab8e8' },
  girl: { wall: '#efbcd8', wains: '#c7aee8', bed: '#e8709c', curtains: '#b07ad6', floor: '#b8865a', rug: '#d8b8f0' },
  parents: { wall: '#d9ccb0', bed: '#7a2a34', curtains: '#6e5a3e', floor: '#8e5e3a', rug: '#e8d8c0' },
};

/** lower wall band + chair rail on the four walls of a w×d room (behind furniture) */
function wainscot(b, w, d, color, hgt = 3.6) {
  const keep = b.cast; b.cast = false;
  const band = (len, x, z, ry) => { b.push(x, 0, z, ry); b.box(len, hgt, 0.1, 0, hgt / 2, 0.05, 'woodpanel', color); b.box(len, 0.3, 0.25, 0, hgt + 0.1, 0.12, 'satin', '#f4f1e8'); b.pop(); };
  band(w, 0, -d / 2, 0); band(d, -w / 2, 0, Math.PI / 2); band(d, w / 2, 0, -Math.PI / 2); band(w, 0, d / 2, Math.PI);
  b.cast = keep;
}
/** quad on a wall (wall plane z=0 local, faces +Z) using an atlas cell */
function wallDecal(b, key, x, y, w, h, rect, o = {}) {
  if (o.paper) b.box(w + 0.16, h + 0.16, 0.03, x, y, 0.03, 'plain', o.paper, { rz: o.rz || 0, cast: false });
  b.quad(w, h, x, y, 0.06, key, '#ffffff', { uvRect: rect, rz: o.rz || 0, cast: false });
  if (o.tape) for (const s of [-1, 1]) b.box(0.5, 0.18, 0.02, x + s * (w / 2 - 0.1), y + h / 2 - 0.02, 0.08, 'plain', '#e6dcb8', { rz: s * 0.7 + (o.rz || 0), cast: false });
}
const CELL4 = (i) => { const c = i % 2, r = Math.floor(i / 2); return [c / 2, 1 - (r + 1) / 2, (c + 1) / 2, 1 - r / 2]; };

const NEW = {
  bedroom(ctx, b, opts = {}) {
    const variant = ['boy', 'girl', 'parents'].includes(opts.variant) ? opts.variant : 'default';
    const L = LOOKS[variant]; const wall = typeof opts.wall === 'string' ? opts.wall : L.wall;
    room(b, { w: 28, d: 26, h: 12, floor: 'floorwood', floorColor: L.floor, wall: 'wallpaper', wallColor: wall, backOpen: [{ x: 0, y: 3.6, w: 9, h: 6.6 }] });
    if (L.wains) wainscot(b, 28, 26, L.wains);
    b.push(0, 0, -13, 0);
    const rig = windowRig(ctx, b, { w: 9, h: 6.6, y: 6.9, curtains: opts.curtains, windowOpen: opts.windowOpen, boarded: opts.boarded, sill: opts.sill, defCurtains: { color: L.curtains }, light: [0.3, 0.5, -0.8], seed: 5 });
    b.pop();
    const parents = variant === 'parents';
    // bed against the left wall (headboard at x=-14)
    at(b, parents ? -8.2 : -9, 0, 2, Math.PI / 2, P.bed, { color: L.bed, width: parents ? 11 : 7 });
    at(b, -11.5, 0, -5.5, 0, P.nightstand, {}); at(b, -11.5, 2.8, -5.5, 0, P.lamp, { kind: 'table', shade: variant === 'girl' ? '#f4c0dc' : undefined });
    if (parents) {
      at(b, -11.5, 0, 9.6, 0, P.nightstand, {}); at(b, -11.5, 2.8, 9.6, 0, P.lamp, { kind: 'table' });
      // dresser with mirror (back wall, right of the window)
      b.boxB(7, 4.4, 2.6, 9, 0, -11.6, 'floorwood', '#5e3a22');
      for (let k = 0; k < 3; k++) for (const s of [-1, 1]) { b.box(3.1, 1.2, 0.1, 9 + s * 1.7, 0.75 + k * 1.35, -10.27, 'floorwood', '#6e4628', { cast: false }); b.box(0.5, 0.15, 0.15, 9 + s * 1.7, 0.95 + k * 1.35, -10.2, 'metal', '#d0b060', { cast: false }); }
      b.box(4.4, 4.4, 0.3, 9, 7.4, -12.75, 'floorwood', '#5e3a22'); b.quad(3.8, 3.8, 9, 7.4, -12.58, 'metal', '#c8d0d8', { cast: false });
      b.push(-13.4, 0, 2, Math.PI / 2); P.picture_frame(b, { width: 5, height: 3.6, y: 8.6, variant: 0 }); b.pop();
      at(b, 10.5, 0, 4.5, -Math.PI / 2 - 0.4, P.armchair, { color: '#7a6a52' });
      b.push(13.4, 0, -4, -Math.PI / 2); P.picture_frame(b, { width: 3, height: 4, y: 7.5, variant: 1 }); b.pop();
    } else {
      at(b, 8.5, 0, -10.8, 0, P.table, { width: 6, depth: 3.2, height: 3.2, color: variant === 'girl' ? '#f2eef2' : '#7a5030' });
      at(b, 10, 3.2, -11.3, 0, P.lamp, { kind: 'table', shade: variant === 'girl' ? '#f4c0dc' : '#e8d29a' });
      at(b, 8.5, 0, -7.6, Math.PI, P.chair, { color: variant === 'girl' ? '#f2eef2' : '#7a5030' });
      at(b, 11.5, 0, 4, -Math.PI / 2, P.bookshelf, { width: 5, height: 8, color: variant === 'girl' ? '#f0e8ee' : undefined });
    }
    at(b, 0, 0, 1, 0, P.rug, { width: 10, depth: 7, color: L.rug });
    if (variant === 'default') { b.push(-13.4, 0, 2, Math.PI / 2); P.picture_frame(b, { width: 4, height: 3, y: 8.5, variant: 2 }); b.pop(); }
    if (variant === 'boy') {
      const pk = postersMaterial(ctx); const cell = (i) => { const c = i % 2, r = Math.floor(i / 2); return [c / 2, 1 - (r + 1) / 2, (c + 1) / 2, 1 - r / 2]; };
      b.push(0, 0, -12.95, 0); wallDecal(b, pk, -10.2, 7.6, 3.0, 4.5, cell(0)); wallDecal(b, pk, 10.4, 8.2, 2.6, 3.9, cell(2)); b.pop();
      b.push(-13.95, 0, 2, Math.PI / 2); wallDecal(b, pk, -3.2, 8.4, 2.6, 3.9, cell(1)); wallDecal(b, pk, 3.2, 8.4, 2.6, 3.9, cell(3)); b.pop();
      b.push(13.95, 0, -4, -Math.PI / 2); wallDecal(b, pk, 0, 7.4, 2.8, 4.2, cell(2)); b.pop();
      at(b, 6.2, 0, 1.5, 0, P.ball, {});
      b.boxB(3.4, 2.2, 2.2, 3.6, 0, 9.5, 'satin', '#d8402a'); b.box(3.5, 0.3, 2.3, 3.6, 2.3, 9.5, 'satin', '#2c4f86'); // toy box
    }
    if (variant === 'girl') {
      const dk = drawingsMaterial(ctx); const sk = starsMaterial(ctx);
      b.push(0, 0, -12.95, 0);
      wallDecal(b, dk, -10.4, 8.6, 2.6, 2.6, CELL4(0), { tape: true, rz: 0.05 }); wallDecal(b, dk, -8.0, 5.8, 2.4, 2.4, CELL4(2), { tape: true, rz: -0.07 });
      wallDecal(b, dk, 10.2, 8.4, 2.6, 2.6, CELL4(1), { tape: true, rz: -0.04 });
      b.quad(5.0, 2.4, -10.2, 10.5, 0.09, sk, '#ffffff', { cast: false, uvRect: [0, 0, 1, 1] }); b.quad(5.0, 2.4, 9.8, 10.5, 0.09, sk, '#ffffff', { cast: false, uvRect: [1, 0, 0, 1] });
      b.pop();
      b.push(13.95, 0, -4, -Math.PI / 2); wallDecal(b, dk, 0, 7.6, 2.6, 2.6, CELL4(3), { tape: true, rz: 0.06 }); b.pop();
      b.push(-13.95, 0, 2, Math.PI / 2); b.quad(10, 3.2, 0, 9.6, 0.09, sk, '#ffffff', { cast: false, uvRect: [0, 0, 1, 1] }); b.pop();
      b.push(0, 11.9, -2, 0); b.prim('plane', 0, 0, 0, 12, 6, 1, sk, '#ffffff', { rx: Math.PI / 2, uv: 'unit', cast: false }); b.pop(); // ceiling stars
      at(b, -11.2, 2.9, 3.6, Math.PI / 2, P.plush, { size: 1 });
      at(b, 5.5, 0, 9, -0.5, P.plush, { size: 0.8, color: '#e8e0d0', bow: '#7a5ae0' });
    }
    // view through the window: the town across the lake (lower than the 1st-floor room)
    const keep = b.chunk; b.chunk = 'out'; b.cast = false; b.lod = 'far';
    b.push(0, -14, -40, 0);
    ground(b, -200, 200, -20, 10);
    b.push(0, 0, -100, 0); shoreSide(b, { half: 140, docks: [0], church: -44, seedShift: 5 }); b.pop();
    b.boxB(400, 1, 100, 0, -10.5, -50, 'sand', '#3a5a64', { cast: false });
    b.pop(); b.chunk = keep; b.cast = true; b.lod = 'near';
    backdropHills(b, 0, -150, 420);
    const water = createWaterSurface(ctx, { x0: -250, x1: 250, z0: -142, z1: -48, level: -15.5 });
    const crowd = gridSlots(-8, 10, -6, 10, 36, 0, 0, (x, z) => x < -3.5 && z > -4 && z < 8);
    return { interior: true, waterLevel: null, extra: [water, ...rig.extra], update: (t) => rig.update(t), onEnv: (e) => rig.onEnv(e),
      marks: { A: M(0, 0, -9.5), B: M(3.4, 0, -8.5), C: M(-3, 0, -8.5), D: M(2, 0, 4), bed: M(parents ? -8.2 : -9, 2.6, 2, Math.PI / 2), desk: parents ? M(9, 0, -8, Math.PI) : M(8.5, 0, -7.6, Math.PI), crowd },
      pois: { window: V(0, 7, -14), across: V(0, -8, -150), bed: V(-9, 2, 2), desk: V(8.5, 3.2, -10.8), door: V(13, 4, 8), lamp: V(-11.5, 4, -5.5),
        sill: rig.world.sill, outside: rig.world.outside, curtains: V(0, 7.6, -11.8), wall_art: V(-10, 8, -12.9) },
      cameraHints: { establishing: H([6, 8, 12], [-1, 4.5, -12], 58), aerial: H([0, 11.3, 12], [0, 0, -4], 62), wide: H([1, 6, 12], [0, 4.5, -9], 58), window: H([1.5, 7.5, -4], [0, 2, -80], 40),
        curtains: H([0, 7.2, 4.5], [0, 7.3, -12], 66), sill: H([1.4, 5.4, -6.4], [0, 3.85, -11.05], 34), outside: H([0.5, 6.6, -3], [0, 7.2, -14], 50) },
      shadow: { center: [0, 0, 0], radius: 20 }, lightFocus: [0, 5, -6], windowLight: [0.3, 0.5, -0.8] };
  },

  library(ctx, b, opts = {}) {
    const W = 44, D = 40, Hh = 16;
    room(b, { w: W, d: D, h: Hh, floor: 'floorwood', floorColor: '#8a5a36', wall: 'wallpaper', wallColor: typeof opts.wall === 'string' ? opts.wall : '#d4c6a0', leftOpen: [{ x: -8, y: 4, w: 6, h: 8 }, { x: 6, y: 4, w: 6, h: 8 }] });
    wainscot(b, W, D, '#6a4428', 3.2);
    for (const z of [-8, 6]) { b.push(-22, 0, z, Math.PI / 2); P.window(b, { width: 6, height: 8, y: 8, curtains: '#3f6a46' }); b.pop(); }
    // shelves along the back wall and a high "QUIET PLEASE" sign
    for (const x of [-18.5, -12, -5.5, 5.5, 12, 18.5]) at(b, x, 0, -19.1, 0, P.bookshelf, { width: 6.5, height: 12, color: '#5a3820' });
    b.boxB(4.4, 12, 1.8, 0, 0, -19.1, 'floorwood', '#5a3820'); b.push(0, 0, -18.2, 0); P.clock(b, { y: 9.5 }); b.pop();
    at(b, 0, 0, -18.1, 0, P.sign_board, { text: 'QUIET PLEASE', width: 9, height: 1.6, y: 13.8, posts: false, colors: ['#f2e6c8'], bg: '#3a5a3a', underline: false, back: false });
    // free-standing double-sided shelf rows (right half)
    for (const z of [-10, -3, 4]) for (const x of [11, 17.4]) { at(b, x, 0, z - 0.85, Math.PI, P.bookshelf, { width: 6.4, height: 9, color: '#6a4428' }); at(b, x, 0, z + 0.85, 0, P.bookshelf, { width: 6.4, height: 9, color: '#6a4428' }); }
    // reading tables with green banker lamps (left half)
    for (const z of [-6, 5]) {
      at(b, -11, 0, z, 0, P.table, { width: 10, depth: 4.6, height: 3.2, color: '#6a3e22' });
      for (const s of [-1, 1]) { at(b, -11 + s * 2.6, 3.2, z, 0, P.lamp, { kind: 'table', shade: '#2e7a44' }); for (const sz of [-1, 1]) at(b, -11 + s * 2.6, 0, z + sz * 3.4, sz > 0 ? Math.PI : 0, P.chair, { color: '#6a3e22' }); }
      b.boxB(1.6, 0.35, 2.2, -11, 3.2, z + 0.4, 'plain', '#8a2a2a'); b.boxB(1.4, 0.3, 2.0, -11.1, 3.55, z + 0.3, 'plain', '#2a4a7a'); // books on the table
    }
    // librarian desk (L counter) with a bell, book stacks, a green lamp
    b.boxB(10, 3.6, 2.4, 3, 0, -12, 'floorwood', '#4e321e'); b.boxB(2.4, 3.6, 5, 9.2, 0, -10.6, 'floorwood', '#4e321e');
    b.boxB(10.4, 0.25, 2.8, 3, 3.6, -12, 'satin', '#2f4a36'); b.boxB(2.8, 0.25, 5.4, 9.2, 3.6, -10.6, 'satin', '#2f4a36');
    at(b, 0, 3.85, -12.2, 0, P.lamp, { kind: 'table', shade: '#2e7a44' });
    b.cyl(0.3, 0.1, 5.4, 3.85, -11.4, 'metal', '#c8a040', 10); b.sphere(0.25, 5.4, 4.05, -11.4, 'metal', '#d8b050', 8);
    for (let k = 0; k < 4; k++) b.boxB(1.5, 0.35, 2.0, 7.2, 3.85 + k * 0.35, -12.1, 'plain', pick(b.rng, ['#8a2a2a', '#2a4a7a', '#3a6a3a', '#c8a040']), { ry: (k % 2) * 0.2 });
    // newspaper rack (back-left corner, facing +Z)
    const papers = [{ title: opts.newspaper?.title || 'ELM DAILY', text: opts.newspaper?.text || 'TOWN NEWS', date: opts.newspaper?.date }, { title: 'ELM DAILY', text: 'BLACKOUT AGAIN' }, { title: 'THE COUNTY HERALD', text: 'FAIR THIS WEEKEND' }, { title: 'ELM DAILY', text: 'NEW LIBRARY HOURS' }, { title: 'THE GAZETTE', text: 'SNOW ON THE WAY' }, { title: 'ELM DAILY', text: 'MAYOR SPEAKS' }];
    const nx = -15, nz = -15.4;
    b.boxB(7, 7.2, 1.6, nx, 0, nz - 0.4, 'floorwood', '#5a3820');
    papers.forEach((pp, i) => {
      const key = canvasMaterial(ctx, 'news:' + JSON.stringify(pp), () => drawNewsSheet(360, 560, pp), { rough: 0.95, emissive: 0.05 });
      const col = i % 3, row = Math.floor(i / 3); const x = nx - 2.3 + col * 2.3, y = 4.9 - row * 3.0;
      b.box(2.1, 0.3, 0.5, x, y - 1.45, nz + 0.6, 'floorwood', '#6a4428', { cast: false });
      b.quad(1.9, 2.95, x, y, nz + 0.45, key, '#ffffff', { rx: -0.18, cast: false });
    });
    b.box(7, 0.35, 0.3, nx, 7.2, nz + 0.4, 'floorwood', '#6a4428', { cast: false });
    // globe + ceiling lights
    b.cyl(0.8, 0.2, -18.5, 0, 14, 'floorwood', '#4e321e', 10); b.cyl(0.15, 3.2, -18.5, 0.2, 14, 'metal', '#8a6a3a', 6); b.sphere(1.2, -18.5, 4.6, 14, 'plastic', '#3a7ab8', 12); b.blob(0.7, -18.2, 4.9, 14.8, 'plastic', '#5aa04a', { sy: 0.6 });
    for (const [x, z] of [[-10, -6], [10, -6], [-10, 8], [10, 8]]) at(b, x, Hh, z, 0, P.ceiling_light, {});
    b.push(21.9, 0, 12, -Math.PI / 2); P.door(b, { width: 5, height: 9, color: '#5a3820' }); b.pop();
    outsideView(b, 'left', W, D);
    const crowd = gridSlots(-19, 19, -16, 18, 72, 0, 0, (x, z) => (Math.abs(x) < 6 && z > -4 && z < 6) || (x > 7 && z < 6 && z > -12) || (x < -4 && x > -18 && (Math.abs(z + 6) < 3 || Math.abs(z - 5) < 3)) || (z < -9 && x > -2 && x < 11));
    return { interior: true, waterLevel: null,
      marks: { A: M(0, 0, 2), B: M(3.4, 0, 1.4), C: M(-3.4, 0, 1.4), D: M(0, 0, -4), table: M(-13.6, 0, -2.6, Math.PI), librarian: M(3, 0, -14.6, 0), shelves: M(14.2, 0, -6.6, Math.PI), newspapers: M(-15, 0, -11.8, Math.PI), crowd },
      pois: { shelves: V(14.2, 5.5, -9.1), table: V(-11, 3.4, -6), newspapers: V(-15, 4.6, -14.9), desk: V(3, 3.9, -12), window: V(-22, 8, -8), door: V(21.6, 4.5, 12), lamp: V(-13.6, 4.6, -6), sign: V(0, 13.8, -18) },
      cameraHints: { establishing: H([17, 11, 19], [-4, 5, -10], 58), aerial: H([0, 15.3, 19], [0, 0, -6], 62), wide: H([0.5, 6, 19], [0, 4.2, -2], 58),
        newspapers: H([-12.5, 6.2, -7.5], [-15, 4.4, -15], 42), table: H([-4, 7.2, 3], [-11, 3.4, -6], 50), shelves: H([7, 6.2, 1.2], [15, 5.6, -9], 50), desk: H([3.5, 6.2, -2], [3, 4.2, -12], 50) },
      shadow: { center: [0, 0, -2], radius: 28 }, lightFocus: [-4, 6, -4], windowLight: [-0.6, 0.55, 0.3] };
  },

  shop_front(ctx, b, opts = {}) {
    // small-town store facade on a sidewalk, big sign (opts.sign), display window (opts.display 'curtains'|'tools'|'none')
    const r = b.rng; const sign = typeof opts.sign === 'string' && opts.sign.trim() ? opts.sign : "PIKE'S HARDWARE";
    ground(b, -300, 300, -300, 300, 'grass', '#b8c890');
    b.boxB(300, 0.35, 8.5, 0, -0.01, 1.75, 'concrete', '#d4d1ca', { cast: false }); b.boxB(300, 0.37, 0.4, 0, -0.01, 5.8, 'concrete', '#c4c1ba', { cast: false });
    at(b, 0, 0, 14, 0, P.road_segment, { length: 300, width: 16 }); at(b, 0, 0, 24.5, Math.PI, P.sidewalk, { length: 300, width: 5 });
    const shop = (cx, w, hgt, brick, text, sg) => { // building with facade at z=-2.5
      const d = 24, fz = -2.5; b.boxB(w, hgt, d, cx, 0, fz - d / 2, 'brick', brick);
      b.boxB(w + 0.8, 1.2, d + 0.6, cx, hgt, fz - d / 2, 'satin', '#e8e0d0'); b.boxB(w + 1.4, 0.5, d + 1.2, cx, hgt + 1.2, fz - d / 2, 'satin', '#5a4a3a');
      b.push(cx, 0, fz, 0); for (const wx of [-w / 3, 0, w / 3]) windowUnit(b, wx, 12.4, 3.2, 5, { trim: '#efe8da', variant: pick(r, [0, 1, 6, 7]) });
      windowUnit(b, -w * 0.18, 1.8, w * 0.42, 5.6, { trim: '#3a3a3a', variant: 4, lit: true, big: true }); b.quad(3.6, 7.2, w * 0.27, 3.6, 0.05, 'door', '#3a2a1a', { cast: false });
      b.pop();
      if (sg) at(b, cx, 0, fz + 0.05, 0, P.shop_sign, { text, width: Math.min(w - 2, 22), height: 3.2, y: 10.2, bg: sg[0], ink: sg[1] });
    };
    // the hardware store (centre)
    const SW = 32, fz = -2.5; const BR = '#c87a5a';
    b.boxB(SW, 22, 19.5, 0, 0, -16.75, 'brick', BR);
    // facade slab (z −7 … −2.5) with openings for the display window (x −13…2, y 1.4…8.6) and the door (x 5.2…9.8, y 0…9.2)
    const slab = (x0, x1, y0, y1) => b.boxB(x1 - x0, y1 - y0, 4.5, (x0 + x1) / 2, y0, -4.75, 'brick', BR);
    slab(-SW / 2, -13, 0, 22); slab(2, 5.2, 0, 22); slab(9.8, SW / 2, 0, 22); slab(-13, 2, 0, 1.4); slab(-13, 2, 8.6, 22); slab(5.2, 9.8, 9.2, 22);
    b.boxB(4.6, 9.2, 0.4, 7.5, 0, -6.9, 'plain', '#2a2622', { cast: false });
    b.boxB(SW + 0.8, 1.4, 24.6, 0, 22, fz - 12, 'satin', '#efe8da'); b.boxB(SW + 1.6, 0.6, 25.4, 0, 23.4, fz - 12, 'satin', '#3a4a5a');
    b.push(0, 0, fz, 0);
    for (const [wx, wy] of [[-12.6, 15.2], [12.6, 15.2], [-4, 17.9], [4, 17.9]]) windowUnit(b, wx, wy, 3.2, 3.4, { trim: '#efe8da', variant: pick(r, [0, 1, 6, 7]), shutters: false });
    // display window (x −13 .. 2) with a shallow lit box behind the glass
    const dx0 = -13, dx1 = 2, dw = dx1 - dx0, dcx = (dx0 + dx1) / 2, dy0 = 1.4, dy1 = 8.6;
    b.boxB(SW, dy0, 0.6, 0, 0, 0.3, 'stone', '#8a8580');
    b.box(dw, dy1 - dy0, 0.2, dcx, (dy0 + dy1) / 2, -4.3, 'plain', '#e8dcc4', { cast: false });
    b.box(dw, 0.4, 4.4, dcx, dy0 - 0.2, -2.3, 'floorwood', '#6a4428', { cast: false });
    for (const s of [-1, 1]) b.box(0.3, dy1 - dy0, 4.4, dcx + s * dw / 2, (dy0 + dy1) / 2, -2.3, 'plain', '#d8ccb4', { cast: false });
    b.box(dw, 0.4, 4.4, dcx, dy1 + 0.2, -2.3, 'plain', '#d8ccb4', { cast: false });
    b.box(dw - 1, 0.25, 0.4, dcx, dy1 - 0.25, -0.8, 'bulb', '#fff2d0', { cast: false }); b.lamp(dcx, dy1 - 1, -1.5, 'interior');
    for (const x of [dx0, dcx, dx1]) b.box(0.45, dy1 - dy0 + 0.4, 0.5, x, (dy0 + dy1) / 2, 0.05, 'satin', '#2f4a3a');
    b.box(dw + 0.4, 0.5, 0.6, dcx, dy1 + 0.25, 0.05, 'satin', '#2f4a3a'); b.box(dw + 0.6, 0.35, 1.0, dcx, dy0 + 0.1, 0.3, 'satin', '#2f4a3a');
    b.quad(dw - 0.3, dy1 - dy0, dcx, (dy0 + dy1) / 2, 0.08, 'glass', '#dfeaf2', { cast: false });
    const display = ['curtains', 'tools', 'none'].includes(opts.display) ? opts.display : 'tools';
    b.push(dcx, dy0, -2.3, 0);
    if (display === 'curtains') {
      const cols = ['#3f5f9a', '#b84a3a', '#f0e6cc', '#262a36', '#6a8a4a', '#c89a3a'];
      b.cyl(0.1, dw - 1.2, -(dw - 1.2) / 2, 6.6, -1.2, 'metal', '#8a8a8a', 6, { rz: -Math.PI / 2, cast: false });
      for (let i = 0; i < 6; i++) { // hanging panels, pleated
        const x = -dw / 2 + 1.5 + i * ((dw - 3) / 5); const c = cols[i]; const n = 5;
        for (let k = 0; k < n; k++) b.box(0.5, 5.2, 0.06, x - 0.9 + k * 0.45, 3.9, -1.2 + (k % 2) * 0.18, 'fabric', shade(c, k % 2 ? -0.04 : 0.02), { ry: (k % 2 ? 1 : -1) * 0.4, cast: false });
        b.box(2.2, 0.3, 0.12, x, 6.45, -1.1, 'fabric', shade(c, -0.08), { cast: false });
      }
      for (let p = 0; p < 4; p++) for (let k = 0; k < 4; k++) b.boxB(2.4, 0.42, 1.6, -dw / 2 + 2.2 + p * 3.4, k * 0.43, 0.9, 'fabric', cols[(p + k * 2) % cols.length], { ry: (k % 2 - 0.5) * 0.08, cast: false });
      at(b, 5.2, 0, 1.2, -0.15, P.sign_board, { text: typeof opts.price === 'string' ? opts.price : '3 FOR $20', width: 3.2, height: 1.8, y: 1.0, posts: false, colors: ['#c81e1e'], bg: '#fbf6e6', underline: false, back: false });
    } else if (display === 'tools') {
      for (let k = 0; k < 9; k++) b.cyl(0.55, 1.1, -dw / 2 + 1.5 + k * 1.3, 0, 1.0 + (k % 2) * 0.4, 'metal', pick(r, ['#c83a2a', '#2a6ac8', '#f2c230', '#3a9a4a', '#f4f4f0']), 10);
      for (let k = 0; k < 6; k++) b.cyl(0.5, 1.0, -dw / 2 + 2.0 + k * 1.3, 1.1, 1.2, 'metal', pick(r, ['#c83a2a', '#2a6ac8', '#f2c230']), 10);
      for (const s of [-1, 1]) b.beam(3.6 + s * 0.8, 0, -1.4, 3.6 + s * 0.8, 6.4, -1.0, 0.22, 'planks', '#b08a50'); for (let k = 1; k < 6; k++) b.box(1.6, 0.18, 0.22, 3.6, k * 1.1, -1.4 + k * 0.07, 'planks', '#b08a50');
      for (let k = 0; k < 3; k++) { b.beam(-4 + k * 1.2, 0.3, -1.6, -4.2 + k * 1.2, 6, -1.6, 0.12, 'planks', '#b08a50'); b.box(1.0, 0.3, 0.2, -4.2 + k * 1.2, 6, -1.5, 'metal', '#6a6f76'); }
      at(b, 5.2, 0, 1.2, -0.15, P.sign_board, { text: typeof opts.price === 'string' ? opts.price : 'SALE', width: 3.0, height: 1.6, y: 0.9, posts: false, colors: ['#c81e1e'], bg: '#fbf6e6', underline: false, back: false });
    }
    b.pop();
    // door (x≈7.5) + transom + OPEN sign, awning, big sign with gooseneck lamps
    for (const s2 of [-1, 1]) b.box(0.4, 9.2, 0.5, 7.5 + s2 * 2.3, 4.6, -0.6, 'satin', '#2f4a3a'); b.box(5.0, 0.5, 0.5, 7.5, 9.0, -0.6, 'satin', '#2f4a3a');
    b.quad(4.2, 8.4, 7.5, 4.2, -0.75, 'door', '#3a5a4a', { cast: false }); b.quad(3.0, 3.4, 7.5, 5.7, -0.7, 'glass', '#dfeaf2', { cast: false });
    at(b, 7.5, 0, -0.66, 0, P.sign_board, { text: opts.open === false ? 'CLOSED' : 'OPEN', width: 1.8, height: 0.8, y: 4.6, posts: false, colors: ['#c81e1e'], bg: '#f6f2e6', underline: false, back: false });
    const aw = ['#2f6a4a', '#f2ecd8'];
    for (let k = 0; k < 12; k++) b.prim('box', -14 + k * (25.5 / 12) + 25.5 / 24, 10.0, 2.0, 25.5 / 12 + 0.02, 0.18, 4.4, 'fabric', aw[k % 2], { rx: 0.42 });
    b.box(25.6, 0.7, 0.12, -1.25, 9.05, 4.0, 'fabric', aw[0], { cast: false });
    P.shop_sign(b, { text: sign, lines: sign.length > 11 ? 2 : 1, width: 17, height: 6.0, y: 13.6, bg: opts.signColor || '#7a1c1c', ink: opts.signInk || '#fff4dc' });
    for (const x of [-6, 6]) { b.beam(x, 15.8, 0.3, x, 16.2, 1.6, 0.1, 'metal', '#2a2a2a', { cast: false }); b.prim('frus8', x, 15.95, 1.7, 0.45, 0.45, 0.45, 'lampglass', '#fff0c8', { rx: Math.PI, cast: false }); b.lamp(x, 15.6, 2.4, 'porch'); }
    b.pop();
    shop(-34, 30, 18, '#d8b89a', 'BAKERY', ['#f2e6c8', '#7a3a1a']); shop(34, 30, 19, '#9aa4ac', 'DINER', ['#c81e1e', '#ffffff']);
    for (const s of [-1, 1]) { b.lod = 'mid'; b.push(s * 78, 0, -8, 0); lot(b, housePlan(r, s > 0 ? 2 : 5), { yard: 6 }); b.pop(); b.lod = 'near'; }
    for (let k = 0; k < 7; k++) { b.lod = 'far'; b.push(-90 + k * 30, 0, 74, Math.PI); P.brownstone(b, { floors: 3 + (k % 2), flip: k % 2 === 1 }); b.pop(); }
    b.lod = 'near';
    for (const x of [-17, 17, -51, 51]) at(b, x, 0.35, 5.2, 0, P.lamp_post, {});
    at(b, -20, 0.35, 3.6, 0, P.bench, { length: 5 }); at(b, 21, 0.35, 4.6, 0, P.trash_can, {}); at(b, 26, 0, 10.5, Math.PI / 2, P.car, { color: '#3c8d5a' }); at(b, -46, 0, 10.5, -Math.PI / 2, P.car, { color: '#e8e4dc' });
    for (let k = 0; k < 10; k++) treeAt(b, range(r, -150, 150), -60 - r() * 40, { kind: 'tree_round' });
    backdropHills(b, 0, 0, 430);
    const crowd = [...rowSlots(-44, 44, 3.4, 3.2, 0, 0.35, (x) => Math.abs(x) < 6 || Math.abs(x + 20) < 3), ...rowSlots(-30, 30, 3.6, 24.5, Math.PI, 0.35), ...rowSlots(-44, -20, 3.4, 0.2, 0, 0.35), ...rowSlots(20, 44, 3.4, 0.2, 0, 0.35)];
    return { waterLevel: null,
      marks: { A: M(0, 0.35, 2.6), B: M(3.4, 0.35, 2.0), C: M(-3.4, 0.35, 2.0), D: M(0, 0.35, -0.6), door: M(7.5, 0.35, -0.6, 0), window: M(-5.5, 0.35, 0.4, Math.PI), road: M(0, 0, 13), crowd },
      pois: { sign: V(0, 13.6, -2.1), window: V(-5.5, 5, -2.4), display: V(-5.5, 4.2, -4.2), door: V(7.5, 4.6, -2.8), awning: V(-1.25, 9.5, 2), road: V(0, 0, 14), bakery: V(-34, 10.2, -2.4), diner: V(34, 10.2, -2.4), lamp: V(17, 9.5, 5.2) },
      cameraHints: { establishing: H([0, 8, 44], [0, 10, -4], 45), aerial: H([40, 50, 60], [0, 5, -10], 45), wide: H([0, 5.5, 22], [0, 5.2, -1], 50),
        sign: H([0, 8, 40], [0, 12.6, -2], 40), window: H([-3.4, 5.4, 8.5], [-5.5, 4.4, -3.6], 45), street: H([60, 6, 12], [-40, 7, -2], 36) },
      shadow: { center: [0, 0, -4], radius: 50 }, lightFocus: [0, 0, 0] };
  },
};

Object.assign(SET_BUILDERS, NEW);
INTERIORS.add('library');
export const V3_SET_IDS = Object.keys(NEW);
