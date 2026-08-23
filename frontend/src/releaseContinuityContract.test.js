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

  it('App rehidrata partidas normales y de torneo desde la sesión activa', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(app).toContain('loadActiveGameSession()?.route');
    expect(app).toContain("saved.route === 'tournamentGame'");
    expect(app).toContain('restoreActiveSession(saved)');
    expect(app).toContain('Restaurando partida en curso…');
  });


  it('ErrorBoundary prioriza recuperar una partida activa antes de volver al menú', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const boundary = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ErrorBoundary.jsx'), 'utf8');
    expect(app).toContain('onRecover={recoverSessionFromBoundary}');
    expect(app).toContain("return restoreActiveSession(saved)");
    expect(app).toContain("route: 'tournamentGame', gameId: tournamentGame.id");
    expect(app).toContain("route: 'game'");
    expect(app).toContain("currentViewRef.current === 'combat' || currentViewRef.current === 'roguelike'");
    expect(boundary).toContain('Recuperar partida');
    expect(boundary).toContain('Volver al menú');
    expect(boundary).toContain('La partida sigue guardada');
  });

  it('auto-reconcilia con backend después de offline → online sin abandonar el tablero', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(app).toContain("import { fetchReconnectGame, reconnectTarget } from './gameReconnect.js'");
    expect(app).toContain("window.addEventListener('offline', handleOffline)");
    expect(app).toContain("window.addEventListener('online', handleOnline)");
    expect(app).toContain('setGameSaveState(SAVE_STATUS.SAVING)');
    expect(app).toContain('const result = await fetchReconnectGame(target.gameId, api.getGame)');
    expect(app).toContain("if (target.route === 'tournamentGame') setTournamentGame(result.game)");
    expect(app).toContain('else setGame(result.game)');
    expect(app).toContain('La última posición confirmada sigue intacta');
  });

  it('la partida activa expone estado real de guardado y conexión', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    const gameScreen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/GameScreen.jsx'), 'utf8');
    const badge = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SaveStatusBadge.jsx'), 'utf8');
    expect(app).toContain('<SaveStatusBadge state={gameSaveState} />');
    expect(app).toContain('onPersistenceState={setGameSaveState}');
    expect(app).toContain('if (persisted) setGameSaveState(SAVE_STATUS.SAVED)');
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
