// node render.js test 0,2,4,...   -> out/test_<t>.jpg (frames at given seconds)
// node render.js full [dur=17.28]  -> out/danse.mp4 (720x1280 rendered, 1080x1920 delivered, fades in/out, no audio)
const http = require('http'), fs = require('fs'), path = require('path'), { spawn, execSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const ROOT = path.join(__dirname, 'web'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
const FPS = 30;
(async () => {
  await new Promise((res) => srv.listen(0, res));
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  page.on('console', (m) => console.log('[page]', m.text())); page.on('pageerror', (e) => console.log('[err]', e.message));
  await page.goto(`http://localhost:${srv.address().port}/index.html`);
  await page.waitForFunction('window.ready === true', null, { timeout: 60000 });
  const grab = async (t) => Buffer.from((await page.evaluate((t) => window.renderFrame(t), t)).split(',')[1], 'base64');
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'test') {
    for (const t of (arg || '0,3,6,9,12,15').split(',').map(Number)) fs.writeFileSync(path.join(OUT, `test_${t}.jpg`), await grab(t));
  } else {
    const dur = +(arg || 17.28), n = Math.round(dur * FPS), fo = (dur - 1).toFixed(2);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', `scale=1080:1920:flags=lanczos,fade=t=in:st=0:d=0.9,fade=t=out:st=${fo}:d=1`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', '-an', path.join(OUT, 'danse.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const buf = await grab(i / FPS);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 60 === 0) console.log(`${i}/${n}  ${((Date.now() - t0) / (i + 1)).toFixed(0)} ms/f`);
    }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r));
    console.log('done', path.join(OUT, 'danse.mp4'));
  }
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
