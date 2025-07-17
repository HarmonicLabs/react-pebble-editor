// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '/vs': path.resolve(__dirname, 'node_modules/monaco-editor/dev/vs'),
    },
  },
  server: {
    fs: {
      allow: ['node_modules'], // required to serve loader.js from monaco-editor
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'ReactPebbleEditor',
      fileName: (format) => `react-pebble-editor.${format}.js`,
      formats: ['es', 'cjs', 'umd'], // Include ES, CommonJS, and UMD formats
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'monaco-editor'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'monaco-editor': 'monaco',
        },
      },
    },
  },
});
