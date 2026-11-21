// CharacterSpec constants, normalisation (graceful fallbacks) and random townsperson generation.
import { col, noPureBlack } from './util.js';

export const FACES = ['neutral', 'smile', 'happy', 'grin', 'worried', 'sad', 'cry', 'scream', 'angry',
  'surprised', 'scared', 'sleep', 'smirk', 'talk', 'wink'];
export const POSES = ['stand', 'idle', 'wave', 'walk', 'run', 'sit', 'binoculars', 'hold_sign', 'point',
  'arms_up', 'hug', 'cry', 'shrug', 'look_down', 'lie', 'fall', 'jump', 'talk', 'wade', 'carry'];
export const HAIR_STYLES = ['spiky', 'short', 'bowl', 'long', 'ponytail', 'bun', 'bald', 'cap', 'messy', 'curly'];
export const SHIRT_PATTERNS = ['solid', 'stripes_h', 'stripes_v', 'plaid', 'polka', 'argyle_vest', 'suit',
  'overalls', 'hoodie', 'dress', 'pajamas_stars', 'tee_logo', 'vest', 'cardigan'];
export const PANTS_STYLES = ['pants', 'shorts', 'skirt', 'none'];
export const PANTS_PATTERNS = ['solid', 'jeans', 'floral', 'stripes', 'plaid', 'stars', 'polka'];
export const ACCESSORIES = ['glasses', 'sunglasses', 'tie', 'mayor_chain', 'cap', 'bow', 'scarf', 'apron', 'beard', 'mustache'];
export const PROPS_HELD = ['binoculars', 'sign', 'stopwatch', 'phone', 'flashlight', 'book', 'cup', 'letter', 'umbrella', 'bag'];
export const BUILDS = ['adult', 'kid', 'elder'];
export const LOGOS = ['dino', 'star', 'heart', 'smiley', 'none'];

const FACE_ALIAS = { happy_closed: 'happy', laugh: 'happy', joy: 'happy', crying: 'cry', tears: 'cry', yell: 'scream', shout: 'scream',
  shock: 'surprised', shocked: 'surprised', fear: 'scared', afraid: 'scared', mad: 'angry', asleep: 'sleep', sleeping: 'sleep',
  speak: 'talk', speaking: 'talk', frown: 'sad', concerned: 'worried', nervous: 'worried', default: 'smile', calm: 'neutral' };
export function normFace(id) {
  const s = String(id || '').toLowerCase().trim();
  if (FACES.includes(s)) return s;
  if (FACE_ALIAS[s]) return FACE_ALIAS[s];
  return 'smile';
}
const POSE_ALIAS = { idle_stand: 'idle', standing: 'stand', walking: 'walk', running: 'run', sitting: 'sit', seated: 'sit',
  sign: 'hold_sign', holding_sign: 'hold_sign', look: 'binoculars', cheer: 'arms_up', celebrate: 'arms_up', hands_up: 'arms_up',
  crying: 'cry', lying: 'lie', lay: 'lie', falling: 'fall', jumping: 'jump', talking: 'talk', speak: 'talk', wading: 'wade', hold: 'carry' };
export function normPose(id) {
  const s = String(id || '').toLowerCase().trim();
  if (POSES.includes(s)) return s;
  if (POSE_ALIAS[s]) return POSE_ALIAS[s];
  return 'stand';
}

// Per-pattern defaults: colours, sleeve length, neckline.
const PATTERN_DEFAULTS = {
  solid: { colors: ['#3a7bd5'], sleeves: 'short', neck: 'round' },
  stripes_h: { colors: ['#f2c511', '#151515'], sleeves: 'long', neck: 'none' },
  stripes_v: { colors: ['#f4f4f4', '#3a7bd5'], sleeves: 'long', neck: 'round' },
  plaid: { colors: ['#c0392b', '#151515'], sleeves: 'long', neck: 'collar' },
  polka: { colors: ['#f08cb4', '#ffffff'], sleeves: 'long', neck: 'round' },
  argyle_vest: { colors: ['#2c4f9e', '#f2c94c', '#f4f4f0'], sleeves: 'long', neck: 'v' },
  suit: { colors: ['#1e2f6b', '#f4f4f4', '#c0262d'], sleeves: 'long', neck: 'v' },
  overalls: { colors: ['#d9302c', '#3d63b8', '#f4f4f4'], sleeves: 'short', neck: 'round' },
  hoodie: { colors: ['#7f8c8d', '#f4f4f4'], sleeves: 'long', neck: 'hood' },
  dress: { colors: ['#e86a92', '#ffffff'], sleeves: 'short', neck: 'round' },
  pajamas_stars: { colors: ['#22346e', '#f2d24b', '#f4f4f4'], sleeves: 'long', neck: 'v' },
  tee_logo: { colors: ['#e2453c', '#f2c511', '#2f5fb3'], sleeves: 'short', neck: 'round' },
  vest: { colors: ['#3e7c55', '#f4f4f0'], sleeves: 'long', neck: 'v' },
  cardigan: { colors: ['#f2c3cf', '#f4efe6'], sleeves: 'long', neck: 'v' },
};
export function patternDefaults(p) { return PATTERN_DEFAULTS[p] || PATTERN_DEFAULTS.solid; }

