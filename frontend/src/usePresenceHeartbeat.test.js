import { describe, expect, it } from 'vitest';
import { activityForView } from './usePresenceHeartbeat.js';

describe('presence heartbeat mapping', () => {
  it('traduce vistas a actividad gruesa sin exponer contenido de partida', () => {
    expect(activityForView('game')).toBe('Partida');
    expect(activityForView('tournamentGame')).toBe('Torneo');
    expect(activityForView('roguelike')).toBe('Combat Chess');
    expect(activityForView('insights')).toBe('Así juegas');
    expect(activityForView('no-existe')).toBe('Navegando');
  });
});
