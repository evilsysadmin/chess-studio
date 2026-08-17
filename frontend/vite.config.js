import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    base: '/chess-studio/',
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.js'],
  },
});
