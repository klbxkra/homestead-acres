/// <reference types="node" />
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { precacheList, serviceWorkerSource } from '../../src/pwa/serviceWorker';

describe('service worker', () => {
  it('precaches the page, the bundle and public files, but not source maps or itself', () => {
    const files = precacheList(['assets/index-abc.js', 'assets/index-abc.js.map', 'assets/index-def.css', 'sw.js'], ['manifest.webmanifest', 'icons/icon-192.png']);
    expect(files).toEqual(['./', 'assets/index-abc.js', 'assets/index-def.css', 'icons/icon-192.png', 'index.html', 'manifest.webmanifest']);
  });

  it('names its cache after the build and lists the files', () => {
    const src = serviceWorkerSource(['./', 'index.html'], 'v123');
    expect(src).toContain('"homestead-acres-v123"');
    expect(src).toContain('["./","index.html"]');
    // It is plain JavaScript a browser can run (parse it without executing).
    expect(() => new Function(src)).not.toThrow();
    // Module scripts carry an Origin header the install-time requests don't; "Vary: Origin" must not cause a miss.
    expect(src).toContain('ignoreVary: true');
  });
});

describe('web app manifest', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf-8')) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it('is installable: name, relative start URL, standalone, 192 and 512 icons, a maskable icon', () => {
    expect(manifest.name).toBe('Homestead Acres');
    expect(manifest.start_url).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('points at icon files that exist', () => {
    for (const icon of manifest.icons) expect(existsSync(join(root, icon.src)), icon.src).toBe(true);
    expect(existsSync(join(root, 'icons', 'apple-touch-icon.png'))).toBe(true);
  });
});
