import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import { cpSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const mode = process.argv[2]; // 'dev' | 'watch' | undefined (library bundle)

/** Bundle AJV into standalone ESM modules for browser import-map use */
async function bundleVendor() {
  mkdirSync('build/vendor', { recursive: true });
  await Promise.all([
    esbuild.build({
      entryPoints: ['node_modules/ajv/dist/ajv.js'],
      bundle: true,
      format: 'esm',
      outfile: 'build/vendor/ajv.js',
      platform: 'browser',
      sourcemap: true,
    }),
    esbuild.build({
      entryPoints: ['node_modules/ajv/dist/2020.js'],
      bundle: true,
      format: 'esm',
      outfile: 'build/vendor/ajv-2020.js',
      platform: 'browser',
      sourcemap: true,
    }),
    esbuild.build({
      entryPoints: ['node_modules/ajv-formats/dist/index.js'],
      bundle: true,
      format: 'esm',
      outfile: 'build/vendor/ajv-formats.js',
      platform: 'browser',
      sourcemap: true,
    }),
  ]);
}

/** Collect all .ts files under src/ */
function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

if (mode === 'dev' || mode === 'watch') {
  // Transpile each src/**/*.ts -> src/**/*.js in-place (no bundling)
  const entryPoints = [...collectTsFiles('src'), ...collectTsFiles('tests')];

  const buildOptions = {
    entryPoints,
    outdir: 'build',
    outbase: '.',
    format: 'esm',
    sourcemap: true,
    bundle: false,
    platform: 'browser',
  };

  // Pre-bundle vendor dependencies for browser import-map resolution
  await bundleVendor();

  if (mode === 'watch') {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching src/**/*.ts for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log(`Transpiled ${entryPoints.length} .ts files to .js`);
  }
} else {
  // Library bundle: src/index.ts -> dist/pipeline-visualizer.js
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'esm',
    outfile: 'dist/pipeline-visualizer.js',
    sourcemap: true,
  });

  cpSync('style.css', 'dist/style.css');

  // Generate .d.ts type declarations
  execSync('npx tsc --declaration --emitDeclarationOnly --outDir dist/types --noEmit false', { stdio: 'inherit' });

  console.log('Built dist/pipeline-visualizer.js + dist/style.css + dist/types/*.d.ts');
}
