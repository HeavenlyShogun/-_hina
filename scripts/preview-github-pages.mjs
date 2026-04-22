import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCustomDomain, getGitHubRepo, getPagesBasePath } from './github-pages-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const { repo } = getGitHubRepo();
const customDomain = getCustomDomain();
const basePath = getPagesBasePath({ repo, customDomain });
const normalizedBasePath = basePath === '/' ? '/' : basePath.replace(/\/$/, '');
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(res);
}

function sendNotFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (normalizedBasePath !== '/' && pathname === '/') {
    res.writeHead(302, { Location: basePath });
    res.end();
    return;
  }

  if (normalizedBasePath !== '/' && !pathname.startsWith(`${normalizedBasePath}/`) && pathname !== normalizedBasePath) {
    sendNotFound(res);
    return;
  }

  const relativePath = normalizedBasePath === '/'
    ? pathname.replace(/^\/+/, '')
    : pathname.slice(normalizedBasePath.length).replace(/^\/+/, '');
  const assetPath = relativePath || 'index.html';
  const filePath = path.join(distRoot, assetPath);

  if (existsSync(filePath)) {
    const fileStats = await stat(filePath);
    if (fileStats.isFile()) {
      sendFile(res, filePath);
      return;
    }
  }

  sendFile(res, path.join(distRoot, '404.html'));
});

server.listen(port, () => {
  console.log(`GitHub Pages preview: http://localhost:${port}${basePath}`);
});
