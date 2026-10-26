import { copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { LEVELS } from './src/config';

/**
 * Every view has its own address (./hard, ./calendar, ./12-easy; see
 * src/ui/route.ts), but the build has one page. The fixed views get a copy
 * each, which static hosts like GitHub Pages serve for the address without
 * ".html"; anything else (a day's address) gets 404.html, which they serve
 * for addresses they don't have.
 */
function viewPages(): Plugin {
  let outDir = 'dist';
  return {
    name: 'wordseye-view-pages',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const pages = ['404', 'calendar', 'practice', ...LEVELS.map((level) => level.id)];
      for (const page of pages) {
        await copyFile(join(outDir, 'index.html'), join(outDir, `${page}.html`));
      }
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the build works from any folder on a static host.
  base: './',
  plugins: [preact(), viewPages()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
