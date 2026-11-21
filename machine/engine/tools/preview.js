// Render still frames of a free-form scene spec (module testing) or of an episode shot.
// node engine/tools/preview.js --spec scene.json --out x.png [--t 0,0.5]
// node engine/tools/preview.js --episode episodes/x/episode.json --shot 012 --out x.png [--t 0.5]
const fs = require('fs'), path = require('path');
const { openRuntime, dataUrlToBuffer } = require('../browser');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
function resolveShot(ep, shot) {
  const s = JSON.parse(JSON.stringify(shot));
  s.actors = (s.actors || []).map(a => ({ ...a, spec: a.spec || ep.cast?.[a.id] || null }));
  s.seed = s.seed || (parseInt(s.id, 10) || 1) * 7919;
  return s;
}
(async () => {
  let shot;
  if (args.spec) shot = JSON.parse(fs.readFileSync(args.spec, 'utf8'));
  else { const ep = JSON.parse(fs.readFileSync(args.episode, 'utf8')); shot = resolveShot(ep, ep.shots.find(s => s.id === String(args.shot))); }
  const times = String(args.t || '0').split(',').map(Number);
  const rt = await openRuntime({ width: +(args.w || 720), height: +(args.h || 1280) });
  try {
    shot.duration = shot.duration || +(args.duration || 1.5);
    await rt.page.evaluate((s) => window.engine.loadShot(s), shot);
    const out = args.out || 'preview.png';
    for (let i = 0; i < times.length; i++) {
      const u = await rt.page.evaluate((t) => window.engine.renderFrame(t, 'image/png'), times[i]);
      const f = times.length > 1 ? out.replace(/(\.\w+)$/, `_${i}$1`) : out;
      fs.writeFileSync(f, dataUrlToBuffer(u)); console.log('wrote', f);
    }
  } catch (e) { console.error('ERROR', e.message); }
  if (rt.logs.length) console.log(rt.logs.slice(-30).join('\n'));
  await rt.close();
})();
