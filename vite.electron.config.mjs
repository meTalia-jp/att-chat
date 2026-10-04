import { defineConfig } from 'vite';

const frontendPort = Number(process.env.ATTCHAT_ELECTRON_FRONTEND_PORT ?? 5186);
const backendPort = Number(process.env.ATTCHAT_ELECTRON_BACKEND_PORT ?? 5187);
const backend = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', request => request.setHeader('origin', backend));
        },
      },
    },
  },
});
