const { loadPlaywright } = require('../../browser'); const { start } = require('../../server');
(async () => { const { chromium } = loadPlaywright(); const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } }); page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(srv.url + 'engine/tools/test_world/index.html'); await page.waitForFunction('window.__ready === true');
  await page.evaluate(() => window.tw.init({ width: 64, height: 64 }));
  for (const set of (process.argv[2] || 'lake_dock').split(',')) { const i = await page.evaluate((s) => window.tw.load({ set: s }), set); console.log(set, 'build ms', i.ms.toFixed(0)); console.log(await page.evaluate(() => window.tw.stats())); }
  await browser.close(); srv.server.close(); })();
