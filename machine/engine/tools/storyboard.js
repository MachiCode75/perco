#!/usr/bin/env node
// Storyboard / QA contact sheet: one still per shot (mid-shot by default), labelled, binocular mask applied.
//   node engine/tools/storyboard.js --episode episodes/x/episode.json [--timeline build/x/timeline.json] --out sheet.jpg
//        [--only 001-020] [--at 0.5] [--cols 6] [--w 360 --h 640] [--workers 2] [--no-mask] [--stills dir] [--quality preview]
// Framing matrix (all FRAMINGS on one sheet, for director QA with whatever characters/world exist):
//   node engine/tools/storyboard.js --matrix [--set lake_dock] [--time day] --out framings.jpg
const fs = require('fs'), path = require('path');
const { openRuntime, dataUrlToBuffer, parseArgs, resolveShot } = require('../browser');
const { start: startServer } = require('../server');

const args = parseArgs();
const W = +(args.w || 360), H = +(args.h || 640);
const at = args.at !== undefined ? +args.at : 0.5;
const out = path.resolve(args.out && args.out !== true ? args.out : 'storyboard.jpg');

function matrixShots() {
  const set = args.set || 'lake_dock', time = args.time || 'day';
  const kid = { build: 'kid', hair: { style: 'spiky', color: '#f5d742' }, shirt: { pattern: 'stripes_h', colors: ['#f2c511', '#151515'] }, pants: { style: 'pants', color: '#151515' } };
  const toby = { build: 'kid', hair: { style: 'messy', color: '#6b3d1f' }, shirt: { pattern: 'tee_logo', colors: ['#e8442e', '#f2c511'] }, pants: { color: '#2c5bd6' } };
  const fr = ['extreme_wide', 'wide', 'aerial', 'establishing', 'medium', 'medium_close', 'close_up', 'extreme_close_up', 'over_shoulder', 'pov', 'two_shot', 'insert', 'low_angle', 'high_angle', 'back'];
  const shots = fr.map((f, i) => ({
    id: String(i + 1).padStart(3, '0'), say: f, set, time, framing: f, move: 'static', subject: 'me',
    target: f === 'pov' || f === 'over_shoulder' ? 'toby' : undefined, binoculars: f === 'pov',
    actors: [{ id: 'me', mark: 'A', pose: f === 'insert' ? 'hold_sign' : 'stand', face: 'smile', prop: f === 'insert' ? { type: 'sign', text: 'HI ME!' } : null },
      { id: 'toby', mark: 'B', pose: 'wave', face: 'grin' }],
  }));
  return { episode: { id: 'matrix', cast: { me: kid, toby }, shots }, timeline: null };
}

function load() {
  if (args.matrix) return matrixShots();
  if (!args.episode) { console.error('usage: storyboard.js --episode <episode.json> --out sheet.jpg  |  --matrix --out x.jpg'); process.exit(2); }
  const episode = JSON.parse(fs.readFileSync(args.episode, 'utf8'));
  let tl = args.timeline || path.join(path.dirname(args.episode), 'timeline.json');
  const slugTl = path.resolve(__dirname, '../../build', String(episode.id || ''), 'timeline.json');
  if (!fs.existsSync(tl) && fs.existsSync(slugTl)) tl = slugTl;
  return { episode, timeline: fs.existsSync(tl) ? JSON.parse(fs.readFileSync(tl, 'utf8')) : null };
}