function colorsArr(v, defs) {
  const arr = Array.isArray(v) ? v : (v ? [v] : []);
  const out = [];
  for (let i = 0; i < Math.max(arr.length, defs.length); i++) out.push(col(arr[i], defs[i] || defs[defs.length - 1]));
  return out.map(noPureBlack);
}

const HAIR_ALIAS = { spikes: 'spiky', buzz: 'short', crew: 'short', bob: 'bowl', pony: 'ponytail', none: 'bald', hat: 'cap', curls: 'curly', afro: 'curly', wavy: 'messy' };

export function normalizeSpec(spec) {
  const s = (spec && typeof spec === 'object') ? spec : {};
  const build = BUILDS.includes(s.build) ? s.build : (s.build === 'child' ? 'kid' : (s.build === 'old' ? 'elder' : 'adult'));
  const skin = col(s.skin, '#f2c8a0');
  // hair
  const h = (s.hair && typeof s.hair === 'object') ? s.hair : (typeof s.hair === 'string' ? { style: s.hair } : {});
  let style = String(h.style || 'short').toLowerCase();
  if (!HAIR_STYLES.includes(style)) style = HAIR_ALIAS[style] || 'short';
  const hair = { style, color: noPureBlack(col(h.color, build === 'elder' ? '#d9d9d9' : '#5a3a22')), capColor: col(h.capColor, '#c8322d') };
  // shirt
  const sh = (s.shirt && typeof s.shirt === 'object') ? s.shirt : (typeof s.shirt === 'string' ? { pattern: s.shirt } : {});
  let pattern = String(sh.pattern || 'solid').toLowerCase();
  if (!SHIRT_PATTERNS.includes(pattern)) pattern = 'solid';
  const pd = patternDefaults(pattern);
  const colors = colorsArr(sh.colors || sh.color, pd.colors);
  const sleeves = ['long', 'short', 'none'].includes(sh.sleeves) ? sh.sleeves : pd.sleeves;
  const SLEEVE_PATS = ['solid', 'stripes_h', 'stripes_v', 'plaid', 'polka', 'stars'];
  const sleevePattern = SLEEVE_PATS.includes(sh.sleevePattern) ? sh.sleevePattern : null;
  const sleeveColors = sh.sleeveColors ? colorsArr(sh.sleeveColors, ['#f4f4f0', '#e3a19c']) : null;
  const neck = ['round', 'v', 'collar', 'none', 'hood'].includes(sh.neck) ? sh.neck : pd.neck;
  const logo = typeof sh.logo === 'string' ? sh.logo : 'dino';
  const shirt = { pattern, colors, sleeves, sleevePattern, sleeveColors, neck, logo, logoColor: col(sh.logoColor, '#3fae49'), inner: sh.inner ? col(sh.inner) : null };
  // pants
  const p = (s.pants && typeof s.pants === 'object') ? s.pants : (typeof s.pants === 'string' ? { style: s.pants } : {});
  let pstyle = PANTS_STYLES.includes(p.style) ? p.style : 'pants';
  let pcolor = p.color ? col(p.color) : null;
  let ppat = PANTS_PATTERNS.includes(p.pattern) ? p.pattern : 'solid';
  if (pattern === 'suit' && !pcolor) pcolor = colors[0];
  if (pattern === 'overalls') { pcolor = colors[1]; pstyle = pstyle === 'shorts' ? 'shorts' : 'pants'; }
  if (pattern === 'pajamas_stars' && !p.pattern) { pcolor = colors[0]; ppat = 'stars'; }
  if (pattern === 'dress' && !p.style) pstyle = 'none';
  pcolor = noPureBlack(pcolor || '#2c5aa0');
  const pants = { style: pstyle, color: pcolor, pattern: ppat, colors: colorsArr(p.colors, [pcolor, pattern === 'pajamas_stars' ? colors[1] : '#ffffff', '#f2c511']), shoes: p.shoes ? noPureBlack(col(p.shoes)) : null };
  // accessories: strings or {type,color}
  const acc = [];
  for (const a of Array.isArray(s.accessories) ? s.accessories : []) {
    const type = typeof a === 'string' ? a : (a && a.type);
    if (!type || !ACCESSORIES.includes(type)) continue;
    acc.push({ type, color: a && a.color ? col(a.color) : null });
  }
  return { name: s.name || '', build, skin, hair, shirt, pants, accessories: acc, face: normFace(s.face || 'smile') };
}

// ---------------------------------------------------------------- random townsperson
const SKINS = [['#f2c8a0', 6], ['#f5d3b0', 4], ['#e8b98f', 3], ['#d9a477', 2], ['#b9794d', 1.5], ['#8d5a36', 1]];
const HAIR_COLORS = [['#1d1b1e', 3], ['#3b2416', 3], ['#6b4226', 3], ['#a5703e', 2], ['#f3d64a', 1.5], ['#b8512a', 1]];
const ELDER_HAIR = [['#e6e6e6', 3], ['#b5b5b5', 3], ['#8c8c8c', 1]];
const SHIRT_COLORS = ['#e2453c', '#f2c511', '#3a7bd5', '#3fae6a', '#8e5bb5', '#ef8a2a', '#22a39a', '#f4f4f4', '#2b2b2b',
  '#f08cb4', '#2f4566', '#9c2b2b', '#7fb3d5', '#a7d46f', '#f2c3cf', '#5c7a3a', '#c9a227', '#6d8fd1'];
