// Render still frames of a free-form scene spec (module testing) or of an episode shot.
// node engine/tools/preview.js --spec scene.json --out x.png [--t 0,0.5] [--w 720 --h 1280] [--duration 1.5]
// node engine/tools/preview.js --episode episodes/x/episode.json --shot 012 --out x.png [--t 0.5] [--timeline t.json]
//      [--framing close_up] [--move push_in] [--fov 40] [--angle low]   (overrides, for quick director experiments)
// Uses the same shot resolution (cast → specs, seed) as render.js / storyboard.js, so stills match the final render.
const fs = require('fs'), path = require('path');
const { openRuntime, dataUrlToBuffer, parseArgs, resolveShot } = require('../browser');
const args = parseArgs();
(async () => {
  let shot;
  if (args.spec) shot = JSON.parse(fs.readFileSync(args.spec, 'utf8'));
  else {
    const ep = JSON.parse(fs.readFileSync(args.episode, 'utf8'));
    const s = ep.shots.find((x) => String(x.id) === String(args.shot));
    if (!s) { console.error(`shot ${args.shot} not found`); process.exit(2); }
    let frames = null;
    const tlf = args.timeline || path.join(path.dirname(args.episode), 'timeline.json');
    if (fs.existsSync(tlf)) frames = (JSON.parse(fs.readFileSync(tlf, 'utf8')).shots || []).find((x) => String(x.id) === String(s.id))?.frames ?? null;
    shot = resolveShot(ep, s, { frames, fps: 30 }).shot;
  }
  for (const k of ['framing', 'move', 'angle', 'subject', 'target']) if (typeof args[k] === 'string') shot[k] = args[k];
  if (args.fov) shot.fov = +args.fov;
  const times = String(args.t || '0').split(',').map(Number);
  const rt = await openRuntime({ width: +(args.w || 720), height: +(args.h || 1280) });
  try {
    shot.duration = shot.duration || +(args.duration || 1.5);
    const info = await rt.page.evaluate((s) => window.engine.loadShot(s), shot);
    console.log('camera', JSON.stringify(info.camera));
    if (info.warnings.length) console.log('warnings:', info.warnings.join(' | '));
    const out = args.out || 'preview.png';
    const mime = /\.jpe?g$/i.test(out) ? 'image/jpeg' : 'image/png';
    for (let i = 0; i < times.length; i++) {
      const u = await rt.page.evaluate(([t, m]) => window.engine.renderFrame(t, m), [times[i], mime]);
      const f = times.length > 1 ? out.replace(/(\.\w+)$/, `_${i}$1`) : out;
      fs.writeFileSync(f, dataUrlToBuffer(u)); console.log('wrote', f);
    }
  } catch (e) { console.error('ERROR', e.message); process.exitCode = 1; }
  if (args.verbose && rt.logs.length) console.log(rt.logs.slice(-30).join('\n'));
  await rt.close();
})();
