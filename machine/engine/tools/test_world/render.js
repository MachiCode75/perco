// node engine/tools/test_world/render.js --set lake_dock [--time day] [--weather clear] [--views establishing,wide]
//   [--cam x,y,z:tx,ty,tz:fov] [--actors A,B] [--crowd 10] [--w 360 --h 640] [--out dir/prefix] [--t 0]
const fs = require('fs'), path = require('path');
const { loadPlaywright } = require('../../browser');
const { start } = require('../../server');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
(async () => {
  const { chromium } = loadPlaywright(); const srv = await start(0);
  const W = +(args.w || 360), Hh = +(args.h || 640);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: Hh } }); const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`)); page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  await page.goto(srv.url + 'engine/tools/test_world/index.html');
  await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
  await page.evaluate((o) => window.tw.init(o), { width: W, height: Hh });
  const sets = String(args.set || 'lake_dock').split(',');
  const times = String(args.time || 'day').split(',');
  const out = args.out || '/tmp/tw/shot';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    for (const set of sets) for (const time of times) {
      const spec = { set, time, weather: args.weather || 'clear', seed: 1,
        actors: args.actors ? String(args.actors).split(',').map(m => { const [mark, depth] = m.split('@'); return { mark, depth: +(depth || 0) }; }) : [],
        crowd: args.crowd ? { count: +args.crowd, area: args.area || 'crowd', depth: +(args.cdepth || 0) } : null };
      const info = await page.evaluate((s) => window.tw.load(s), spec);
      console.log(set, time, JSON.stringify(info));
      const views = args.cam ? [args.cam] : String(args.views || 'establishing').split(',');
      for (const v of views) {
        let view = v;
        if (v.includes(':')) { const [p, t, f] = v.split(':'); view = { pos: p.split(',').map(Number), target: t.split(',').map(Number), fov: +(f || 50) }; }
        await page.evaluate((vv) => window.tw.view(vv), view);
        let r;
        for (let k = 0; k < (+args.reps || 1); k++) r = await page.evaluate((t) => window.tw.render(t), +(args.t || 0));
        const name = `${out}_${set}_${time}${args.weather ? '_' + args.weather : ''}_${typeof view === 'string' ? view : 'cam'}.jpg`;
        fs.writeFileSync(name, Buffer.from(r.url.slice(r.url.indexOf(',') + 1), 'base64'));
        console.log('  ', name, `${r.ms.toFixed(0)}ms calls=${r.calls} tris=${r.tris}`);
      }
    }
  } catch (e) { console.error('ERROR', e.message); }
  if (logs.length) console.log(logs.slice(-20).join('\n'));
  await browser.close(); srv.server.close();
})();
