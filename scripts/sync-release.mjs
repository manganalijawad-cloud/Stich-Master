import { readdirSync, statSync, copyFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const releaseDir = join(rootDir, 'release');
const websiteReleaseDir = join(rootDir, 'apps', 'website', 'release');

function getLatestInstaller() {
  if (!existsSync(releaseDir)) {
    console.error('ERROR: release/ directory not found at', releaseDir);
    return null;
  }

  const files = readdirSync(releaseDir)
    .filter(f => f.endsWith('.exe') && f.toLowerCase().includes('setup'))
    .map(f => ({
      name: f,
      mtime: statSync(join(releaseDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0] : null;
}

function extractVersion(filename) {
  const match = filename.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : '0.0.0';
}

function cleanDirectory(dir) {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    unlinkSync(join(dir, file));
  }
}

function main() {
  const latest = getLatestInstaller();

  if (!latest) {
    console.error('ERROR: No setup installer (.exe) found in release/');
    console.error('Run "npm run electron:build" first to generate an installer.');
    process.exit(1);
  }

  if (!existsSync(websiteReleaseDir)) {
    mkdirSync(websiteReleaseDir, { recursive: true });
  }

  cleanDirectory(websiteReleaseDir);

  const version = extractVersion(latest.name);
  const destPath = join(websiteReleaseDir, latest.name);

  copyFileSync(join(releaseDir, latest.name), destPath);

  const manifest = {
    version,
    filename: latest.name,
    updatedAt: new Date().toISOString()
  };

  writeFileSync(
    join(websiteReleaseDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\u2713 Release synced: v${version} (${latest.name}) \u2192 apps/website/release/`);
}

main();
