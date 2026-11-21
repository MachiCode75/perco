// Tiny static server rooted at machine/. Usage: const {start} = require('./server'); const s = await start(port)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
function start(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? '/engine/web/index.html' : rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    }).listen(port, '127.0.0.1', () => resolve({ server: srv, port: srv.address().port, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}
module.exports = { start, ROOT };
if (require.main === module) start(+process.argv[2] || 8787).then(s => console.log('serving', s.url));
