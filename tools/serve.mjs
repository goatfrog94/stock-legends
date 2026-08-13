/** 의존성 없는 초경량 정적 서버. `node tools/serve.mjs` 후 http://localhost:8123 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    await stat(file);
    const type = MIME[extname(file)] || 'application/octet-stream';
    const body = await readFile(file);
    // GitHub Pages는 텍스트를 gzip으로 보낸다. 로컬에서도 같은 조건으로 재야 체감이 맞다
    if (/text|json|javascript/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip' });
      res.end(gzipSync(body));
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
