import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const path = resolve(root, `.${pathname === '/' ? '/tests/demo.html' : decodeURIComponent(pathname)}`);
    if (![resolve(root,'tests')+sep, resolve(root,'extension')+sep].some((allowed) => path.startsWith(allowed))) throw new Error('not found');
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'text/plain', 'Cache-Control': 'no-store' });
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Synthetic test mail only: http://127.0.0.1:4173'));
