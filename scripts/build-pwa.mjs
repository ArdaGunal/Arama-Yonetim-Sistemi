import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('dist');

async function list(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) paths.push(...await list(path.join(directory, entry.name), relative));
    else if (entry.isFile() && entry.name !== 'sw.js' && entry.name !== '.nojekyll') paths.push(relative);
  }
  return paths.sort();
}

const paths = await list(output);
if (!paths.includes('index.html') || !paths.includes('manifest.json')) {
  throw new Error('PWA için index.html veya manifest.json bulunamadı.');
}
const privateFiles = paths.filter((relative) => /\.(ays|ayst|xlsx?|csv|tsv|log)$/i.test(relative));
if (privateFiles.length) throw new Error(`Kişi/veri dosyası web yayınına giremez: ${privateFiles.join(', ')}`);
const hash = createHash('sha256');
for (const relative of paths) {
  hash.update(relative);
  hash.update(await readFile(path.join(output, relative)));
}
const cacheName = `ays-static-${hash.digest('hex').slice(0, 16)}`;
const urls = paths.map((relative) => `./${relative}`);
const script = `const CACHE = ${JSON.stringify(cacheName)};
const PREFIX = 'ays-static-';
const FILES = ${JSON.stringify(urls)};
const INDEX = new URL('./index.html', self.registration.scope).href;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((file) => new URL(file, self.registration.scope).href))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request.mode === 'navigate' ? INDEX : request);
    return cached || fetch(request);
  }));
});
`;
await writeFile(path.join(output, 'sw.js'), script);
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`PWA önbelleği hazır: ${cacheName} (${paths.length} dosya)`);
