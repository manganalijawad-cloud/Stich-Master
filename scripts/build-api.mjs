import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['scripts/api-entry.ts'],
  bundle: true,
  outfile: 'api/index.mjs',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  packages: 'external',
  external: ['better-sqlite3'],
  sourcemap: false,
});

console.log('Built api/index.mjs successfully');