// Compose the sheet inside the browser (2D canvas): tiles + labels + binocular mask.
async function compose(page, tiles, { cols, tw, th, mask }) {
  return page.evaluate(async ({ tiles, cols, tw, th, mask }) => {
    const img = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const m = mask ? await img('/assets/jumelles_720x1280.png') : null;
    const rows = Math.ceil(tiles.length / cols), lab = 34;
    const c = document.createElement('canvas'); c.width = cols * tw; c.height = rows * (th + lab);
    const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i]; const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + lab);
      const im = t.url ? await img(t.url) : null;
      if (im) g.drawImage(im, x, y, tw, th); else { g.fillStyle = '#600'; g.fillRect(x, y, tw, th); }
      if (im && t.bino && m) { g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(m, x, y, tw, th); g.restore(); }
      g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, tw - 2, th - 2);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, tw, 18);
      g.font = 'bold 13px sans-serif'; g.fillStyle = '#ffe14a'; g.fillText(t.title, x + 4, y + 13);
      g.font = '12px sans-serif'; g.fillStyle = t.err ? '#ff6b6b' : '#ddd';
      const words = String(t.sub || ''); g.fillText(words.length > tw / 6.4 ? words.slice(0, Math.floor(tw / 6.4) - 1) + '…' : words, x + 4, y + th + 14);
      if (t.sub2) { g.fillStyle = '#999'; g.fillText(t.sub2.slice(0, Math.floor(tw / 6.4)), x + 4, y + th + 29); }
    }
    return c.toDataURL('image/jpeg', 0.88);
  }, { tiles, cols, tw, th, mask });
}

(async () => {
  const { episode, timeline } = load();
  const fps = timeline?.fps || 30;
  const tl = new Map((timeline?.shots || []).map((s) => [String(s.id), s]));
  let shots = episode.shots || [];
  if (args.only) { const ids = new Set(); for (const p of String(args.only).split(',')) { const m = /^(\d+)-(\d+)$/.exec(p); if (m) for (let i = +m[1]; i <= +m[2]; i++) ids.add(String(i).padStart(m[1].length, '0')); else ids.add(p); } shots = shots.filter((s) => ids.has(String(s.id))); }
  const server = await startServer(0);
  const nW = Math.max(1, Math.min(+(args.workers || 2), shots.length));
  const queue = shots.map((s, i) => ({ s, i })); const tiles = new Array(shots.length);
  if (args.stills) fs.mkdirSync(args.stills, { recursive: true });
  const T0 = Date.now();
  let composer = null;
  await Promise.all(Array.from({ length: nW }, async () => {
    const rt = await openRuntime({ width: W, height: H, quality: args.quality || 'final', server });
    if (!composer) composer = rt; else rt.keep = false;
    while (queue.length) {
      const { s, i } = queue.shift();
      const frames = tl.get(String(s.id))?.frames ?? Math.round((s.duration || 1.5) * fps);
      const { shot } = resolveShot(episode, s, { frames, fps });
      const tile = { title: `${s.id}  ${s.framing || ''}${s.binoculars ? ' 🔭' : ''}  ${s.move || 'static'}`.replace('🔭', '[bino]'), sub: s.say || '', sub2: `${s.set || ''} · ${s.time || 'day'}${s.weather && s.weather !== 'clear' ? ' · ' + s.weather : ''}`, bino: !!s.binoculars && !args['no-mask'] };
      const n0 = rt.logs.length;
      try {
        const info = await rt.page.evaluate((x) => window.engine.loadShot(x), shot);
        tile.url = await rt.page.evaluate((t) => window.engine.renderFrame(t, 'image/jpeg', 0.9), Math.min(shot.duration * at, shot.duration - 1 / fps));
        if (info.warnings?.length) tile.sub2 += `  ⚠${info.warnings.length}`;
        if (args.stills) fs.writeFileSync(path.join(args.stills, `${s.id}.jpg`), dataUrlToBuffer(tile.url));
        if (args.verbose) console.log(s.id, JSON.stringify(info.camera), info.warnings.join(' | '));
        else if (info.warnings?.length) console.log(`${s.id}: ${info.warnings.join(' | ')}`);
      } catch (e) {
        tile.err = true; tile.sub = 'ERROR ' + e.message.split('\n')[0];
        console.error(`${s.id}: ${e.message.split('\n')[0]}`); console.error(rt.logs.slice(n0).slice(-5).join('\n'));
      }
      tiles[i] = tile;
    }
    if (rt !== composer) await rt.close();
  }));
  const cols = +(args.cols || Math.min(6, tiles.length));
  const tw = +(args.tile || 240), th = Math.round(tw * H / W);
  const url = await compose(composer.page, tiles, { cols, tw, th, mask: !args['no-mask'] });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, dataUrlToBuffer(url));
  await composer.close(); server.server.close();
  console.log(`storyboard: ${tiles.length} shots → ${out} (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
})().catch((e) => { console.error('storyboard: fatal', e); process.exit(1); });
