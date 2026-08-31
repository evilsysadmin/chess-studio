import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildReleaseManifest } from './src/releaseManifest.js';

const FRONTEND_DIR = fileURLToPath(new URL('.', import.meta.url));
const BUILD_ID = String(process.env.VITE_BUILD_SHA || '').trim();

function releaseManifestPlugin() {
  return {
    name: 'chess-studio-release-manifest',
    writeBundle(options) {
      const templatePath = path.join(FRONTEND_DIR, 'public', 'release.json');
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
      const manifest = buildReleaseManifest({
        release: template.release,
        buildSha: BUILD_ID,
      });
      const outputDir = path.resolve(FRONTEND_DIR, options.dir || 'dist');
      fs.writeFileSync(path.join(outputDir, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    },
  };
}

export default defineConfig({
  // Producción, staging y desarrollo sirven Chess Studio desde la raíz. Los
  // workflows pueden seguir fijando VITE_PUBLIC_BASE explícitamente para dejar
  // el contrato visible, pero un build manual ya no hereda el prefijo histórico
  // de GitHub Pages.
  base: process.env.VITE_PUBLIC_BASE || '/',

  // `release.js` también se importa directamente desde Playwright/Node. Una
  // constante Vite explícita conserva ese módulo portable y sólo inyecta el
  // SHA en el bundle que realmente va a desplegarse.
  define: {
    __CHESS_BUILD_ID__: JSON.stringify(BUILD_ID),
  },

  plugins: [react(), releaseManifestPlugin()],

  server: {
    port: 5173,
  },

  build: {
    // Board3D y Pawn Trailblazer se cargan de forma lazy y comparten Three.js.
    // El bundle principal no arrastra el motor 3D cuando el usuario permanece
    // en la vista 2D. El bundle_size_report distingue inicial de lazy.
    chunkSizeWarningLimit: 750,
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
