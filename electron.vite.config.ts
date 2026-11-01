import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: resolve('build/runtime/main'),
      // Keep Three.js addon loaders in the entry bundle, not dependency example folders.
      externalizeDeps: { exclude: ['three'] },
      rolldownOptions: {
        input: resolve('src/main/index.ts'),
        output: { entryFileNames: 'index.js', format: 'es' },
      },
    },
  },
  preload: {
    build: {
      outDir: resolve('build/runtime/preload'),
      externalizeDeps: false,
      rolldownOptions: {
        input: {
          desktop: resolve('src/preload/desktop.ts'),
          caption: resolve('src/preload/caption.ts'),
          menu: resolve('src/preload/menu.ts'),
        },
        output: { entryFileNames: '[name].cjs', format: 'cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      assetsInlineLimit: 0,
      outDir: resolve('build/runtime/renderer'),
      rolldownOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          settings: resolve('src/renderer/settings.html'),
          caption: resolve('src/renderer/caption.html'),
          menu: resolve('src/renderer/menu.html'),
        },
      },
    },
  },
});
