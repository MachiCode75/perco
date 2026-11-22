// World module — "our house" identity shared by house_front, suburban_street and rooftops_sky.
// opts.home = { wall, roof, door, trim, shutter } → the same 2-storey Victorian (style 'side', 32×23, red door by
// default) drawn with exactly those colours in every set, so the family home is recognisable from any angle.
// Pois `home`, `home_window` (upstairs front window, left of the door), `home_door`, `home_roof` always exist.
import { Builder, makeRng } from './core.js';

export const HOME_DEFAULT = { wall: '#a7c7ea', roof: '#3a4150', door: '#b52119', trim: '#f6f5f0', shutter: '#1f2b46' };
const hex = (v) => (typeof v === 'string' && /^#?[0-9a-f]{3,8}$/i.test(v.trim()) ? (v.trim()[0] === '#' ? v.trim() : '#' + v.trim()) : (typeof v === 'string' && /^(rgb|hsl)/i.test(v) ? v : null));
export function hasHome(opts) { return !!(opts && opts.home && typeof opts.home === 'object'); }
/** Victorian plan for our house (house.js buildHouse options) */
export function homePlan(home) {
  const h = home && typeof home === 'object' ? home : {};
  const pick = (k) => hex(h[k]) || hex(h[k === 'wall' ? 'color' : k]) || HOME_DEFAULT[k];
  return { style: 'side', width: 32, depth: 23, floors: 2, doorX: 0, porch: true, chimney: true,
    color: pick('wall'), roof: pick('roof'), door: pick('door'), trim: pick('trim'), shutter: pick('shutter') };
}
/** run fn into a throw-away builder sharing b.rng (keeps the random sequence identical to the default layout) */
export function consumeLike(b, fn) {
  const d = new Builder(b.ctx, { rng: b.rng, lod: b.lod, getMat: b.getMat });
  try { fn(d); } catch (e) { /* only consuming randomness */ }
}
/** build our house with its own rng so its details never depend on the set seed */
export function withHomeRng(b, fn) { const keep = b.rng; b.rng = makeRng('home'); try { return fn(); } finally { b.rng = keep; } }

/**
 * Pois of a Victorian 'side' house placed by sets.js lot() at lot origin (x, zLot) facing +Z (rot 0) or −Z (rot π).
 * info = lot() result ({ w, d, height (ridge y), frontZ }).
 */
export function victorianPois(x, zLot, plan, info) {
  const d = info?.d || plan.depth || 23, W = info?.w || plan.width || 32; const floors = plan.floors || 2;
  const zc = zLot - (d / 2 + 7.5 + 3.2); const fz = zc + d / 2; const F = 1.3, SH = 10.5;
  const span = W - 4; const n = W > 27 ? 4 : W > 20 ? 3 : 2;
  const wx = n === 4 ? -span * 0.13 : -span / 2 + 0.5 * (span / n);
  const r2 = (v) => +v.toFixed(2);
  return {
    home: { x: r2(x), y: 12, z: r2(zc) },
    home_window: { x: r2(x + wx), y: r2(F + (floors - 1) * SH + 2.6 + 2.65), z: r2(fz + 0.35) },
    home_door: { x: r2(x + (plan.doorX || 0)), y: r2(F + 3.65), z: r2(fz + 0.5) },
    home_roof: { x: r2(x), y: r2(info?.height || (F + floors * SH + (d / 2) * 0.72)), z: r2(zc) },
  };
}
/** Pois of a ranch house (props2 house_ranch) with base centre (x, zc), front +Z; info = house_ranch() result */
export function ranchPois(x, zc, info) {
  const r2 = (v) => +v.toFixed(2); const W = info.w, D = info.d;
  const wx = info.garage && Math.abs(info.garage.x) > 0.1 ? -W / 2 + 5 : -6.5;
  return {
    home: { x: r2(x), y: 7, z: r2(zc) },
    home_window: { x: r2(x + wx), y: 5.7, z: r2(zc + D / 2 + 0.35) },
    home_door: { x: r2(x + info.door.x), y: 4.4, z: r2(zc + D / 2 + 0.5) },
    home_roof: { x: r2(x), y: r2(info.height || 16), z: r2(zc) },
  };
}
