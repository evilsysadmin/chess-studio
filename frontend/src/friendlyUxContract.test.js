// STATIC CONTRACT: protege la divulgación progresiva global; la interacción real vive en E2E.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(`./components/${name}`, import.meta.url), 'utf8');

const menu = read('Menu.jsx');
const quick = read('QuickMatchModal.jsx');
const tournament = read('TournamentScreen.jsx');
const puzzle = read('PuzzleScreen.jsx');
const insights = read('InsightsScreen.jsx');
const spectator = read('SpectatorScreen.jsx');
const mirror = read('MirrorModeModal.jsx');
const lab = read('LabScreen.jsx');
const history = read('HistoryScreen.jsx');
const career = read('CareerScreen.jsx');
const replay = read('ReplayScreen.jsx');
const status = read('PlayerStatusBar.jsx');
const homeNudge = read('HomePlayNudge.jsx');
const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');

describe('STATIC CONTRACT · UX friendly-by-default', () => {
  it('home prioriza seis accesos y pliega los modos/herramientas secundarios', () => {
    expect(menu).toContain('home-primary-grid');
    expect(menu).toContain('<summary>Más modos de juego</summary>');
    expect(menu).toContain('<summary>Más aprendizaje y herramientas</summary>');
    expect(menu).toContain('Partida rápida');
    expect(menu).toContain('Así juegas');
    expect(menu).toContain('Practicar tus errores');
    expect(menu.indexOf('Así juegas')).toBeLessThan(menu.indexOf('Practicar tus errores'));
    expect(menu.indexOf('Practicar tus errores')).toBeLessThan(menu.indexOf('<h3>Práctica</h3>'));
    expect(menu).toContain('Admin Panel');
    expect(menu).toContain('home-admin-card');
    expect(menu).toContain('Dar feedback');
  });

  it('home convierte la partida guardada en una tarjeta de continuación visible', () => {
    expect(menu).toContain('home-continue-card');
    expect(menu).toContain('Partida en curso');
    expect(menu).toContain('Continuar partida');
    expect(menu).toContain('Volver al tablero');
  });

  it('home compacta el estado global en vez de mostrar tres tarjetas de métricas completas', () => {
    expect(app).toContain("compact={view === 'menu'}");
    expect(status).toContain('player-status-bar-compact');
    expect(status).toContain('status-chip-compact');
  });

  it('home invita a jugar tras inactividad sin secuestrar la interfaz', () => {
    expect(menu).toContain('<HomePlayNudge');
    expect(menu).toContain('enabled={!hasOpenOverlay && !loggingOut && !hasSavedGame}');
    expect(homeNudge).toContain('HOME_PLAY_NUDGE_IDLE_MS');
    expect(homeNudge).toContain('role="status"');
    expect(homeNudge).not.toContain('aria-modal="true"');
    expect(homeNudge).toContain('if (!enabled && visible) setVisible(false)');
    expect(homeNudge).toContain('Jugar una rápida');
    expect(homeNudge).toContain('Continuar partida');
  });

  it('partida rápida permite jugar con defaults y deja ajustes/reglas especiales detrás de details', () => {
    expect(quick).toContain('Elige dificultad y juega');
    expect(quick).toContain('Empezar partida');
    expect(quick).toContain('className="friendly-disclosure quick-match-settings"');
    expect(quick).toContain('<summary>Reglas especiales</summary>');
  });

  it('torneo pone el siguiente rival y jugar primero; progreso/recompensas quedan secundarios', () => {
    expect(tournament).toContain('Siguiente rival');
    expect(tournament).toContain('Jugar siguiente partida');
    expect(tournament).toContain('<summary>Ver progreso, recompensas y opciones</summary>');
    expect(tournament).toContain('<summary>Opciones del torneo</summary>');
  });

  it('puzzles mantiene objetivo visible y esconde métricas/calendario', () => {
    expect(puzzle).toContain('puzzle-friendly-info');
    expect(puzzle).toContain('<summary>Progreso y detalles</summary>');
    expect(puzzle).toContain('Últimos 28 días');
  });

  it('Así juegas deja coaching visible y pliega sarcasmo y analítica detallada', () => {
    expect(insights).toContain('Qué entrenaría ahora');
    expect(insights).toContain('<summary>Ver lectura sarcástica del expediente</summary>');
    expect(insights).toContain('<summary>Ver estadísticas y diagnóstico completo</summary>');
  });

  it('modos secundarios usan CTA inmediato y configuración opcional', () => {
    expect(spectator).toContain('Pulsa empezar y mira');
    expect(spectator).toContain('className="friendly-disclosure spectator-settings"');
    expect(mirror).toContain('Jugar contra mi fantasma');
    expect(mirror).toContain('<summary>Cómo se ha construido</summary>');
    expect(lab).toContain('Prepara una posición y juega');
    expect(lab).toContain('<summary>Detalles técnicos de la posición</summary>');
  });

  it('historial es lectura primero y deja borrar detrás de opciones', () => {
    expect(history).toContain('Resultado, modo y fecha quedan a simple vista');
    expect(history).toContain('<summary>Opciones del historial</summary>');
  });

  it('cementerio queda como archivo/autopsia y el entrenamiento desde FEN vive en Replay', () => {
    expect(career).toContain('Archivo selectivo de derrotas especialmente memorables');
    expect(career).not.toContain('¿Salvar este cadáver?');
    expect(career).not.toContain('rescueFen(');
    expect(replay).toContain('Jugar desde aquí contra la CPU');
  });
  it('los modales comunes exponen semántica de diálogo accesible', () => {
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

  it('los controles iconográficos del reproductor tienen nombre accesible', () => {
    const music = read('MusicPlayer.jsx');
    expect(music).toContain('aria-label="Marcar pista como favorita"');
    expect(music).toContain('aria-label="Excluir pista de la radio"');
    expect(music).toContain('music-deck-collapsed');
    expect(music).toContain('aria-label="Abrir reproductor de música"');
    expect(music).toContain('aria-label="Plegar reproductor de música"');
  });

  it('las pantallas pesadas y el audio se cargan bajo demanda', () => {
    expect(app).toContain("const GameScreen = React.lazy(() => import('./components/GameScreen.jsx'));");
    expect(app).toContain("const RoguelikeScreen = React.lazy(() => import('./components/RoguelikeScreen.jsx'));");
    expect(app).toContain("const AdminScreen = React.lazy(() => import('./components/AdminScreen.jsx'));");
    expect(app).toContain("const InsightsScreen = React.lazy(() => import('./components/InsightsScreen.jsx'));");
    expect(app).toContain("const MusicPlayer = React.lazy(() => import('./components/MusicPlayer.jsx'));");
    expect(app).toContain("import('./sound.js').then((module) => {");
    expect(app).not.toContain("import { startAmbientMusic, stopAmbientMusic } from './sound.js';");
  });

});
