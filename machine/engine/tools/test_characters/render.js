// Character test bench renderer.
//   node engine/tools/test_characters/render.js --scene lineup|faces|poses|props|crowd|patterns|hair|custom [--out file.jpg] [--quality final|preview]
//   --scene custom --config cfg.json   (cfg = { width, height, items:[{spec,pose,face,prop,x,z,yaw,label}], camera:{pos,target,fov} })
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { loadPlaywright } = require('../../browser');
const { start } = require('../../server');
const CAST = require('./cast');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const SCENE = args.scene || 'lineup';
const OUT = args.out || path.join(os.tmpdir(), `characters_${SCENE}.jpg`);
const QUALITY = args.quality || 'final';
const T = +(args.t || 0.35);

const FACES = ['neutral', 'smile', 'happy', 'grin', 'worried', 'sad', 'cry', 'scream', 'angry', 'surprised', 'scared', 'sleep', 'smirk', 'talk', 'wink'];
const POSES = ['stand', 'idle', 'wave', 'walk', 'run', 'sit', 'binoculars', 'hold_sign', 'point', 'arms_up', 'hug', 'cry', 'shrug', 'look_down', 'lie', 'fall', 'jump', 'talk', 'wade', 'carry'];
const POSE_PROP = { binoculars: { type: 'binoculars' }, hold_sign: { type: 'sign', text: 'HI ME!' }, carry: { type: 'bag' }, talk: null, sit: { type: 'stopwatch' } };

