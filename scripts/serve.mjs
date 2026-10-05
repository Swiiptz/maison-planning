import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv.includes('--dist') ? 'dist' : 'app');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const filename = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!filename.startsWith(`${root}${sep}`)) { response.writeHead(403); response.end(); return; }
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body);
  } catch { response.writeHead(404); response.end('Fichier introuvable'); }
});
server.on('error', error => {
  console.error(error.code === 'EPERM' ? 'Cet environnement ne permet pas d’ouvrir un serveur local. Lance npm run dev depuis ton terminal habituel.' : error.message);
  process.exitCode = 1;
});
server.listen(5173, '127.0.0.1', () => console.log('Planning : http://127.0.0.1:5173'));
