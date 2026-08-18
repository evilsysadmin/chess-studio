import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/chess-studio/',

  plugins: [react()],

  server: {
    port: 5173,
  },

  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.js'],
  },
});
