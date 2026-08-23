// STATIC CONTRACT: inspecciona wiring deliberadamente; no sustituye tests de comportamiento.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('wiring de continuidad entre releases', () => {
  it('instala la recuperación de chunks antes de montar React', () => {
    const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.jsx'), 'utf8');
    expect(main).toContain("import { installReleaseContinuity } from './releaseContinuity.js'");
    expect(main).toContain('installReleaseContinuity();');
  });

  it('main monta un fusible exterior por encima de App para errores de inicialización', () => {
    const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.jsx'), 'utf8');
    const rootBoundary = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AppRootErrorBoundary.jsx'), 'utf8');
    expect(main).toContain("import AppRootErrorBoundary from './components/AppRootErrorBoundary.jsx'");
    expect(main).toContain('<AppRootErrorBoundary>');
    expect(main).toContain('<App />');
    expect(rootBoundary).toContain('Recargar y recuperar partida');
    expect(rootBoundary).toContain('loadActiveGameSession()');
  });

  it('App delega la rehidratación normal/torneo a un restaurador de sesión dedicado', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const restoreHook = fs.readFileSync(path.resolve(process.cwd(), 'src/useActiveSessionRestore.js'), 'utf8');
    expect(app).toContain('loadActiveGameSession()?.route');
    expect(app).toContain('useActiveSessionRestore({');
    expect(app).toContain('Restaurando partida en curso…');
    expect(restoreHook).toContain("saved.route === 'tournamentGame'");
    expect(restoreHook).toContain('api.getGame(saved.gameId)');
    expect(restoreHook).toContain('restoreActiveSession(saved)');
  });


  it('ErrorBoundary prioriza recuperar una partida activa antes de volver al menú', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const restoreHook = fs.readFileSync(path.resolve(process.cwd(), 'src/useActiveSessionRestore.js'), 'utf8');
    const boundary = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ErrorBoundary.jsx'), 'utf8');
    expect(app).toContain('onRecover={recoverSessionFromBoundary}');
    expect(restoreHook).toContain("route: 'tournamentGame', gameId: tournamentGame.id");
    expect(restoreHook).toContain("route: 'game'");
    expect(restoreHook).toContain("currentView === 'combat' || currentView === 'roguelike'");
    expect(restoreHook).toContain("if (candidate.type === 'session') return restoreActiveSession(candidate.session)");
    expect(boundary).toContain('Recuperar partida');
    expect(boundary).toContain('Volver al menú');
    expect(boundary).toContain('La partida sigue guardada');
  });

  it('auto-reconcilia con backend después de offline → online sin abandonar el tablero', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const reconnectHook = fs.readFileSync(path.resolve(process.cwd(), 'src/useGameReconnect.js'), 'utf8');
    expect(app).toContain('useGameReconnect({');
    expect(app).toContain('getGame: api.getGame');
    expect(reconnectHook).toContain("window.addEventListener('offline', handleOffline)");
    expect(reconnectHook).toContain("window.addEventListener('online', handleOnline)");
    expect(reconnectHook).toContain('SAVE_STATUS.SAVING');
    expect(reconnectHook).toContain('fetchReconnectGame(target.gameId');
    expect(reconnectHook).toContain("target.route === 'tournamentGame'");
    expect(reconnectHook).toContain('onGame?.(result.game)');
    expect(reconnectHook).toContain('La última posición confirmada sigue intacta');
  });

  it('la partida activa expone estado real de guardado y conexión', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const gameScreen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/GameScreen.jsx'), 'utf8');
    const badge = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SaveStatusBadge.jsx'), 'utf8');
    expect(app).toContain('<SaveStatusBadge state={gameSaveState} />');
    expect(app).toContain('onPersistenceState={setGameSaveState}');
    const persistenceHook = fs.readFileSync(path.resolve(process.cwd(), 'src/useActiveGameSessionPersistence.js'), 'utf8');
    expect(app).toContain('useActiveGameSessionPersistence({');
    expect(persistenceHook).toContain('if (persisted) onPersistenceState?.(SAVE_STATUS.SAVED)');
    expect(gameScreen).toContain("onPersistenceState?.('saving')");
    expect(gameScreen).toContain("onPersistenceState?.('error')");
    expect(badge).toContain("window.addEventListener('offline', update)");
    expect(badge).toContain('aria-live="polite"');
    expect(app).toContain('combatBattleUiActive');
    expect(app).toContain('onPersistenceState={setGameSaveState}');
    expect(gameScreen).toContain("onPersistenceState?.('saving')");
  });

  it('el snapshot activo se borra al limpiar el estado de identidad', () => {
    const keys = fs.readFileSync(path.resolve(process.cwd(), 'src/profileKeys.js'), 'utf8');
    expect(keys).toContain("'chess-study-active-game-session-v1'");
  });
});
