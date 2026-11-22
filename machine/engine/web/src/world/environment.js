// World module — sky / time-of-day / weather / lights / particles / underwater switch.
// applyEnvironment(ctx, {time, weather, interior, power}) builds an env group in ctx.scene and stores
// ctx.worldEnv = { update(t, camera) } which the current SetInstance.update() drives every frame.
import * as THREE from 'three';
import { getMat, worldUniforms } from './materials.js';
import { waterMaterial } from './water.js';
import { getTexture } from './textures.js';
import { makeRng } from './core.js';

const C = (h) => new THREE.Color(h);
/** three converts fog colour to the output colour space itself (getUnlitUniformColorSpace) */
const fogCol = (h) => C(h);

const TIMES = {
  day: { top: '#3f7ccc', mid: '#78a8dc', hor: '#b9d2ea', ground: '#9db4c8', sun: [0.48, 0.72, 0.5], sunCol: '#fff1dc', sunI: 2.7, hemiSky: '#d6e6ff', hemiGnd: '#8a8a6a', hemiI: 1.25,
    fog: '#b9d2ea', fogN: 110, fogF: 1000, exp: 1.0, water: ['#4f86b4', '#2c5f8c'], glow: 0, lamps: 0, stars: 0, sunSize: 0.0008 },
  golden: { top: '#4f78c0', mid: '#c9a98e', hor: '#ffc887', ground: '#b49a80', sun: [0.82, 0.24, 0.52], sunCol: '#ffc27a', sunI: 2.6, hemiSky: '#ffe2c0', hemiGnd: '#7a6650', hemiI: 0.95,
    fog: '#efc9a0', fogN: 120, fogF: 950, exp: 1.0, water: ['#5a7fa6', '#33587e'], glow: 0.25, lamps: 0.3, stars: 0, sunSize: 0.0012 },
  dusk: { top: '#1d2752', mid: '#6a4c86', hor: '#f08848', ground: '#3a3040', sun: [-0.25, 0.05, -0.97], sunCol: '#ff9a5a', sunI: 0.75, hemiSky: '#8a7ab8', hemiGnd: '#3a2e36', hemiI: 0.75,
    fog: '#a0708a', fogN: 90, fogF: 750, exp: 1.05, water: ['#3a4f78', '#1f2c4e'], glow: 1.0, lamps: 1.0, stars: 0.15, sunSize: 0.0016 },
  night: { top: '#03081a', mid: '#0a1634', hor: '#17284a', ground: '#0a0f1c', sun: [-0.35, 0.62, 0.55], sunCol: '#9fb6ff', sunI: 0.42, hemiSky: '#3a4e7e', hemiGnd: '#121620', hemiI: 0.42,
    fog: '#0f1c34', fogN: 70, fogF: 650, exp: 1.12, water: ['#16304e', '#0a1a30'], glow: 1.6, lamps: 1.6, stars: 1, sunSize: 0.0004 },
};
const WEATHER = {
  clear: {},
  overcast: { grey: 0.75, sunK: 0.35, hemiK: 1.35, fogK: 0.7 },
  snow: { grey: 0.85, sunK: 0.3, hemiK: 1.4, fogK: 0.45, snow: 1 },
  rain: { grey: 0.95, sunK: 0.18, hemiK: 1.1, fogK: 0.4, wet: 1, dark: 0.75 },
  fog: { grey: 0.9, sunK: 0.25, hemiK: 1.3, fogK: 0.1, fogNear: 6 },
};

function preset(time, weather) {
  const T = TIMES[time] || TIMES.day; const W = WEATHER[weather] || WEATHER.clear;
  const p = { ...T, weather, time: TIMES[time] ? time : 'day', snow: W.snow || 0, wet: W.wet || 0 };
  if (W.grey) {
    const lum = (h) => { const c = C(h); const l = (c.r + c.g + c.b) / 3; const g = new THREE.Color(l, l, l * 1.04); return '#' + c.lerp(g, W.grey).multiplyScalar(W.dark || 1).getHexString(); };
    for (const k of ['top', 'mid', 'hor', 'fog', 'ground']) p[k] = lum(T[k]);
    if (time === 'day' || time === 'golden') { p.top = lum('#8f9aa8'); p.mid = lum('#b4bcc6'); p.hor = lum('#cfd4da'); p.fog = p.hor; }
    p.sunI = T.sunI * W.sunK; p.hemiI = T.hemiI * W.hemiK; p.fogF = T.fogF * W.fogK; p.fogN = W.fogNear !== undefined ? W.fogNear : T.fogN * W.fogK;
    p.sunSize = 0; p.stars = 0;
  }
  return p;
}

