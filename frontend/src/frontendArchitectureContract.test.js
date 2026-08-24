// STATIC CONTRACT: sólo conserva invariantes arquitectónicas/accesibles que no compensa subir a E2E.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(`./components/${name}`, import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const authenticatedAudio = readFileSync(new URL('./useAuthenticatedAudio.js', import.meta.url), 'utf8');

describe('frontend architecture contract', () => {
  it('los modales comunes mantienen semántica de diálogo accesible', () => {
    const modalFiles = [
      'AccountModal.jsx', 'AchievementsModal.jsx', 'AttackConfirmModal.jsx', 'FeedbackModal.jsx',
      'GameReportModal.jsx', 'MechanicTutorialModal.jsx', 'MirrorModeModal.jsx', 'PieceInfoModal.jsx',
      'ProfileBackupModal.jsx', 'PromotionModal.jsx', 'QuickMatchModal.jsx', 'RatingDetailModal.jsx', 'ShareResultModal.jsx',
    ];
    for (const name of modalFiles) {
      const source = read(name);
      expect(source, name).toContain('role="dialog"');
      expect(source, name).toContain('aria-modal="true"');
    }
  });

  it('las pantallas pesadas y el audio siguen cargándose bajo demanda', () => {
    for (const module of ['GameScreen', 'RoguelikeScreen', 'AdminScreen', 'InsightsScreen', 'MusicPlayer']) {
      expect(app).toContain(`const ${module} = React.lazy(`);
    }
    expect(app).toContain("useAuthenticatedAudio(loggedIn, ready);");
    expect(authenticatedAudio).toContain("import('./sound.js').then((module) => {");
    expect(authenticatedAudio).not.toContain("import { startAmbientMusic, stopAmbientMusic } from './sound.js';");
  });
});
