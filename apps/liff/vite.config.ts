import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/liff.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  server: {
    port: 3002,
  },
});
