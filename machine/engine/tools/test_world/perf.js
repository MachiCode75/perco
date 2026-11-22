// Real-runtime perf: node engine/tools/test_world/perf.js [--set lake_dock] [--framing wide] [--frames 6] [--actors 4 --crowd 6]
const { openRuntime } = require('../../browser');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
(async () => {
  const rt = await openRuntime({ width: 720, height: 1280 });
  for (const set of String(args.set || 'lake_dock').split(',')) for (const framing of String(args.framing || 'wide').split(',')) {
    const marks = ['A', 'B', 'C', 'D'].slice(0, +(args.actors || 4));
    const shot = { set, time: args.time || 'day', weather: args.weather || 'clear', framing, subject: 'set', seed: 7, duration: 2,
      actors: marks.map((m, i) => ({ id: 'a' + i, mark: m, facing: 'camera' })), crowd: { count: +(args.crowd || 6) } };
    const t0 = Date.now(); await rt.page.evaluate((s) => window.engine.loadShot(s), shot); const load = Date.now() - t0;
    const times = [];
    for (let f = 0; f < +(args.frames || 6); f++) { const r = await rt.page.evaluate((t) => { const a = performance.now(); window.engine.renderFrame(t); return performance.now() - a; }, f / 30); times.push(Math.round(r)); }
    const steady = times.slice(1).sort((a, b) => a - b);
    console.log(`${set} ${framing}: load ${load}ms, frames ${times.join(',')} → median ${steady[Math.floor(steady.length / 2)]}ms`);
  }
  if (rt.logs.length) console.log(rt.logs.filter(l => !/GL Driver/.test(l)).slice(-10).join('\n'));
  await rt.close();
})();
