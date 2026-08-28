import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages usa /chess-studio/ en el dominio github.io, pero un dominio
  // propio sirve la aplicación desde /. El workflow de Pages fija la segunda
  // variante sin romper previews ni E2E locales.
  base: process.env.VITE_PUBLIC_BASE || '/chess-studio/',

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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // Medimos primero la lógica crítica y estable. Los componentes React se
      // validan en navegador real con Playwright; incluirlos aquí falsearía la
      // señal porque esta suite Vitest corre deliberadamente en entorno node.
      include: [
        'src/api.js',
        'src/auth.js',
        'src/clock.js',
        'src/clockPersistence.js',
        'src/playerRating.js',
        'src/profileBackup.js',
        'src/puzzles.js',
        'src/tournament.js',
        'src/tournamentRewards.js',
        'src/combat.js',
        'src/combatBalance.js',
        'src/combatCampaign.js',
        'src/combatDebrief.js',
        'src/combatDeployment.js',
        'src/combatDeploymentPresets.js',
        'src/combatIdentity.js',
        'src/combatMetamorphosis.js',
        'src/combatRanks.js',
        'src/combatRoster.js',
        'src/combatService.js',
        'src/combatSession.js',
        'src/combatTechniques.js',
        'src/combatUnitService.js',
        'src/combatArmyGlance.js',
        'src/narrativeProvider.js',
        'src/narrativeRemote.js',
        'src/aiPlayerPortrait.js',
        'src/aiNarrativeTasks.js',
        'src/activeGameSession.js',
        'src/gameReconnect.js',
        'src/gamePayload.js',
        'src/saveStatus.js',
        'src/viewState.js',
        'src/useViewNavigation.js',
        'src/useActiveSessionRestore.js',
        'src/useActiveGameSessionPersistence.js',
        'src/useGameReconnect.js',
        'src/backNavigationStack.js',
        'src/homePlayNudge.js',
        'src/adminFormatting.js',
        'src/observability.js',
        'src/profileKeys.js',
        'src/safeStorage.js',
        'src/storageMigrations.js',
        'src/resetProgress.js',
        'src/gameActivity.js',
        'src/dailyChallenge.js',
        'src/career.js',
        'src/advancedCareer.js',
        'src/postGameHighlights.js',
        'src/metaProgress.js',
        'src/series.js',
        'src/rivalry.js',
        'src/cpuMemory.js',
        'src/personalPuzzles.js',
        'src/mechanicTutorials.js',
        'src/audioContext.js',
        'src/soundPreferences.js',
        'src/soundFx.js',
        'src/ambientCatalog.js',
        'src/ambientProfiles.js',
        'src/sound.js',
      ],
      exclude: ['src/**/*.test.js', 'src/test-setup.js'],
      // Coverage es informativo: CI publica porcentajes/artifacts, pero no
      // bloquea builds por un umbral. El ratchet se decidirá con baseline real.
    },
  },
});
