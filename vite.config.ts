// vite.config.ts
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';

// ✅ Plugin to copy monaco-editor's vs folder during build
function copyVsPlugin(): Plugin {
  return {
    name: 'copy-monaco-vs',
    apply: 'build', // only during build
    async closeBundle() {
      const src = path.resolve(__dirname, 'node_modules/monaco-editor/out/dev/vs');
      const dest = path.resolve(__dirname, 'dist/vs');

      // Clean existing dist/vs first
      if (fs.existsSync(dest)) {
        await fse.remove(dest);
      }

      // Copy afresh
      if (fs.existsSync(src)) {
        await fse.copy(src, dest);
        console.log('✅ Copied monaco-editor/out/dev/vs to dist/vs');
      } else {
        console.warn('⚠️ Source "monaco-editor/out/dev/vs" not found!');
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), copyVsPlugin()],
  resolve: {
    alias: {
      '/vs': path.resolve(__dirname, 'dist/vs') // serve from dist/vs at runtime
    }
  },
  server: {
    fs: {
      allow: [
        'node_modules/monaco-editor/dev',
        'dist'
      ]
    }
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'ReactPebbleEditor',
      fileName: (format) => `react-pebble-editor.${format}.js`,
      formats: ['es', 'cjs', 'umd']
    },
    emptyOutDir: false,
    rollupOptions: {
      external: ['react', 'react-dom', 'monaco-editor'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'monaco-editor': 'monaco'
        }
      }
    }
  }
});
