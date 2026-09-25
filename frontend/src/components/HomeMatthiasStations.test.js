import { describe, expect, it } from 'vitest';
import { matthiasTimeScene } from '../matthiasTime.js';
import { matthiasHomePlacement, matthiasHomeStation } from './HomeMatthiasStations.js';

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

  it('asigna las 24 rutinas horarias a un soporte físico', () => {
    const allowedSupports = new Set(['chair-seat', 'lounge-seat', 'foreground-rug']);
    for (let hour = 0; hour < 24; hour += 1) {
      const scene = matthiasTimeScene(hour);
      const placement = matthiasHomePlacement(`time-${scene.key}`);
      expect(allowedSupports.has(placement.support), `hour ${hour} · ${scene.key}`).toBe(true);
    }
  });

  it('vuelve a la alfombra al hablar o vigilar la sala', () => {
    expect(matthiasHomePlacement('base')).toEqual({
      station:'watch-post',
      support:'foreground-rug',
    });
    expect(matthiasHomePlacement('time-late-sleep', true)).toEqual({
      station:'watch-post',
      support:'foreground-rug',
    });
  });
});
