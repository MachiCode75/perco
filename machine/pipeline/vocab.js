// Dump the engine vocabulary (faces, poses, sets with their marks/pois, framings…) to data/vocab.json.
// Used by pipeline/validate.py and by Claude when writing episodes.  node pipeline/vocab.js
const fs = require('fs'), path = require('path');
const { openRuntime } = require('../engine/browser');
(async () => {
  const rt = await openRuntime({ width: 64, height: 64 });
  try {
    const vocab = await rt.page.evaluate(async () => {
      const THREE = await import('three');
      const ch = await import('/engine/web/src/characters/index.js');
      const wo = await import('/engine/web/src/world/index.js');
      const di = await import('/engine/web/src/director/index.js');
      const renderer = new THREE.WebGLRenderer();
      let seed = 1; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const ctx = { THREE, scene: new THREE.Scene(), renderer, camera: new THREE.PerspectiveCamera(), rng, textures: new Map(), quality: 'preview' };
      const sets = {};
      for (const id of wo.SETS || []) {
        try {
          const s = wo.createSet(ctx, id, {});
          const marks = Object.keys(s.marks || {}).filter(k => !Array.isArray(s.marks[k]));
          const crowds = Object.keys(s.marks || {}).filter(k => Array.isArray(s.marks[k])).map(k => ({ area: k, slots: s.marks[k].length }));
          sets[id] = { interior: !!s.interior, water: s.waterLevel ?? null, marks, crowds, pois: Object.keys(s.pois || {}), cameraHints: Object.keys(s.cameraHints || {}) };
        } catch (e) { sets[id] = { error: String(e) }; }
      }
      return { generated: new Date().toISOString(), FACES: ch.FACES, POSES: ch.POSES, HAIR_STYLES: ch.HAIR_STYLES, SHIRT_PATTERNS: ch.SHIRT_PATTERNS,
        PROPS_HELD: ch.PROPS_HELD, ACCESSORIES: ch.ACCESSORIES, CREATURES: ch.CREATURES, EYE_MODES: ch.EYE_MODES, CARD_STYLES: wo.CARD_STYLES, PROPS: wo.PROPS, FRAMINGS: di.FRAMINGS, MOVES: di.MOVES, SETS: sets };
    });
    const out = path.join(__dirname, '..', 'data', 'vocab.json');
    fs.writeFileSync(out, JSON.stringify(vocab, null, 1));
    console.log('wrote', out, '-', Object.keys(vocab.SETS).length, 'sets,', (vocab.POSES || []).length, 'poses,', (vocab.FACES || []).length, 'faces');
  } catch (e) { console.error('vocab error:', e.message); console.error(rt.logs.join('\n')); process.exitCode = 1; }
  await rt.close();
})();
