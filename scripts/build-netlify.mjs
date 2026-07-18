import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['netlify/functions/api.ts'],
  bundle: true,
  outfile: 'netlify/functions-build/api.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  packages: 'external',
  external: ['better-sqlite3'],
});

console.log('Built netlify/functions-build/api.js successfully');
