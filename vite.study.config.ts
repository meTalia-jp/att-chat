import { defineConfig } from 'vite';
export default defineConfig({build:{outDir:'.cache/study-poc-dist',rollupOptions:{input:{study:'study-poc.html',debug:'study-debug.html'}}}});
