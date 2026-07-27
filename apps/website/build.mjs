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

  // Prefer /releases/latest, but if that release has no .exe (broken publish),
  // walk recent releases until we find a complete installer.
  const listUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`;
  const res = await fetch(listUrl, { headers });
  if (!res.ok) {
    console.warn(`GitHub API returned ${res.status} for releases list. Download will be unavailable.`);
    if (res.status === 403) console.warn('Rate limited? Make sure GITHUB_TOKEN is set in Vercel env.');
    if (res.status === 404) console.warn('No releases found or repo not accessible.');
    return null;
  }

  const releases = await res.json();
  if (!Array.isArray(releases) || releases.length === 0) {
    console.warn('No releases found.');
    return null;
  }

  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const tag = release.tag_name;
    const version = String(tag || '').replace(/^v/, '');
    const exeAsset = (release.assets || []).find(
      (a) =>
        typeof a.name === 'string' &&
        a.name.endsWith('.exe') &&
        !a.name.endsWith('.exe.blockmap')
    );
    if (!exeAsset) {
      console.warn('Skipping incomplete release ' + tag + ' (no .exe).');
      continue;
    }
    return {
      version,
      filename: exeAsset.name,
      downloadUrl: exeAsset.browser_download_url,
    };
  }

  console.warn('No complete .exe release found in recent releases.');
  return null;
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

  const publicManifest = {
    version: manifest.version,
    downloadUrl: manifest.downloadUrl,
  };
  const js = 'window.__RELEASE_MANIFEST__ = ' + JSON.stringify(publicManifest, null, 2) + ';';
  const versionJsPath = resolve(releaseDir, 'version.js');
  writeFileSync(versionJsPath, js, 'utf8');

  const manifestJson = {
    version: manifest.version,
    filename: manifest.filename,
    downloadUrl: manifest.downloadUrl,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(
    resolve(releaseDir, 'manifest.json'),
    JSON.stringify(manifestJson, null, 2) + '\n',
    'utf8'
  );

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
