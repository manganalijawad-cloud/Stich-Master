import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envJsPath = resolve(__dirname, 'env.js');

// Marketing site does not use cloud auth — desktop app is SQLite-only.
writeFileSync(
  envJsPath,
  '// Hello Darzi marketing site — no cloud auth configuration required.\nwindow.ENV = {};\n',
  'utf8'
);
console.log('✓ Wrote ' + envJsPath);

async function fetchLatestRelease() {
  const owner = 'manganalijawad-cloud';
  const repo = 'Stich-Master';
  const token = process.env.GITHUB_TOKEN || process.env.VERCEL_GITHUB_TOKEN || '';

  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'hello-darzi-build',
  };
  if (token) headers.Authorization = 'Bearer ' + token;

  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(`GitHub API returned ${res.status} for latest release. Download will be unavailable.`);
    if (res.status === 403) console.warn('Rate limited? Make sure GITHUB_TOKEN is set in Vercel env.');
    if (res.status === 404) console.warn('No releases found or repo not accessible.');
    return null;
  }

  const release = await res.json();
  const tag = release.tag_name;
  const version = tag.replace(/^v/, '');
  const exeAsset = release.assets.find(a => a.name.endsWith('.exe') && a.content_type === 'application/x-msdownload');

  if (!exeAsset) {
    console.warn('No .exe asset found in latest release ' + tag);
    return null;
  }

  return {
    version,
    downloadUrl: exeAsset.browser_download_url,
  };
}

async function writeReleaseManifest() {
  const releaseDir = resolve(__dirname, 'release');
  if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });

  const manifest = await fetchLatestRelease();

  if (!manifest) {
    const fallback = { version: null, downloadUrl: null };
    const fallbackJs = 'window.__RELEASE_MANIFEST__ = ' + JSON.stringify(fallback, null, 2) + ';';
    writeFileSync(resolve(releaseDir, 'version.js'), fallbackJs, 'utf8');
    console.log('⚠ Wrote fallback release/version.js (no release available)');
    return;
  }

  const js = 'window.__RELEASE_MANIFEST__ = ' + JSON.stringify(manifest, null, 2) + ';';
  const versionJsPath = resolve(releaseDir, 'version.js');
  writeFileSync(versionJsPath, js, 'utf8');
  console.log('✓ Wrote ' + versionJsPath + ' — version ' + manifest.version);
  console.log('  Download URL: ' + manifest.downloadUrl);
}

writeReleaseManifest().catch(err => {
  console.error('Failed to generate release manifest:', err.message);
  const releaseDir = resolve(__dirname, 'release');
  if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });
  const fallback = { version: null, downloadUrl: null };
  const fallbackJs = 'window.__RELEASE_MANIFEST__ = ' + JSON.stringify(fallback, null, 2) + ';';
  writeFileSync(resolve(releaseDir, 'version.js'), fallbackJs, 'utf8');
});
