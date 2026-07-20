import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['packages/server/src/api-entry.ts'],
  bundle: true,
  outfile: '../../api/index.cjs',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  packages: 'external',
  external: ['better-sqlite3'],
  sourcemap: false,
});

console.log('Built api/index.cjs successfully');
