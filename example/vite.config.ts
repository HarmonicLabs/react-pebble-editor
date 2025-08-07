// vite.config.ts
import { defineConfig, PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs-extra';
import path from 'path';

function copyVsPlugin(): PluginOption {
  return {
    name: 'copy-monaco-vs',
    apply: 'build' as const,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        next();
      });
    },
    async buildStart() {
      const src = path.resolve(__dirname, 'node_modules/@harmoniclabs/monaco-editor/out/monaco-editor/dev/vs');
      const dest = path.resolve(__dirname, 'public/vs');
      if (fs.existsSync(dest)) {
        await fs.remove(dest);
      }
      await fs.copy(src, dest);
      console.log('[copy-monaco-vs] Copied Monaco /vs to public/vs');
    }
  };
}

export default defineConfig({
  plugins: [react(), copyVsPlugin()],
  server: {
    fs: {
      allow: ['.']
    }
  },
  optimizeDeps: {
    exclude: ['@harmoniclabs/monaco-editor']
  },
  build: {
    rollupOptions: {
      external: ['monaco-editor']
    }
  }
});
