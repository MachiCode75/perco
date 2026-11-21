// Dump every set's marks / crowd arrays / pois / cameraHints (for README / vocab checks)
const { loadPlaywright } = require('../../browser'); const { start } = require('../../server');
(async () => { const { chromium } = loadPlaywright(); const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } }); page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(srv.url + 'engine/tools/test_world/index.html'); await page.waitForFunction('window.__ready === true');
  const out = await page.evaluate(async () => { const w = await import('/engine/web/src/world/index.js'); window.tw.init({ width: 64, height: 64 }); const r = {};
    for (const id of w.SETS) { const i = window.tw.load({ set: id }); r[id] = i; } return { sets: r, props: w.PROPS }; });
  for (const [id, i] of Object.entries(out.sets)) console.log(`${id}: water=${i.water} crowd=${i.crowd} build=${i.ms.toFixed(0)}ms\n  marks: ${i.marks.join(', ')}\n  pois: ${i.pois.join(', ')}\n  hints: ${i.hints.join(', ')}`);
  console.log('PROPS', out.props.length, out.props.join(', '));
  await browser.close(); srv.server.close(); })();
