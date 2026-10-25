import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works from any folder on a static host.
  base: './',
  plugins: [preact()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