function makeSky(ctx, p) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: C(p.top) }, uMid: { value: C(p.mid) }, uHor: { value: C(p.hor) }, uBot: { value: C(p.ground) },
      uSunDir: { value: new THREE.Vector3(...p.sun).normalize() }, uSunCol: { value: C(p.sunCol) }, uSunSize: { value: p.sunSize }, uStars: { value: p.stars } },
    vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 c = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = c.xyww; }`,
    fragmentShader: `uniform vec3 uTop,uMid,uHor,uBot,uSunDir,uSunCol; uniform float uSunSize,uStars; varying vec3 vD;
      float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, h)); c = mix(c, uTop, smoothstep(0.18, 0.8, h));
        if (h < 0.0) c = mix(uHor, uBot, smoothstep(0.0, -0.15, h));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.35) * step(0.0001, uSunSize + 0.5);
        c = mix(c, uSunCol * 1.6, smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.5, sd));
        if (uStars > 0.0 && h > 0.02) { vec3 q = floor(d * 380.0); float s = h3(q); c += vec3(0.85, 0.9, 1.0) * step(0.9975, s) * uStars * smoothstep(0.02, 0.3, h); }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), m);
  s.renderOrder = 10; s.frustumCulled = false; s.name = 'sky'; // drawn after opaque geometry: only uncovered pixels are shaded
  return s;
}

function makeSnow(ctx, n = 2500) {
  const r = makeRng('snow'); const pos = new Float32Array(n * 3); const base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { base[i * 3] = (r() - 0.5) * 120; base[i * 3 + 1] = r() * 60; base[i * 3 + 2] = (r() - 0.5) * 120; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: getTexture(ctx, 'flake'), size: 0.55, transparent: true, depthWrite: false, color: 0xffffff, fog: true }));
  pts.frustumCulled = false; pts.name = 'snow';
  return { obj: pts, update(t, cam) {
    const cx = Math.round(cam.position.x), cy = cam.position.y, cz = Math.round(cam.position.z);
    for (let i = 0; i < n; i++) {
      const fx = base[i * 3] + Math.sin(t * 0.7 + i) * 0.8, fy = base[i * 3 + 1] - t * 3.2, fz = base[i * 3 + 2] + Math.cos(t * 0.6 + i * 0.7) * 0.8;
      pos[i * 3] = cx + ((fx - cx) % 120 + 180) % 120 - 60 + 0; pos[i * 3 + 1] = cy - 25 + ((fy % 60) + 60) % 60; pos[i * 3 + 2] = cz + ((fz - cz) % 120 + 180) % 120 - 60;
    }
    g.attributes.position.needsUpdate = true;
  } };
}
function makeRain(ctx, n = 1600) {
  const r = makeRng('rain'); const pos = new Float32Array(n * 6); const base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { base[i * 3] = (r() - 0.5) * 90; base[i * 3 + 1] = r() * 50; base[i * 3 + 2] = (r() - 0.5) * 90; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8c4d2, transparent: true, opacity: 0.45, fog: true }));
  ls.frustumCulled = false; ls.name = 'rain';
  return { obj: ls, update(t, cam) {
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    for (let i = 0; i < n; i++) {
      const x = cx + (((base[i * 3] - cx) % 90) + 135) % 90 - 45, z = cz + (((base[i * 3 + 2] - cz) % 90) + 135) % 90 - 45;
      const y = cy - 20 + ((((base[i * 3 + 1] - t * 45) % 50) + 50) % 50);
      pos.set([x, y, z, x + 0.25, y + 2.2, z + 0.1], i * 6);
    }
    g.attributes.position.needsUpdate = true;
  } };
}

