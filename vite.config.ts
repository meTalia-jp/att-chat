import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/api': 'http://127.0.0.1:5181' } }, build: { rollupOptions: { input: { app: 'index.html', laboratory: 'laboratory.html', singleText: 'single-text-generation.html', simpleMarkerChat: 'simple-marker-chat.html', modeBPoc: 'mode-b-poc.html' } } } });
