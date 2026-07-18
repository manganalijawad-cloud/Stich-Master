import * as esbuild from 'esbuild';
import { unlinkSync } from 'fs';

await esbuild.build({
  entryPoints: ['api/index.ts'],
  bundle: true,
  outfile: 'api/index.mjs',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  packages: 'external',
  external: ['better-sqlite3'],
  sourcemap: false,
});

// Remove the TypeScript source so Vercel doesn't detect it as an
// additional serverless function entry and try to re-bundle as CJS.
try { unlinkSync('api/index.ts'); } catch {}

console.log('Built api/index.mjs successfully');
