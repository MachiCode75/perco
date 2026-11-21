// World module — lake water surface (semi-transparent, animated normals, fresnel sky reflection,
// sun glint; seen from below it turns into a bright rippled ceiling) + floating ripple rings.
import * as THREE from 'three';
import { getTexture } from './textures.js';

const VS = /* glsl */`
varying vec3 vW;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = /* glsl */`
uniform sampler2D uNormal; uniform float uTime;
uniform vec3 uColor; uniform vec3 uDeep; uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uUnder;
uniform float uAlphaNear; uniform float uAlphaFar; uniform float uSpec; uniform float uWave;
varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 p = vW.xz;
  vec3 n1 = texture2D(uNormal, p * 0.031 + vec2(uTime * 0.011, uTime * 0.007)).rgb * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormal, p * 0.083 + vec2(-uTime * 0.009, uTime * 0.015)).rgb * 2.0 - 1.0;
  vec3 n3 = texture2D(uNormal, p * 0.21 + vec2(uTime * 0.02, -uTime * 0.012)).rgb * 2.0 - 1.0;
  vec2 g = (n1.xy * 0.5 + n2.xy * 0.35 + n3.xy * 0.2) * uWave;
  vec3 n = normalize(vec3(g.x, 1.0, g.y));
  vec3 V = normalize(cameraPosition - vW);
  vec3 c; float a;
  if (gl_FrontFacing) {
    float cosT = clamp(dot(V, n), 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    vec3 R = reflect(-V, n);
    float ry = clamp(R.y, 0.0, 1.0);
    vec3 sky = mix(uSkyHor, uSkyTop, pow(ry, 0.55));
    float graz = 1.0 - clamp(V.y, 0.0, 1.0);
    vec3 body = mix(uColor, uDeep, smoothstep(0.15, 0.95, graz));
    // subtle light streaks from the normal map (Roblox water look)
    body *= 0.93 + 0.16 * (n2.x * 0.5 + 0.5) * (n1.y * 0.5 + 0.5);
    c = mix(body, sky, clamp(F * 0.9, 0.0, 1.0));
    float s = pow(max(dot(R, uSunDir), 0.0), 220.0) * uSpec + pow(max(dot(R, uSunDir), 0.0), 18.0) * uSpec * 0.04;
    c += uSunCol * s;
    a = mix(uAlphaNear, uAlphaFar, smoothstep(0.2, 0.9, graz));
    a = clamp(max(a, F), 0.0, 1.0);
  } else {
    float k = clamp(-V.y, 0.0, 1.0);
    c = mix(uDeep * 0.7, uUnder * (1.0 + 0.35 * n.x), smoothstep(0.35, 0.85, k));
    a = 0.9;
  }
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function waterMaterial(ctx) {
  if (!ctx.worldMats) ctx.worldMats = new Map();
  let m = ctx.worldMats.get('__water');
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uNormal: { value: null }, uTime: { value: 0 },
      uColor: { value: new THREE.Color('#4f86b4') }, uDeep: { value: new THREE.Color('#2a5f8e') },
      uSkyTop: { value: new THREE.Color('#5d93d6') }, uSkyHor: { value: new THREE.Color('#b8d2ea') },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5).normalize() }, uSunCol: { value: new THREE.Color('#fff3dc') },
      uUnder: { value: new THREE.Color('#7fc4dc') },
      uAlphaNear: { value: 0.62 }, uAlphaFar: { value: 0.93 }, uSpec: { value: 1.2 }, uWave: { value: 1.0 },
    }]),
    vertexShader: VS, fragmentShader: FS, transparent: true, fog: true, side: THREE.DoubleSide, depthWrite: true,
  });
  m.uniforms.uNormal.value = getTexture(ctx, 'water_normal');
  m.name = 'water';
  ctx.worldMats.set('__water', m);
  return m;
}

/** water surface: rectangle [x0,x1]×[z0,z1] at y=level. */
export function createWaterSurface(ctx, { x0 = -400, x1 = 400, z0 = -400, z1 = 400, level = 0 } = {}) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1); g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, waterMaterial(ctx));
  mesh.position.set((x0 + x1) / 2, level, (z0 + z1) / 2);
  mesh.renderOrder = 5; mesh.name = 'water'; mesh.receiveShadow = false; mesh.castShadow = false;
  return mesh;
}

/** pool of ripple rings that follow characters standing in the water (found in ctx.scene). */
export function createRipples(ctx, level, max = 16) {
  const mat = new THREE.MeshBasicMaterial({ map: getTexture(ctx, 'ripple'), transparent: true, depthWrite: false, opacity: 0.55, color: 0xffffff, fog: true });
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const inst = new THREE.InstancedMesh(geo, mat, max); inst.count = 0; inst.renderOrder = 6; inst.frustumCulled = false; inst.name = 'ripples';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  return {
    mesh: inst,
    update(t, exclude) {
      let k = 0; const scene = ctx.scene; if (!scene) return;
      for (const o of scene.children) {
        if (k >= max) break;
        if (o === exclude || o.isLight || !o.isObject3D || o.userData?.worldEnv) continue;
        const y = o.position.y;
        if (y < level - 0.3 && y > level - 7.5 && o.children.length) {
          const ph = (t * 0.6 + (o.id % 7) * 0.13) % 1; const r = 3.2 + ph * 1.6;
          p.set(o.position.x, level + 0.03, o.position.z); s.set(r * 2, 1, r * 2); q.identity();
          m4.compose(p, q, s); inst.setMatrixAt(k++, m4);
        }
      }
      inst.count = k; inst.instanceMatrix.needsUpdate = true;
    },
  };
}
