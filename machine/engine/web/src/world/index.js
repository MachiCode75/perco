// World module — public API. Contract: ARCHITECTURE.md §4. Owner: world module.
//   SETS, PROPS, createSet(ctx, id, opts), createProp(ctx, id, opts), applyEnvironment(ctx, {time, weather, interior})
// See README.md in this folder for sets (marks / pois / cameraHints), props and options.
import * as THREE from 'three';
import { Builder, makeRng } from './core.js';
import { getMat } from './materials.js';
import { P, PROP_IDS } from './props.js';
import { buildSet, SET_IDS } from './sets.js';
import { applyEnvironment as applyEnv } from './environment.js';

export const SETS = SET_IDS.slice();
export const PROPS = PROP_IDS.slice();
export const TIMES = ['day', 'golden', 'dusk', 'night'];
export const WEATHERS = ['clear', 'overcast', 'snow', 'rain', 'fog'];

const CACHE_MAX = 3;

/**
 * Build (or reuse) a set. Sets are deterministic per (id, opts.seed) and do NOT consume ctx.rng, so the
 * same location looks identical in every shot. Built sets are cached on ctx (last 3) and reused.
 */
export function createSet(ctx, id, opts = {}) {
  if (!ctx.worldSetCache) ctx.worldSetCache = new Map();
  const key = id + ':' + JSON.stringify(opts || {});
  let inst = ctx.worldSetCache.get(key);
  if (!inst) {
    inst = buildSet(ctx, id, opts || {});
    ctx.worldSetCache.set(key, inst);
    while (ctx.worldSetCache.size > CACHE_MAX) {
      const [k0, old] = ctx.worldSetCache.entries().next().value; ctx.worldSetCache.delete(k0);
      if (old.group.parent) old.group.parent.remove(old.group);
      old.group.traverse((o) => { if (o.geometry && o.name !== 'water') o.geometry.dispose(); });
    }
  } else { ctx.worldSetCache.delete(key); ctx.worldSetCache.set(key, inst); }
  ctx.worldSet = inst;
  return inst;
}

/** Standalone prop (merged by material). opts.seed for a fixed variation, else ctx.rng is used. */
export function createProp(ctx, id, opts = {}) {
  const fn = P[id];
  if (!fn) { console.warn('[world] unknown prop', id); return new THREE.Group(); }
  const rng = opts.seed !== undefined ? makeRng(opts.seed) : (ctx.rng || Math.random);
  const b = new Builder(ctx, { rng, lod: opts.lod || 'near', getMat: (k) => getMat(ctx, k) });
  const info = fn(b, opts) || {};
  const g = b.build('prop:' + id);
  g.userData = { prop: id, info, lamps: b.lamps };
  return g;
}

export function applyEnvironment(ctx, o = {}) { return applyEnv(ctx, o); }
