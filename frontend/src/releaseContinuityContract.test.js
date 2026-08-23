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

  it('el snapshot activo se borra al limpiar el estado de identidad', () => {
    const keys = fs.readFileSync(path.resolve(process.cwd(), 'src/profileKeys.js'), 'utf8');
    expect(keys).toContain("'chess-study-active-game-session-v1'");
  });
});
