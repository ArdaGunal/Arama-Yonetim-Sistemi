import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const base = '/Arama-Yonetim-Sistemi/';
const port = Number(process.env.PWA_PREVIEW_PORT || 8091);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
  const relative = decodeURIComponent(pathname.slice(base.length)) || 'index.html';
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
}).listen(port, 'localhost', () => console.log(`PWA önizleme: http://localhost:${port}${base}`));
