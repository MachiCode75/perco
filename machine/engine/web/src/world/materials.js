// World module — shared material registry (cached on ctx.worldMats). All materials use vertex colours
// (the Builder writes them), so one material serves every colour variant → very few draw calls.
// Outdoor materials get a tiny shader patch driven by shared uniforms: snow cover on up-facing
// surfaces (uSnow) and wet darkening (uWet). applyEnvironment() sets these per shot.
import * as THREE from 'three';
import { getTexture } from './textures.js';

// key → definition. tex = texture key; rough/metal; emissive handled by applyEnvironment for 'win*' & 'glow*'
const DEFS = {
  plain: { rough: 0.82, lambert: true },
  satin: { rough: 0.55 },                       // painted trim, furniture lacquer
  plastic: { rough: 0.4 },
  metal: { rough: 0.45, metal: 0.25 },
  siding: { tex: 'siding', rough: 0.8, lambert: true },
  shingle: { tex: 'shingle', rough: 0.9, lambert: true },
  planks: { tex: 'planks', rough: 0.85, lambert: true },
  brick: { tex: 'brick', rough: 0.9, lambert: true },
  asphalt: { tex: 'asphalt', rough: 0.95, lambert: true, order: 1 },
  concrete: { tex: 'concrete', rough: 0.92, lambert: true, order: 1 },
  stone: { tex: 'stone', rough: 0.92, lambert: true },
  grass: { tex: 'grass', rough: 0.97, lambert: true, order: 1 },
  sand: { tex: 'sand', rough: 0.97, lambert: true, order: 1 },
  bed: { tex: 'sand', basic: true, order: 4 },
  dirt: { tex: 'dirt', rough: 0.97, lambert: true, order: 1 },
  foliage: { rough: 0.9, lambert: true },
  louvre: { tex: 'louvre', rough: 0.8, lambert: true, unit: true },
  door: { tex: 'door', rough: 0.6, unit: true },
  win: { tex: 'window_day', glow: 'window_glow', rough: 0.25, unit: true },      // lit at night
  win_dark: { tex: 'window_day', rough: 0.25, unit: true },                       // stays dark at night
  lampglass: { rough: 0.3, lamp: true },                                          // lamp heads (emissive at night)
  bulb: { rough: 0.3, bulb: true },                                               // interior lamps: always glowing a bit
  fire: { rough: 1, fire: true },
  woodpanel: { tex: 'woodpanel', rough: 0.7, lambert: true, interior: true },
  floorwood: { tex: 'floorwood', rough: 0.55, interior: true },
  tile: { tex: 'tile', rough: 0.6, interior: true },
  fabric: { tex: 'fabric', rough: 0.95, lambert: true, interior: true },
  wallpaper: { tex: 'wallpaper', rough: 0.9, lambert: true, interior: true },
  rug: { tex: 'rug', rough: 1, unit: true, interior: true },
  art: { tex: 'art', rough: 0.6, unit: true, interior: true },
  books: { tex: 'books', rough: 0.8, unit: true, interior: true },
  chalkboard: { tex: 'chalkboard', rough: 0.9, unit: true, interior: true },
  screen: { tex: 'screen', rough: 0.3, unit: true, screen: true },
  sign: { rough: 0.7, unit: true },   // per-text map assigned by signMaterial()
};

function patch(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = U.snow; sh.uniforms.uWet = U.wet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN; uniform float uSnow; uniform float uWet;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float snowK = uSnow * smoothstep(0.42, 0.72, normalize(vWN).y);
        diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.28 * uWet), vec3(0.92, 0.94, 0.98), snowK);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, uWet);');
    if (!sh.vertexShader.includes('vWN =')) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN = normalize(mat3(modelMatrix) * normal);');
  };
  mat.customProgramCacheKey = () => 'world-snowpatch-v1';
}

export function worldUniforms(ctx) {
  if (!ctx.worldUniforms) ctx.worldUniforms = { snow: { value: 0 }, wet: { value: 0 }, time: { value: 0 } };
  return ctx.worldUniforms;
}

export function getMat(ctx, key) {
  if (!ctx.worldMats) ctx.worldMats = new Map();
  let m = ctx.worldMats.get(key);
  if (m) return m;
  const base = key.split(':')[0];
  const d = DEFS[base] || DEFS.plain;
  const p = { color: 0xffffff, vertexColors: true, roughness: d.rough ?? 0.8, metalness: d.metal || 0 };
  if (d.tex) p.map = getTexture(ctx, d.tex);
  if (d.basic) { delete p.roughness; delete p.metalness; m = new THREE.MeshBasicMaterial(p); }
  else if (d.lambert) { delete p.roughness; delete p.metalness; m = new THREE.MeshLambertMaterial(p); }
  else m = new THREE.MeshStandardMaterial(p);
  m.name = key;
  m.userData.def = d;
  if (d.glow) { m.emissiveMap = getTexture(ctx, d.glow); m.emissive = new THREE.Color(0, 0, 0); }
  if (d.lamp || d.bulb || d.fire || d.screen) m.emissive = new THREE.Color(0, 0, 0);
  if (d.fire) { m.emissive = new THREE.Color('#ff8a2a'); m.emissiveIntensity = 2.2; }
  if (d.screen) { m.emissiveMap = m.map; m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = 0.6; }
  if (!d.interior && !d.unit && !d.basic) patch(m, worldUniforms(ctx));
  ctx.worldMats.set(key, m);
  return m;
}

/** a sign material with its own text texture (not merged with others) */
export function signMaterial(ctx, tex) {
  const key = 'sign:' + tex.uuid;
  if (!ctx.worldMats) ctx.worldMats = new Map();
  let m = ctx.worldMats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.7 }); m.name = key; ctx.worldMats.set(key, m); }
  return m;
}