async function withPage(w, h, fn) {
  const { chromium } = loadPlaywright();
  const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  try {
    await page.goto(srv.url + 'engine/tools/test_characters/index.html');
    await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
    await page.evaluate((o) => window.test.init(o), { width: w, height: h, quality: QUALITY });
    await fn(page);
  } catch (e) { console.error('ERROR', e.message); }
  if (logs.length) console.log(logs.slice(-20).join('\n'));
  await browser.close(); srv.server.close();
}
const save = (url, f) => { fs.writeFileSync(f, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')); };
function tile(files, cols, out, scaleW) {
  const rows = Math.ceil(files.length / cols);
  const inputs = files.flatMap(f => ['-i', f]);
  const filt = `${files.map((_, i) => `[${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => { const c = i % cols, r = Math.floor(i / cols); return `${c === 0 ? '0' : Array.from({ length: c }, () => 'w0').join('+')}_${r === 0 ? '0' : Array.from({ length: r }, () => 'h0').join('+')}`; }).join('|')}:fill=black${scaleW ? `,scale=${scaleW}:-2` : ''}`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filt, '-q:v', '4', out]);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-'));
  if (SCENE === 'lineup') {
    const keys = args.keys ? String(args.keys).split(',') : ['toby', 'brother', 'mom', 'grandpa', 'mayor', 'bride', 'groom', 'oldlady', 'argyle', 'pyjama', 'overalls', 'dad'];
    const W = +(args.w || 1600), H = +(args.h || 760);
    const n = keys.length, sp = 3.3;
    const items = keys.map((k, i) => ({ spec: CAST[k], x: (i - (n - 1) / 2) * sp, z: 0, yaw: 0, label: CAST[k].name, labelY: -0.25, pose: 'stand' }));
    await withPage(W, H, async (page) => {
      const info = await page.evaluate((c) => window.test.setup(c), { items, camera: { pos: [0, 3.2, n * 3.05], target: [0, 2.35, 0], fov: 32 } });
      console.log('setup', info);
      const r = await page.evaluate((t) => window.test.render(t), T); console.log('render ms', r.renderMs.toFixed(0), 'calls', r.calls);
      save(r.url, OUT); console.log('wrote', OUT);
    });
  } else if (SCENE === 'faces') {
    const W = 260, H = 280; const files = [];
    await withPage(W, H, async (page) => {
      for (const f of FACES) {
        const spec = f === 'angry' ? { ...CAST.grandpa, accessories: [] } : f === 'grin' ? CAST.brother : f === 'cry' ? CAST.argyle : f === 'scream' ? CAST.toby : f === 'talk' ? CAST.mayor : f === 'worried' ? CAST.mom : CAST.toby;
        await page.evaluate((c) => window.test.setup(c), { items: [{ spec, face: f, label: f, labelY: 3.55 }], camera: { pos: [0, 4.75, 4.4], target: [0, 4.5, 0], fov: 32 } });
        const r = await page.evaluate((t) => window.test.render(t), T);
        const fn = path.join(tmp, `f_${f}.jpg`); save(r.url, fn); files.push(fn);
      }
    });
    tile(files, 5, OUT); console.log('wrote', OUT);
  } else if (SCENE === 'poses') {
    const W = 300, H = 400; const files = [];
    const who = args.who || 'toby';
    await withPage(W, H, async (page) => {
      for (const p of POSES) {
        const item = { spec: CAST[who], pose: p, label: p, labelY: -0.1, yaw: p === 'lie' || p === 'fall' ? 70 : 25, prop: POSE_PROP[p] || null, face: p === 'cry' ? 'cry' : p === 'fall' ? 'scared' : p === 'talk' ? 'talk' : undefined, poseOptions: p === 'sit' ? { seat: 1.5 } : {} };
        if (p === 'lie' || p === 'fall') item.x = -1.2;
        await page.evaluate((c) => window.test.setup(c), { items: [item], camera: { pos: [2.5, 5.5, 13.5], target: [0, 2.3, 0], fov: 34 } });
        const r = await page.evaluate((t) => window.test.render(t), p === 'fall' ? 0.3 : T);
        const fn = path.join(tmp, `p_${p}.jpg`); save(r.url, fn); files.push(fn);
      }
    });
    tile(files, 10, OUT, args.scaleW || 1600); console.log('wrote', OUT);
  } else if (SCENE === 'props') {
    const props = [['binoculars', 'binoculars'], ['sign', 'hold_sign'], ['stopwatch', 'stand'], ['phone', 'talk'], ['flashlight', 'point'], ['book', 'carry'], ['cup', 'stand'], ['letter', 'stand'], ['umbrella', 'stand'], ['bag', 'stand']];
    const W = 300, H = 400; const files = [];
    await withPage(W, H, async (page) => {
      for (const [p, pose] of props) {
        await page.evaluate((c) => window.test.setup(c), { items: [{ spec: CAST.dad, pose, label: p, labelY: -0.1, yaw: 20, prop: { type: p, text: 'HI ME!' } }], camera: { pos: [1.5, 4.5, 12], target: [0, 2.8, 0], fov: 34 } });
        const r = await page.evaluate((t) => window.test.render(t), T);
        const fn = path.join(tmp, `pr_${p}.jpg`); save(r.url, fn); files.push(fn);
      }
    });
    tile(files, 5, OUT); console.log('wrote', OUT);
  } else if (SCENE === 'hair') {
    const styles = ['spiky', 'short', 'bowl', 'long', 'ponytail', 'bun', 'bald', 'cap', 'messy', 'curly'];
    const acc = [[], [], [], ['bow'], [], [], ['beard', 'glasses'], [], ['mustache', 'sunglasses'], ['scarf']];
    const W = 260, H = 300; const files = [];
    await withPage(W, H, async (page) => {
      for (let i = 0; i < styles.length; i++) {
        const spec = { ...CAST.dad, hair: { style: styles[i], color: ['#f6dc3c', '#6b4226', '#3b2416', '#ececec', '#1b1b1f', '#1b1b1f', '#888', '#6b4226', '#a5703e', '#3b2416'][i] }, accessories: acc[i] };
        for (const yaw of [25, 160]) {
          await page.evaluate((c) => window.test.setup(c), { items: [{ spec, label: yaw < 90 ? styles[i] : '', labelY: 3.35, yaw }], camera: { pos: [0, 5.0, 6.2], target: [0, 4.3, 0], fov: 32 } });
          const r = await page.evaluate((t) => window.test.render(t), T);
          const fn = path.join(tmp, `h_${i}_${yaw}.jpg`); save(r.url, fn); files.push(fn);
        }
      }
    });
    tile(files, 10, OUT, 1600); console.log('wrote', OUT);
  } else if (SCENE === 'patterns') {
    const pats = ['solid', 'stripes_h', 'stripes_v', 'plaid', 'polka', 'argyle_vest', 'suit', 'overalls', 'hoodie', 'dress', 'pajamas_stars', 'tee_logo', 'vest', 'cardigan'];
    const W = 240, H = 380; const files = [];
    await withPage(W, H, async (page) => {
      for (const p of pats) {
        const spec = { ...CAST.dad, shirt: { pattern: p }, pants: { style: p === 'dress' ? 'none' : 'pants', color: '#2c5aa0' }, accessories: p === 'suit' ? ['tie'] : p === 'hoodie' ? [] : [] };
        for (const yaw of [30, 200]) {
          await page.evaluate((c) => window.test.setup(c), { items: [{ spec, label: yaw < 90 ? p : '', labelY: -0.1, yaw }], camera: { pos: [0, 4.0, 11.5], target: [0, 2.6, 0], fov: 34 } });
          const r = await page.evaluate((t) => window.test.render(t), T);
          const fn = path.join(tmp, `pt_${p}_${yaw}.jpg`); save(r.url, fn); files.push(fn);
        }
      }
    });
    tile(files, 14, OUT, 1800); console.log('wrote', OUT);
  } else if (SCENE === 'crowd') {
    const W = 720, H = 1280, N = +(args.n || 30);
    const items = []; for (let i = 0; i < N; i++) { const c = i % 6, r = Math.floor(i / 6); items.push({ x: (c - 2.5) * 3.2 + (r % 2) * 1.2, z: -r * 3.5, yaw: (i * 37) % 60 - 30, pose: ['stand', 'idle', 'walk', 'wave', 'talk', 'arms_up'][i % 6] }); }
    await withPage(W, H, async (page) => {
      const info = await page.evaluate((c) => window.test.setup(c), { seed: +(args.seed || 7), items, camera: { pos: [0, 7, 22], target: [0, 2.5, -6], fov: 50 } });
      console.log('setup', info);
      const times = [];
      for (let i = 0; i < 6; i++) { const r = await page.evaluate((t) => window.test.render(t, { labels: false }), i / 30); times.push(r.renderMs); if (i === 5) { save(r.url, OUT); console.log('calls', r.calls, 'tris', r.tris); } }
      console.log('render ms per frame:', times.map(x => x.toFixed(0)).join(' '));
      console.log('wrote', OUT);
    });
  } else if (SCENE === 'custom') {
    const cfg = JSON.parse(fs.readFileSync(args.config, 'utf8'));
    const W = cfg.width || 720, H = cfg.height || 1280;
    await withPage(W, H, async (page) => {
      for (const it of cfg.items) if (typeof it.spec === 'string') it.spec = CAST[it.spec];
      const info = await page.evaluate((c) => window.test.setup(c), cfg); console.log('setup', info);
      const ts = String(args.t || cfg.t || 0).split(',').map(Number);
      for (let i = 0; i < ts.length; i++) {
        const r = await page.evaluate((t) => window.test.render(t), ts[i]);
        const f = ts.length > 1 ? OUT.replace(/(\.\w+)$/, `_${i}$1`) : OUT; save(r.url, f); console.log('wrote', f, 'ms', r.renderMs.toFixed(0));
      }
      if (cfg.anchors) console.log(JSON.stringify(await page.evaluate(() => window.test.anchors(0))));
    });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
})();
