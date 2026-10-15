import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
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
