import { describe, expect, it } from 'vitest';
import { gameStatusView } from './gameStatusView.js';

describe('gameStatusView', () => {
  it('presenta jaque sin convertirlo en fin de partida', () => {
    expect(gameStatusView({ status: 'check', turn: 'b', humanColor: 'w' })).toMatchObject({
      statusLabel: 'Jaque', statusText: 'Jaque', statusClass: 'success', finalOutcome: 'draw',
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

  it('busy y bandera tienen prioridad sobre banners normales', () => {
    expect(gameStatusView({ status: 'check', turn: 'b', humanColor: 'w', busy: true }).statusText).toBe('La CPU está pensando…');
    expect(gameStatusView({ status: 'playing', turn: 'w', humanColor: 'w', flagFallen: 'b', flagFinalOutcome: 'win' }).statusText).toContain('negras');
  });
});
