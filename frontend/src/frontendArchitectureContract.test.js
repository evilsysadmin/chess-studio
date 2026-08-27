// STATIC CONTRACT: sólo conserva invariantes arquitectónicas/accesibles que no compensa subir a E2E.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(`./components/${name}`, import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const authenticatedAudio = readFileSync(new URL('./useAuthenticatedAudio.js', import.meta.url), 'utf8');
const productHardeningCss = readFileSync(new URL('./styles/24-product-hardening.css', import.meta.url), 'utf8');

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

  it('las pantallas pesadas y el audio siguen cargándose bajo demanda', () => {
    for (const module of ['GameScreen', 'RoguelikeScreen', 'AdminScreen', 'InsightsScreen', 'MusicPlayer']) {
      expect(app).toContain(`const ${module} = React.lazy(`);
    }
    expect(app).toContain("useAuthenticatedAudio(loggedIn, ready);");
    expect(authenticatedAudio).toContain("import('./sound.js').then((module) => {");
    expect(authenticatedAudio).not.toContain("import { startAmbientMusic, stopAmbientMusic } from './sound.js';");
  });

  it('el asistente de feedback es descartable, aplaza nuevos avisos y no simula un chat', () => {
    const assistant = read('FeedbackAssistant.jsx');
    expect(assistant).toContain('SNOOZE_MS = 7 * 24 * 60 * 60 * 1000');
    expect(assistant).toContain('THANK_YOU_PAUSE_MS = 14 * 24 * 60 * 60 * 1000');
    expect(assistant).toContain('onFeedback();');
  });

  it('conserva los anclajes de layout que evitan regresiones visibles en Combat y Home', () => {
    const battle = read('CombatBattleView.jsx');
    const menu = read('Menu.jsx');
    expect(battle).toContain('game-side-music combat-side-music');
    expect(battle).toContain('<MusicPlayer initiallyCollapsed />');
    expect(battle).not.toContain('className="game-music-rail"');
    expect(battle).not.toContain('<MusicPlayer forceExpanded />');
    expect(menu).toContain('className="home-today-missions"');
    expect(menu).toContain('className="home-today-streaks"');
    expect(menu).toContain('Racha <b>{today.streak || 0}</b>');
    expect(menu).toContain('Mejor <b>{today.bestStreak || 0}</b>');
    expect(menu).not.toContain('className="home-today-stats"');
    expect(productHardeningCss).toContain('--combat-board-size: min(608px, calc(100dvh - 170px), calc(100vw - 420px))');
    expect(productHardeningCss).toContain('height: var(--combat-board-shell-height)');
    expect(productHardeningCss).toContain('--combat-board-size: min(608px, calc(100vw - 24px))');
  });
});
