import { describe, it, expect } from 'vitest';
import { combatPreparationChoice } from './combatPreparationChoice.js';

describe('Combat Chess · siguiente acción comprensible', () => {
  it('prioriza bajas incluso con formación completa y confirmada', () => {
    expect(combatPreparationChoice({ deadCount: 2, ready: true, confirmed: true })).toMatchObject({
      action: 'resolve', label: 'RESOLVER BAJAS →',
    });
  });
  it('avisa de que la preparación rápida REORGANIZA todo, no solo rellena huecos', () => {
    const choice = combatPreparationChoice({ deadCount: 0, ready: false, missing: 3 });
    expect(choice.action).toBe('quick');
    expect(choice.help).toContain('3 puestos libres');
    expect(choice.help).toContain('reorganiza todo el ejército');
  });
  it('permite iniciar directamente si la formación está lista y confirmada', () => {
    expect(combatPreparationChoice({ ready: true, confirmed: true }).action).toBe('start');
    expect(combatPreparationChoice({ ready: true, confirmed: false }).action).toBe('quick');
    expect(combatPreparationChoice({ ready: true }).label).toContain('ENTRAR EN COMBATE');
  });
});
