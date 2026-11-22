// Render every card style (or a list) through the test page: node engine/tools/test_world/cards.js [--out dir] [--w 360 --h 640]
const fs = require('fs'), path = require('path');
const { loadPlaywright } = require('../../browser'); const { start } = require('../../server');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const CARDS = [
  { style: 'notebook', drawing: 'moon', text: "Mom isn't Mom at night. Leave a crack." },
  { style: 'sign_wood', title: 'WELCOME TO', text: 'MAPLE HOLLOW' },
  { style: 'sign_metal', title: 'WELCOME TO', text: 'HOLLOW', subtitle: 'POP. 412' },
  { style: 'plaque', title: 'ELIAS HART', text: 'THE ONE WHO NEVER SLEPT' },
  { style: 'note', title: 'RULE #1', text: "Don't open the door after 3:00. Not even for Mom." },
  { style: 'phone', title: 'Mom', text: 'where are you??\n>at the lake\ncome home NOW\nit is not me in the kitchen' },
  { style: 'newspaper', title: 'MAPLE HOLLOW GAZETTE', text: 'Whole town forgets the same night', drawing: 'house' },
  { style: 'monitor', text: '72' },
  { style: 'calendar', title: 'OCTOBER', text: '13', note: 'THE LAST NIGHT' },
  { style: 'clock', text: '3:00', title: 'AM' },
];
(async () => {
  const { chromium } = loadPlaywright(); const srv = await start(0); const W = +(args.w || 360), H = +(args.h || 640);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } }); const logs = [];
  page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('pageerror ' + e.message));
  await page.goto(srv.url + 'engine/tools/test_world/index.html'); await page.waitForFunction('window.__ready === true');
  await page.evaluate((o) => window.tw.init(o), { width: W, height: H });
  const out = args.out || '/tmp/cards'; fs.mkdirSync(out, { recursive: true });
  const only = args.only ? String(args.only).split(',') : null;
  for (const c of CARDS) {
    if (only && !only.includes(c.style)) continue;
    await page.evaluate((s) => window.tw.load(s), { set: 'card', setOptions: c, time: args.time || 'day' });
    await page.evaluate(() => window.tw.view('establishing'));
    const r = await page.evaluate(() => window.tw.render(0, 0.9));
    const f = path.join(out, `card_${c.style}.jpg`); fs.writeFileSync(f, Buffer.from(r.url.slice(r.url.indexOf(',') + 1), 'base64')); console.log(f, Math.round(r.ms) + 'ms');
  }
  if (logs.filter(l => !/GL Driver/.test(l)).length) console.log(logs.filter(l => !/GL Driver/.test(l)).slice(-10).join('\n'));
  await browser.close(); srv.server.close();
})();
