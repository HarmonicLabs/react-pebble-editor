import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'ReactPebbleEditor',
      fileName: (format) => `react-pebble-editor.${format}.js`,
    },
    rollupOptions: {
      // `react/jsx-runtime` + dev variant must be external too. Vite 7+
      // bundles the JSX automatic-runtime polyfill into the output via
      // CJS `require("react/jsx-runtime")` inside an inner factory; if
      // not externalised, that CJS require leaks into the published ESM
      // and breaks server-side renderers (Docusaurus SSG, Next.js, etc.)
      // with "Cannot find module 'react'".
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
      output: {
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
          'react/jsx-dev-runtime': 'jsxDevRuntime',
        }
      }
    }
  }
})
