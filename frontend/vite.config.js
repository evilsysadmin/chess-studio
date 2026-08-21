import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/chess-studio/',

  plugins: [react()],

  server: {
    port: 5173,
  },

  build: {
    // Board3D ya se carga de forma lazy. Separamos además las librerías gordas
    // para que el bundle principal no arrastre React, chess.js y Three juntos.
    // Three puede rondar ~500 kB minificado, pero sólo se descarga al abrir 3D.
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/')) return 'vendor-three';
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react';
          if (id.includes('/chess.js/')) return 'vendor-chess';
          return 'vendor';
        },
      },
    },
  },

  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.js'],
  },
});
