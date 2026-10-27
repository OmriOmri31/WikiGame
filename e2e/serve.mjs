// Serves a built app (default ../web/dist-e2e) the way Netlify does: the [[headers]] from
// netlify.toml on every response (so the real CSP applies in the tests) and index.html for
// app routes like /terms. Usage: node serve.mjs [dir] [port]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const root = resolve(here, process.argv[2] || '../web/dist-e2e');
const port = Number(process.argv[3] || process.env.E2E_PORT || 4173);

export function netlifyHeaders(toml) {
  const block = toml.split('[headers.values]')[1] || '';
  const headers = {};
  for (const line of block.split('\n')) {
    if (line.trim().startsWith('[')) break;
    const match = line.match(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/);
    if (match) headers[match[1]] = match[2];
  }
  return headers;
}

const headers = netlifyHeaders(readFileSync(resolve(here, '../netlify.toml'), 'utf8'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');
  }
  res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