const PANTS_COLORS = [['#2c5aa0', 5], ['#1f3768', 2], ['#202020', 3], ['#5f6266', 2], ['#9c8a63', 2], ['#6b4a2f', 1], ['#8a8f96', 1.5]];
const pickW = (rng, arr) => { let tot = 0; for (const [, w] of arr) tot += w; let r = rng() * tot; for (const [v, w] of arr) { r -= w; if (r <= 0) return v; } return arr[arr.length - 1][0]; };
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = { ...base[k], ...v };
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

export function randomSpec(rng, overrides = {}) {
  const r = typeof rng === 'function' ? rng : Math.random;
  const ov = overrides || {};
  const rb = r();
  const build = ov.build || (rb < 0.6 ? 'adult' : rb < 0.82 ? 'kid' : 'elder');
  const fem = r() < 0.5;
  const skin = pickW(r, SKINS);
  let style, hairColor = build === 'elder' ? pickW(r, ELDER_HAIR) : pickW(r, HAIR_COLORS);
  if (build === 'elder') style = fem ? pick(r, ['bun', 'curly', 'long', 'short']) : pick(r, ['bald', 'bald', 'short', 'cap']);
  else if (build === 'kid') style = fem ? pick(r, ['ponytail', 'long', 'bowl', 'bun', 'curly']) : pick(r, ['spiky', 'short', 'bowl', 'messy', 'cap']);
  else style = fem ? pick(r, ['long', 'ponytail', 'bun', 'curly', 'bowl']) : pick(r, ['short', 'short', 'messy', 'bald', 'cap', 'spiky', 'curly']);
  const pr = r();
  let pattern = pr < 0.22 ? 'solid' : pr < 0.38 ? 'stripes_h' : pr < 0.45 ? 'stripes_v' : pr < 0.53 ? 'plaid' : pr < 0.6 ? 'polka'
    : pr < 0.66 ? 'tee_logo' : pr < 0.72 ? 'hoodie' : pr < 0.77 ? 'vest' : pr < 0.82 ? 'cardigan' : pr < 0.86 ? 'argyle_vest'
      : pr < 0.9 ? 'overalls' : pr < 0.94 ? (fem ? 'dress' : 'suit') : (fem ? 'dress' : 'solid');
  if (build === 'kid' && pattern === 'suit') pattern = 'tee_logo';
  const c0 = pick(r, SHIRT_COLORS);
  let c1 = pick(r, SHIRT_COLORS); if (c1 === c0) c1 = c0 === '#f4f4f4' ? '#2b2b2b' : '#f4f4f4';
  const c2 = pick(r, SHIRT_COLORS);
  const shirt = { pattern, colors: [c0, c1, c2] };
  if (pattern === 'suit') shirt.colors = [pick(r, ['#1e2f6b', '#232323', '#3d3d45', '#4a3a2a']), '#f4f4f4', pick(r, ['#c0262d', '#2b4fa0', '#1d6b3a'])];
  if (pattern === 'dress') shirt.colors = [c0, '#ffffff'];
  if (pattern === 'vest' || pattern === 'argyle_vest') shirt.colors = [c0, pattern === 'vest' ? '#f4f4f0' : c1, '#f4f4f0'];
  if (pattern === 'solid' && r() < 0.35) shirt.sleeves = 'long';
  if (pattern === 'tee_logo') shirt.logo = pick(r, ['dino', 'star', 'heart', 'smiley']);
  const pantsStyle = pattern === 'dress' ? 'none' : (build === 'kid' && r() < 0.3 ? 'shorts' : (fem && r() < 0.15 ? 'skirt' : 'pants'));
  const pants = { style: pantsStyle, color: pickW(r, PANTS_COLORS) };
  if (fem && pantsStyle === 'pants' && r() < 0.12) { pants.pattern = 'floral'; pants.color = '#3f6fb5'; }
  const accessories = [];
  const ar = r();
  if (build === 'elder' && ar < 0.55) accessories.push('glasses');
  else if (ar < 0.12) accessories.push('glasses');
  else if (ar < 0.18) accessories.push('sunglasses');
  if (!fem && build !== 'kid' && r() < 0.12) accessories.push(r() < 0.5 ? 'beard' : 'mustache');
  if (fem && style !== 'cap' && r() < 0.12) accessories.push('bow');
  if (r() < 0.06) accessories.push('scarf');
  const base = {
    name: '',
    build,
    skin,
    hair: { style, color: hairColor },
    shirt,
    pants,
    accessories,
    face: pickW(r, [['smile', 6], ['happy', 2], ['neutral', 2], ['grin', 1.5], ['smirk', 0.7], ['talk', 0.5]]),
  };
  return deepMerge(base, ov);
}
