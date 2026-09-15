import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/api': 'http://127.0.0.1:5181' } }, build: { rollupOptions: { input: { app: 'index.html', modeBPoc: 'mode-b-poc.html' } } } });
