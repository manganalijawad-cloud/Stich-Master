/**
 * Prepare a filtered env file for the packaged Electron app.
 * Only Auth-related keys are included (no unrelated secrets).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '.env');
const OUT_DIR = path.join(ROOT, 'config');
const OUT = path.join(OUT_DIR, 'desktop.env');

const ALLOWED = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_JWT_SECRET',
]);

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (ALLOWED.has(key)) out[key] = val;
  }
  return out;
}

if (!fs.existsSync(SRC)) {
  console.error('ERROR: Missing .env at repo root. Copy .env.example and fill Auth values.');
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(SRC, 'utf8'));

// Prefer explicit SUPABASE_*; otherwise mirror VITE_* for the local server.
if (!env.SUPABASE_URL && env.VITE_SUPABASE_URL) {
  env.SUPABASE_URL = env.VITE_SUPABASE_URL;
}
if (!env.SUPABASE_ANON_KEY && env.VITE_SUPABASE_ANON_KEY) {
  env.SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
}

const missing = [];
if (!env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
if (!env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
if (missing.length) {
  console.error(`ERROR: Missing required Auth config in .env: ${missing.join(', ')}`);
  process.exit(1);
}

const lines = Object.entries(env)
  .filter(([k, v]) => {
    // Never bake an empty JWT secret into the installer.
    if (k === 'SUPABASE_JWT_SECRET' && (!v || !String(v).trim())) return false;
    return true;
  })
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log('Prepared packaged desktop env: config/desktop.env');
if (env.SUPABASE_JWT_SECRET) {
  console.warn(
    'WARNING: SUPABASE_JWT_SECRET is included in the packaged env. Prefer JWKS-only (ES256) and omit this secret for production builds.'
  );
}
