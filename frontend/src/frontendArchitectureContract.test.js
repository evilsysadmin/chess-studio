// STATIC CONTRACT: sólo conserva invariantes arquitectónicas/accesibles que no compensa subir a E2E.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(`./components/${name}`, import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const authenticatedAudio = readFileSync(new URL('./useAuthenticatedAudio.js', import.meta.url), 'utf8');
const combatBattle = read('CombatBattleView.jsx');

describe('frontend architecture contract', () => {
  it('los modales comunes mantienen semántica de diálogo accesible', () => {
    const modalFiles = [
      'AccountModal.jsx', 'AchievementsModal.jsx', 'AttackConfirmModal.jsx', 'CombatArmySummaryModal.jsx', 'FeedbackModal.jsx',
      'GameReportModal.jsx', 'MechanicTutorialModal.jsx', 'MirrorModeModal.jsx', 'PieceInfoModal.jsx',
      'ProfileBackupModal.jsx', 'PromotionModal.jsx', 'QuickMatchModal.jsx', 'RatingDetailModal.jsx', 'ShareResultModal.jsx',
    ];
    for (const name of modalFiles) {
      const source = read(name);
      expect(source, name).toContain('role="dialog"');
      expect(source, name).toContain('aria-modal="true"');
    }
  });

  it('feedback carga de forma diferida sin derribar la pantalla y conserva su icono de peón', () => {
    expect(app).toContain("import { IconPawn } from './components/Icons.jsx';");
    expect(app).toContain('<IconPawn aria-hidden="true" />');
    expect(app).toMatch(/showGlobalFeedback[\s\S]*<React\.Suspense fallback=\{null\}>[\s\S]*<FeedbackModal/);
    const feedback = read('FeedbackModal.jsx');
    expect(feedback).toContain("useState('general')");
    expect(feedback).not.toContain('Me he liado / UX');
  });

  it('las pantallas pesadas y el audio siguen cargándose bajo demanda', () => {
    for (const module of ['GameScreen', 'RoguelikeScreen', 'AdminScreen', 'InsightsScreen', 'MusicPlayer']) {
      expect(app).toContain(`const ${module} = React.lazy(`);
    }
    expect(app).toContain("useAuthenticatedAudio(loggedIn, ready);");
    expect(authenticatedAudio).toContain("import('./sound.js').then((module) => {");
    expect(authenticatedAudio).not.toContain("import { startAmbientMusic, stopAmbientMusic } from './sound.js';");
  });

  it('en combate la radio conserva la sesión sin convertir el tablero en una esquina de reproductor', () => {
    expect(combatBattle).not.toContain("import MusicPlayer from './MusicPlayer.jsx';");
    expect(combatBattle).not.toContain('<MusicPlayer forceExpanded');
    expect(app).toContain('!isBoardGameView && <GlobalMusicDock');
  });

  it('el asistente de feedback es descartable, aplaza nuevos avisos y no simula un chat', () => {
    const assistant = read('FeedbackAssistant.jsx');
    expect(assistant).toContain('SNOOZE_MS = 7 * 24 * 60 * 60 * 1000');
    expect(assistant).toContain('THANK_YOU_PAUSE_MS = 14 * 24 * 60 * 60 * 1000');
    expect(assistant).toContain('onFeedback();');
  });
});
