/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { precacheList, serviceWorkerSource } from './src/pwa/serviceWorker';

/** Every file under `dir`, as forward-slash paths relative to it. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).replace(/\\/g, '/'));
    }
  };
  walk(dir);
  return out;
}

/**
 * Writes sw.js into the build with the list of files to cache for offline play
 * (PLAN.md Phase 7). Its cache name is a hash of the build, so each release
 * replaces the previous cache.
 */
function serviceWorker(): Plugin {
  return {
    name: 'homestead-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = listFiles('public');
      const files = precacheList(Object.keys(bundle), publicFiles);
      const hash = createHash('sha256');
      for (const [name, chunk] of Object.entries(bundle)) hash.update(name).update(chunk.type === 'chunk' ? chunk.code : chunk.source);
      for (const f of publicFiles) hash.update(f).update(readFileSync(join('public', f)));
      hash.update(serviceWorkerSource(files, '')); // a change to the worker itself is a new version too
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(files, hash.digest('hex').slice(0, 12)) });
    },
  };
}

export default defineConfig({
  // Relative paths, so the build works from any folder (GitHub Pages project sites, itch.io, a USB stick).
  base: './',
  plugins: [preact(), serviceWorker()],
  server: {
    port: 5173,
    // Fail loudly if an old dev server still holds the port, instead of quietly
    // moving to 5174+ where the preview (and your bookmarks) won't find it.
    strictPort: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000, // Phaser alone is ~1.2 MB minified
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
