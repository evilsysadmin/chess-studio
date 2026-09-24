import { describe, expect, it } from 'vitest';
import { matthiasHomeStation } from './HomeMatthiasStations.js';

describe('Home Matthias stations', () => {
  it('ancla cada rutina junto al mueble que explica la actividad', () => {
    expect(matthiasHomeStation('time-chess-inception')).toBe('chess-chair');
    expect(matthiasHomeStation('moment-solo-board-inception')).toBe('chess-chair');
    expect(matthiasHomeStation('time-morning-coffee')).toBe('refreshment-table');
    expect(matthiasHomeStation('time-lunch-bocata')).toBe('dining-table');
    expect(matthiasHomeStation('time-strategy-book')).toBe('library-chair');
    expect(matthiasHomeStation('moment-loss-dossier')).toBe('writing-desk');
    expect(matthiasHomeStation('time-late-sleep')).toBe('rest');
    expect(matthiasHomeStation('base')).toBe('watch-post');
  });
});
