import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const websiteDir = path.join(rootDir, 'apps', 'website');
const websiteReleaseDir = path.join(websiteDir, 'release');
const projectReleaseDir = path.join(rootDir, 'release');

const PORT = process.env.PORT || 5173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.exe': 'application/octet-stream',
  '.yml': 'text/plain; charset=utf-8',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer((req, res) => {
  let url = req.url;

  if (url.startsWith('/release/')) {
    const relativePath = url.slice(9);
    const websitePath = path.join(websiteReleaseDir, relativePath);
    const projectPath = path.join(projectReleaseDir, relativePath);

    const resolved = path.resolve(websitePath);
    if (resolved.startsWith(path.resolve(websiteReleaseDir)) && fs.existsSync(websitePath)) {
      serveFile(res, websitePath);
      return;
    }

    const resolvedProject = path.resolve(projectPath);
    if (resolvedProject.startsWith(path.resolve(projectReleaseDir)) && fs.existsSync(projectPath)) {
      serveFile(res, projectPath);
      return;
    }

    res.writeHead(404);
    res.end('Not Found: ' + url);
    return;
  }

  const filePath = url === '/' ? path.join(websiteDir, 'index.html') : path.join(websiteDir, url);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(path.resolve(websiteDir))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveFile(res, resolved);
});

server.listen(PORT, () => {
  console.log(`Website: http://localhost:${PORT}`);
  console.log(`Release: http://localhost:${PORT}/release/`);
});
