import { describe, expect, it, vi } from 'vitest';
import { dailyMissionActionProps } from './homeToday.js';

describe('Home daily actions', () => {
  it('cada misión diaria expone una acción directa al slot concreto', () => {
    const onDailyChallenge = vi.fn();
    const action = dailyMissionActionProps({ id: 'precision', label: 'Precisión', solved: false }, onDailyChallenge);
    expect(action.ariaLabel).toBe('Jugar desafío Precisión');
    action.onClick();
    expect(onDailyChallenge).toHaveBeenCalledWith('precision');
  });

  it('una misión resuelta se presenta como revisión, no como etiqueta decorativa', () => {
    const action = dailyMissionActionProps({ id: 'mate', label: 'Remate', solved: true }, () => {});
    expect(action.ariaLabel).toBe('Revisar desafío Remate');
  });
});
