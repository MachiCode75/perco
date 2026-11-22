#!/usr/bin/env node
// Benchmark ms/frame for one shot.
//   node engine/tools/bench.js --episode episodes/_test/episode.json --shot 004 [--frames 30] [--w 720 --h 1280]
//        [--quality final|preview] [--no-shadows]
//   node engine/tools/bench.js --spec scene.json [...]
// Prints load time, submit ms (JS + GL command submission), GPU+readback+JPEG ms (SwiftShader work happens at
// readback), round-trip ms per frame (what render.js pays per worker) and fps.
const fs = require('fs');
const { openRuntime, dataUrlToBuffer, parseArgs, resolveShot } = require('../browser');
const args = parseArgs();
(async () => {
  let shot;
  if (args.spec) shot = JSON.parse(fs.readFileSync(args.spec, 'utf8'));
  else if (args.episode) {
    const ep = JSON.parse(fs.readFileSync(args.episode, 'utf8'));
    const s = ep.shots.find((x) => String(x.id) === String(args.shot || ep.shots[0].id));
    if (!s) throw new Error(`shot ${args.shot} not found`);
    shot = resolveShot(ep, s, { frames: 45, fps: 30 }).shot;
  } else { console.error('usage: bench.js --episode e.json --shot 004 | --spec scene.json'); process.exit(2); }
  const n = +(args.frames || 30), w = +(args.w || 720), h = +(args.h || 1280);
  const rt = await openRuntime({ width: w, height: h, quality: args.quality || 'final', options: args['no-shadows'] ? { shadows: false } : null });
  try {
    let t = Date.now();
    const info = await rt.page.evaluate((s) => window.engine.loadShot(s), shot);
    const loadMs = Date.now() - t;
    await rt.page.evaluate(() => window.engine.renderFrame(0)); // warm-up
    const rs = [], es = []; let bytes = 0;
    t = Date.now();
    for (let i = 0; i < n; i++) {
      const u = await rt.page.evaluate((x) => window.engine.renderFrame(x), i / 30);
      bytes += dataUrlToBuffer(u).length;
      const st = await rt.page.evaluate(() => window.engine.info().stats);
      rs.push(st.renderMs); es.push(st.encodeMs);
    }
    const rt_ms = (Date.now() - t) / n;
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const draw = await rt.page.evaluate(() => window.engine.info().draw);
    console.log(JSON.stringify({
      shot: shot.id, size: `${w}x${h}`, frames: n, loadMs, submitMs: +avg(rs).toFixed(1), gpuReadbackEncodeMs: +avg(es).toFixed(1),
      roundTripMsPerFrame: +rt_ms.toFixed(1), fps: +(1000 / rt_ms).toFixed(2), avgJpegKB: Math.round(bytes / n / 1024),
      camera: info.camera, warnings: info.warnings, draw,
    }, null, 1));
  } finally { if (rt.logs.length && args.verbose) console.log(rt.logs.slice(-20).join('\n')); await rt.close(); }
})().catch((e) => { console.error('bench:', e.message); process.exit(1); });
