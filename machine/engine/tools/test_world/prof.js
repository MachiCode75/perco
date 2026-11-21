// node engine/tools/test_world/prof.js --set lake_dock --view establishing [--w 720 --h 1280]
const { loadPlaywright } = require('../../browser'); const { start } = require('../../server');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
(async () => {
  const { chromium } = loadPlaywright(); const srv = await start(0); const W = +(args.w || 720), H = +(args.h || 1280);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } }); page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(srv.url + 'engine/tools/test_world/index.html'); await page.waitForFunction('window.__ready === true');
  await page.evaluate((o) => window.tw.init(o), { width: W, height: H });
  for (const set of String(args.set || 'lake_dock').split(',')) {
    await page.evaluate((s) => window.tw.load(s), { set, time: args.time || 'day', weather: args.weather || 'clear', actors: [{ mark: 'A' }, { mark: 'B' }, { mark: 'C' }, { mark: 'D' }], crowd: { count: 6 } });
    for (const v of String(args.view || 'establishing').split(',')) { await page.evaluate((vv) => window.tw.view(vv), v); await page.evaluate(() => window.tw.render(0)); console.log(set, v, JSON.stringify(await page.evaluate((m) => (m === 3 ? window.tw.ab(3) : m === 2 ? window.tw.prof2(3) : m ? window.tw.calib(3) : window.tw.profile(2)), +(args.calib || 0)))); }
  }
  await browser.close(); srv.server.close();
})();
