import { describe, expect, it } from 'vitest';
import { gameStatusView } from './gameStatusView.js';

describe('gameStatusView', () => {
  it('presenta jaque sin inventar un resultado terminal', () => {
    expect(gameStatusView({ status: 'check', turn: 'b', humanColor: 'w' })).toMatchObject({
      statusLabel: 'Jaque', statusText: 'Jaque', statusClass: 'success', finalOutcome: null,
    });
  });

  it('mate humano produce victoria y mate recibido produce derrota', () => {
    expect(gameStatusView({ status: 'checkmate', turn: 'b', humanColor: 'w' })).toMatchObject({
      statusText: 'Jaque mate', finalOutcome: 'win', statusClass: 'danger',
    });
    expect(gameStatusView({ status: 'checkmate', turn: 'w', humanColor: 'w' })).toMatchObject({
      statusText: 'Jaque mate', finalOutcome: 'loss', statusClass: 'danger',
    });
  });

  it('tablas terminales comparten la semántica común de resultado', () => {
    expect(gameStatusView({ status: 'stalemate', turn: 'w', humanColor: 'w' }).finalOutcome).toBe('draw');
    expect(gameStatusView({ status: 'draw', turn: 'b', humanColor: 'w' }).finalOutcome).toBe('draw');
    expect(gameStatusView({ status: 'repetition', turn: 'w', humanColor: 'w' }).finalOutcome).toBe('draw');
  });

  it('el resultado terminal prevalece sobre un busy rezagado', () => {
    expect(gameStatusView({ status: 'checkmate', turn: 'w', humanColor: 'w', busy: true }).statusText).toBe('Jaque mate');
    expect(gameStatusView({ status: 'stalemate', turn: 'b', humanColor: 'w', busy: true }).statusText).toBe('Tablas por ahogado');
    expect(gameStatusView({ status: 'check', turn: 'b', humanColor: 'w', busy: true }).statusText).toBe('La CPU está pensando…');
  });

  it('avisa del rollback incluso en modo Zen sin ocultar los resultados terminales', () => {
    const banner = 'Jugada sin confirmar · posición restaurada';
    expect(gameStatusView({ status: 'playing', turn: 'w', humanColor: 'w', turnBanner: banner }).statusText).toBe(banner);
    expect(gameStatusView({ status: 'playing', turn: 'w', humanColor: 'w', turnBanner: banner, zenMode: true }).statusText).toBe(banner);
    expect(gameStatusView({ status: 'checkmate', turn: 'b', humanColor: 'w', turnBanner: banner }).statusText).toBe('Jaque mate');
    expect(gameStatusView({ status: 'playing', turn: 'w', humanColor: 'w', busy: true, turnBanner: 'La CPU jugó e5' }).statusText).toBe('La CPU está pensando…');
  });

  it('distingue confirmación humana de cálculo CPU en 2D, 3D y accesibilidad', () => {
    const pending = { status: 'playing', turn: 'w', humanColor: 'w', busy: true, pendingMove: true };
    expect(gameStatusView(pending).statusText).toBe('Confirmando jugada…');
    expect(gameStatusView({ ...pending, zenMode: true }).statusText).toBe('Confirmando jugada…');
    expect(gameStatusView({ ...pending, pendingMove: false }).statusText).toBe('La CPU está pensando…');
    expect(gameStatusView({ ...pending, busy: false }).statusText).toBe('Tu turno');
    expect(gameStatusView({ ...pending, turnBanner: 'Reintentando conexión…' }).statusText).toBe('Reintentando conexión…');
    expect(gameStatusView({ ...pending, status: 'checkmate' }).statusText).toBe('Jaque mate');
    expect(gameStatusView({ ...pending, flagFallen: 'w' }).statusText).toContain('Se acabó el tiempo');
    expect(gameStatusView({ ...pending, forcedOutcome: 'loss' }).statusText).toContain('Sudden Death');
  });

  it('distingue reintento de red real de la espera normal y del resultado final', () => {
    const retry = { status: 'playing', turn: 'w', humanColor: 'w', busy: true, turnBanner: 'Reintentando conexión…' };
    expect(gameStatusView(retry).statusText).toBe('Reintentando conexión…');
    expect(gameStatusView({ ...retry, zenMode: true }).statusText).toBe('Reintentando conexión…');
    expect(gameStatusView({ ...retry, busy: false }).statusText).toBe('Tu turno');
    expect(gameStatusView({ ...retry, turnBanner: null }).statusText).toBe('La CPU está pensando…');
    expect(gameStatusView({ ...retry, status: 'checkmate' }).statusText).toBe('Jaque mate');
    expect(gameStatusView({ ...retry, flagFallen: 'w' }).statusText).toContain('Se acabó el tiempo');
  });

  it('busy y bandera tienen prioridad sobre banners normales', () => {
    expect(gameStatusView({ status: 'check', turn: 'b', humanColor: 'w', busy: true }).statusText).toBe('La CPU está pensando…');
    expect(gameStatusView({ status: 'playing', turn: 'w', humanColor: 'w', flagFallen: 'b', flagFinalOutcome: 'win' }).statusText).toContain('negras');
    expect(gameStatusView({ status: 'playing', turn: 'w', humanColor: 'w', flagFallen: 'b', flagFinalOutcome: 'win' }).finalOutcome).toBe('win');
  });
});
