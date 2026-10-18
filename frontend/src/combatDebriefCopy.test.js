import { describe, expect, it } from 'vitest';
import { combatDebriefOutcomeLabel } from './combatDebriefCopy.js';

describe('Combat Chess · resultado comprensible', () => {
  it('muestra resultados de campaña en español sin alterar el código persistido', () => {
    expect(combatDebriefOutcomeLabel('win')).toBe('VICTORIA');
    expect(combatDebriefOutcomeLabel('loss')).toBe('DERROTA');
    expect(combatDebriefOutcomeLabel('retired')).toBe('RETIRADA');
    expect(combatDebriefOutcomeLabel('draw')).toBe('TABLAS');
    expect(combatDebriefOutcomeLabel(null)).toBe('RESULTADO');
  });
});
