// Script to inject environment variables into the website's env.js
// Run during Vercel deployment as a build step.
// Usage: node scripts/env-to-website.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envJsPath = path.resolve(__dirname, '..', 'apps', 'website', 'env.js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('WARNING: Supabase environment variables not found. Auth will not work on the website.');
  console.warn('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

let content = fs.readFileSync(envJsPath, 'utf8');
content = content.replace('__SUPABASE_URL__', supabaseUrl);
content = content.replace('__SUPABASE_ANON_KEY__', supabaseAnonKey);
fs.writeFileSync(envJsPath, content);

console.log('✓ Website env injected:', envJsPath);
