import { describe, expect, it } from 'vitest';
import { activityForView, activityLabel } from './presenceActivity.js';

describe('actividad coarse-grained', () => {
  it('mapea vistas a estados no sensibles', () => {
    expect(activityForView('roguelike')).toBe('combat_campaign');
    expect(activityForView('tournamentGame')).toBe('tournament');
    expect(activityForView('puzzle', { puzzleSource: 'daily' })).toBe('daily_challenge');
    expect(activityLabel('worst_move_analysis')).toBe('Calculando peor jugada');
  });
});
