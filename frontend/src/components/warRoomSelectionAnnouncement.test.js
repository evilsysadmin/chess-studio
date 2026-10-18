import { describe, expect, it } from 'vitest';
import { warRoomSelectionAnnouncement } from './warRoomSelectionAnnouncement.js';

describe('War Room · destinos legales accesibles', () => {
  it('anuncia selección y casillas derivadas de los movimientos reales', () => {
    expect(warRoomSelectionAnnouncement({
      selectedSquare: 'e2',
      legalTargets: [{ to: 'e3', san: 'e3' }, { to: 'e4', san: 'e4' }],
    })).toBe('Casilla e2 seleccionada. 2 destinos legales: e3, e4.');
  });

  it('elimina destinos duplicados en promociones y no anuncia SAN', () => {
    expect(warRoomSelectionAnnouncement({
      selectedSquare: 'g7',
      legalTargets: ['Q', 'R', 'B', 'N'].map((promotion) => ({ to: 'g8', san: `g8=${promotion}` })),
    })).toBe('Casilla g7 seleccionada. 1 destino legal: g8.');
  });

  it('mantiene un límite legible para piezas con muchos destinos', () => {
    const targets = Array.from({ length: 10 }, (_, index) => ({ to: `${'abcdefgh'[index % 8]}${index < 8 ? '4' : '5'}` }));
    const text = warRoomSelectionAnnouncement({ selectedSquare: 'd4', legalTargets: targets });
    expect(text).toContain('10 destinos legales:');
    expect(text).toContain('y 2 más');
    expect(text).not.toContain('a5');
  });

  it('anuncia piezas sin movimientos y nunca inventa legalidad', () => {
    expect(warRoomSelectionAnnouncement({ selectedSquare: 'e2' })).toBe('Casilla e2 seleccionada. Sin destinos legales.');
    expect(warRoomSelectionAnnouncement({ selectedSquare: 'e2', legalTargets: [{ to: 'z9' }, null] })).toContain('Sin destinos legales');
  });

  it('permanece silencioso sin selección, en final de partida o Zen', () => {
    const legalTargets = [{ to: 'e4' }];
    expect(warRoomSelectionAnnouncement({ selectedSquare: null, legalTargets })).toBe('');
    expect(warRoomSelectionAnnouncement({ selectedSquare: 'e2', legalTargets, disabled: true })).toBe('');
  });
});
