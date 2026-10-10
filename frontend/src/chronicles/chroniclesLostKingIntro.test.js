import { describe, expect, it } from 'vitest';
import { createChroniclesState, chroniclesReduce } from '../chroniclesOfMatthias.js';
import {
  chroniclesAdvanceLostKingIntro,
  chroniclesInitializeLostKingIntro,
} from './chroniclesLostKingIntro.js';
import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointPayload,
} from './chroniclesRunCheckpoint.js';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';

function newLetterRun() {
  return chroniclesInitializeLostKingIntro(createChroniclesState('swordhaven-square'), { fresh: true });
}

describe('Chronicles · lost king playable prologue', () => {
  it('starts only for fresh Swordhaven first-person runs, with a real letter and active objective', () => {
    const fresh = newLetterRun();
    expect(fresh.quests['lost-king-prologue']).toMatchObject({ status: 'active', objective: expect.stringContaining('Cripta') });
    expect(fresh.inventory['sealed-lady-letter'].quantity).toBe(1);
    expect(chroniclesInitializeLostKingIntro(fresh, { fresh: true })).toBe(fresh);
    const restored = createChroniclesState('swordhaven-square');
    expect(chroniclesInitializeLostKingIntro(restored)).toBe(restored);
    expect(chroniclesInitializeLostKingIntro(createChroniclesState('crypt-eight-squares'), { fresh: true }).quests).toBeUndefined();
  });

  it('advances only when the actual crypt sigil awakens and reports only on returning', () => {
    const fresh = newLetterRun();
    const crypt = chroniclesApplyContentEffects(fresh, [{ type: 'transition-map', mapId: 'crypt-eight-squares' }]);
    expect(crypt.quests['lost-king-prologue'].objective).toContain('Cripta');
    const adjacent = { ...crypt, x: 3, y: 3, direction: 2, enemyPositions: {} };
    const activated = chroniclesReduce(adjacent, 'forward');
    expect(activated.sigilAwake).toBe(true);
    expect(activated.quests['lost-king-prologue'].objective).toContain('Regresa');
    expect(activated.consumedContentIds).toContain('chronicles:lost-king:crypt-seal-investigated');
    const returned = chroniclesReduce({ ...activated, x: 1, y: 5, initiative: null }, 'interact');
    expect(returned.mapId).toBe('swordhaven-square');
    expect(returned.quests['lost-king-prologue'].objective).toContain('Galería');
    expect(returned.consumedContentIds.filter((id) => id.endsWith('crypt-seal-reported'))).toHaveLength(1);
    expect(chroniclesAdvanceLostKingIntro(activated, returned)).toBe(returned);
    expect(returned.inventory['sealed-lady-letter'].quantity).toBe(1);
  });

  it('persists each real milestone via the existing CAS checkpoint, not new storage', () => {
    const fresh = newLetterRun();
    const payload = chroniclesRunCheckpointPayload(fresh, 0);
    expect(payload.quests['lost-king-prologue'].status).toBe('active');
    expect(payload.consumedContentIds).toContain('chronicles:lost-king:commission-received');
    const resumed = chroniclesApplyRunCheckpoint(createChroniclesState('swordhaven-square'), {
      ...payload, worldFlags: payload.worldFlags, worldVersion: 1, status: 'active',
    });
    expect(resumed.quests['lost-king-prologue'].objective).toContain('Cripta');
    expect(resumed.inventory['sealed-lady-letter'].quantity).toBe(1);
    expect(chroniclesInitializeLostKingIntro(resumed, { fresh: true })).toBe(resumed);
  });
});
