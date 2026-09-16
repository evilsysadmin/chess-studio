import { describe, expect, it } from 'vitest';
import { chroniclesValidateMapDefinition } from './chroniclesMapCatalog.js';

function mapWithActivation(activation) {
  return {
    id: `activation-${activation}`,
    grid: [
      '#####',
      '#P..#',
      '#...#',
      '#####',
    ],
    partyStart: { x: 1, y: 1, direction: 1 },
    initialFlags: { awake: false },
    enemies: [{
      id: 'legacy-enemy',
      name: 'legacy enemy',
      x: 2,
      y: 1,
      hpKey: 'legacyHp',
      maxHp: 1,
      retaliation: 0,
      activation,
      activationWhen: [{ key: 'awake', equals: true }],
      ai: { movement: 'hold', attackReach: 1 },
    }],
    triggers: [],
    interactables: [],
    treasures: [],
    traps: [],
    exits: [],
    initialJournal: { id: 'entry', title: 'Entry', body: 'Entry', sigil: 'I' },
    introMessage: 'Entry',
  };
}

describe('Chronicles activation validation', () => {
  it.each(['sigil', 'jailer-down'])('rejects the retired %s activation alias', (activation) => {
    expect(() => chroniclesValidateMapDefinition(mapWithActivation(activation)))
      .toThrow(`uses unsupported activation ${activation}`);
  });

  it('still accepts the explicit always fallback', () => {
    expect(chroniclesValidateMapDefinition(mapWithActivation('always')).enemies[0].activation)
      .toBe('always');
  });
});