export function applyEnvironment(ctx, { time = 'day', weather = 'clear', interior = false, power } = {}) {
  const scene = ctx.scene; const set = ctx.worldSet && ctx.worldSet.__scene === scene ? ctx.worldSet : ctx.worldSet;
  // blackout: no lit windows, lamp posts, porch lights or interior lamps; interiors get dim cold moonlight only
  const off = String(power ?? set?.power ?? 'on').toLowerCase() === 'off';
  if (ctx.worldEnv?.group?.parent) ctx.worldEnv.group.parent.remove(ctx.worldEnv.group);
  const p = preset(time, weather);
  // per-set look overrides, e.g. { day: { hor, mid, top, fog, hemiGnd } } (only with clear weather)
  const ov = set?.env && weather !== 'snow' && weather !== 'rain' && weather !== 'fog' ? (set.env[p.time] || set.env.all) : null;
  if (ov) Object.assign(p, ov);
  const group = new THREE.Group(); group.name = 'world-env'; group.userData.worldEnv = true;
  const U = worldUniforms(ctx);
  U.snow.value = interior ? 0 : p.snow; U.wet.value = interior ? 0 : p.wet;

  const sky = makeSky(ctx, p); group.add(sky);
  scene.background = C(p.hor);
  const sunDir = new THREE.Vector3(...p.sun).normalize();
  const dark = p.time === 'night' || p.time === 'dusk';
  const moonIn = interior && off && dark; // blacked-out interior at night: cold moonlight through the windows only
  const hemi = moonIn ? new THREE.HemisphereLight(C(p.time === 'night' ? '#6a7cb0' : '#8a86b0'), C('#141824'), p.time === 'night' ? 0.7 : 0.85)
    : interior ? new THREE.HemisphereLight(C(p.time === 'night' ? '#d8c4a8' : '#fff2dc'), C(p.time === 'night' ? '#8a6a4a' : '#d2b48c'), p.time === 'night' ? 0.16 : p.time === 'dusk' ? 0.6 : 1.5)
    : new THREE.HemisphereLight(C(p.hemiSky), C(p.hemiGnd), p.hemiI * (off && dark ? 0.85 : 1)); group.add(hemi);
  const sun = new THREE.DirectionalLight(C(moonIn ? '#a9bfff' : p.sunCol), moonIn ? (p.time === 'night' ? 1.1 : 0.9) : interior ? (p.time === 'night' ? 0.15 : p.time === 'dusk' ? 0.5 : Math.max(1.6, p.sunI * 0.8)) : p.sunI);
  const focus = set?.shadow || { center: [0, 0, 0], radius: 60 };
  const fc = new THREE.Vector3(...focus.center);
  let ldir = sunDir.clone(); if (ldir.y < 0.25) { ldir.y = 0.25; ldir.normalize(); } // keep shadows sane at dusk
  if (interior && set?.windowLight) ldir = new THREE.Vector3(...set.windowLight).normalize();
  sun.position.copy(fc).addScaledVector(ldir, 300); sun.target.position.copy(fc);
  sun.castShadow = true; const ms = ctx.quality === 'preview' ? 1024 : 2048; sun.shadow.mapSize.set(ms, ms);
  const R = focus.radius; Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 700 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  if ('intensity' in sun.shadow) sun.shadow.intensity = weather === 'clear' ? 0.9 : 0.6;
  group.add(sun, sun.target);

  let fogN = p.fogN, fogF = p.fogF;
  if (interior) { fogN = 400; fogF = 2000; }
  scene.fog = new THREE.Fog(fogCol(p.fog), fogN, fogF);
  ctx.renderer.toneMappingExposure = p.exp * (interior ? 1.0 : 1.0);

  // material reactions
  const glow = off ? 0 : interior ? Math.max(p.glow, 0.15) : p.glow;
  for (const m of [getMat(ctx, 'win'), ...[...(ctx.worldMats?.values() || [])].filter((q) => q.userData?.def?.glow && q.name !== 'win')]) { m.emissive.set(glow > 0 ? '#ffd48a' : '#000000'); m.emissiveIntensity = glow; }
  const lampK = off ? 0 : p.lamps;
  const lg = getMat(ctx, 'lampglass'); lg.emissive.set(lampK > 0 ? '#ffd890' : '#000000'); lg.emissiveIntensity = lampK * 1.4;
  const bulb = getMat(ctx, 'bulb'); bulb.emissive.set(off ? '#000000' : '#ffe2a8'); bulb.emissiveIntensity = off ? 0 : interior ? (dark ? 1.4 : 0.6) : 0.8;
  const scr = getMat(ctx, 'screen'); scr.emissiveIntensity = off ? 0 : 0.6; scr.color.set(off ? '#121212' : '#ffffff');
  const fireOn = !off || !!set?.fireOn; const fm = getMat(ctx, 'fire'); fm.visible = fireOn;
  const wm = waterMaterial(ctx); const wu = wm.uniforms;
  wu.uColor.value.set(p.water[0]); wu.uDeep.value.set(p.water[1]); wu.uSkyTop.value.set(p.top); wu.uSkyHor.value.set(p.hor);
  wu.uSunDir.value.copy(sunDir); wu.uSunCol.value.set(p.sunCol); wu.uSpec.value = p.weather === 'clear' ? (p.time === 'night' ? 0.5 : 1.3) : 0.15;
  wu.uWave.value = p.weather === 'rain' ? 1.6 : 1.0;

  // practical lights: lamp posts / porch lights at night, interior lamps always
  const lamps = (set?._lamps || []).slice();
  const ref = new THREE.Vector3(...(set?.lightFocus || focus.center));
  lamps.sort((a, b) => ((a.x - ref.x) ** 2 + (a.z - ref.z) ** 2) - ((b.x - ref.x) ** 2 + (b.z - ref.z) ** 2));
  const nightK = off ? 0 : interior ? 1 : p.lamps;
  if (off && fireOn && interior) { // power cut but the fire still burns (set opts.fire): fire light only
    for (const l of lamps.filter((q) => q.kind === 'fire').slice(0, 2)) { const pl = new THREE.PointLight('#ff9a4a', 60, 30, 1.6); pl.position.set(l.x, l.y, l.z); pl.userData.fire = true; group.add(pl); }
  }
  if (nightK > 0) {
    let n = 0; const maxL = interior ? 4 : 4;
    for (const l of lamps) {
      if (n >= maxL) break;
      if (!interior && l.kind === 'interior') continue;
      const isFire = l.kind === 'fire';
      const pl = new THREE.PointLight(isFire ? '#ff9a4a' : '#ffcf88', (interior ? (isFire ? 60 : (p.time === 'night' ? 80 : 45)) : 140) * nightK * (interior && p.time === 'day' ? 0.5 : 1), interior ? 30 : 38, 1.6);
      pl.position.set(l.x, l.y - (l.kind === 'post' ? 0.6 : 0), l.z); pl.userData.fire = isFire; group.add(pl); n++;
    }
    if (!interior && p.lamps >= 1) {
      // halo points + warm ground pools (cheap fake lights), batched: 2 draw calls for all lamps
      const ls = lamps.slice(0, 80); const posts = ls.filter((l) => l.kind === 'post');
      const hp = new Float32Array(ls.length * 3); ls.forEach((l, i) => hp.set([l.x, l.y, l.z], i * 3));
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
      const halos = new THREE.Points(hg, new THREE.PointsMaterial({ map: getTexture(ctx, 'glow'), color: '#ffd58a', size: 4.5, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, fog: true }));
      halos.frustumCulled = false; halos.renderOrder = 21; group.add(halos);
      if (posts.length) {
        const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
        const pm = new THREE.MeshBasicMaterial({ map: getTexture(ctx, 'glow'), color: '#ffb860', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.24, fog: true });
        const pools = new THREE.InstancedMesh(pg, pm, posts.length); const m4 = new THREE.Matrix4();
        posts.forEach((l, i) => { m4.makeScale(16, 1, 16); m4.setPosition(l.x, (l.groundY ?? 0) + 0.12, l.z); pools.setMatrixAt(i, m4); });
        pools.renderOrder = 3; pools.frustumCulled = false; group.add(pools);
      }
    }
  }
  // weather particles
  const parts = [];
  if (!interior && p.weather === 'snow') parts.push(makeSnow(ctx));
  if (!interior && p.weather === 'rain') parts.push(makeRain(ctx));
  for (const q of parts) group.add(q.obj);

  scene.add(group);
  try { set?.onEnv?.({ time: p.time, weather: p.weather, interior, power: off ? 'off' : 'on', sun, hemi }); } catch (e) { console.warn('[world] set.onEnv', e.message); }
  const normalFog = { color: scene.fog.color.clone(), near: fogN, far: fogF, bg: scene.background.clone() };
  let under = false;
  const lights = group.children.filter((o) => o.isPointLight && o.userData.fire);
  ctx.worldEnv = {
    group, preset: p, interior, power: off ? 'off' : 'on',
    update(t, camera) {
      sky.position.copy(camera.position);
      for (const q of parts) q.update(t, camera);
      for (const l of lights) l.intensity = 60 * (0.85 + 0.15 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1));
      wu.uTime.value = t;
      const wl = ctx.worldSet?.waterLevel;
      const isUnder = wl !== null && wl !== undefined && camera.position.y < wl;
      if (isUnder !== under) {
        under = isUnder;
        if (under) { scene.fog.color.copy(fogCol('#2f7c98')); scene.fog.near = 0; scene.fog.far = 70; scene.background = C('#2f7c98'); sky.visible = false; }
        else { scene.fog.color.copy(normalFog.color); scene.fog.near = normalFog.near; scene.fog.far = normalFog.far; scene.background = normalFog.bg; sky.visible = true; }
      }
    },
  };
  return ctx.worldEnv;
}
