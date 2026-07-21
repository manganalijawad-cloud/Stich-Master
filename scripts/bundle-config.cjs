const fs = require('fs');
const path = require('path');

const ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

function loadDotenvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (ENV_VARS.includes(key)) {
      process.env[key] = process.env[key] || value;
    }
  }
}

loadDotenvFile();

const config = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
};

const configDir = path.join(__dirname, '..', 'config');
if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(
  path.join(configDir, 'production.json'),
  JSON.stringify(config, null, 2) + '\n'
);

const missing = [];
if (!config.SUPABASE_URL) missing.push('SUPABASE_URL');
if (!config.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
if (missing.length > 0) {
  console.error(`ERROR: Missing Supabase configuration: ${missing.join(', ')}`);
  console.error('Set these values in your .env file or as environment variables.');
  process.exit(1);
}
console.log('✓ Production config generated: config/production.json');
