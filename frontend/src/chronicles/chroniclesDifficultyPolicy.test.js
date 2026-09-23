import { describe, expect, it } from 'vitest';
import {
  createChroniclesProgression,
  grantChroniclesXp,
} from '../chroniclesOfMatthiasProgression.js';
import {
  chroniclesDeployedPartyLevel,
  chroniclesDifficultyBand,
  chroniclesRunDepth,
} from './chroniclesDifficultyPolicy.js';

function leveledParty(level) {
  let progression = createChroniclesProgression();
  const thresholds = { 1: 0, 2: 40, 3: 120, 4: 240, 5: 400, 6: 600, 7: 840, 8: 1120 };
  for (const memberId of ['matthias', 'rook', 'bishop', 'knight']) {
    progression = grantChroniclesXp(
      progression,
      memberId,
      thresholds[level] || 0,
      `difficulty:${memberId}:${level}`,
    ).progression;
  }
  return progression;
}

describe('Chronicles difficulty/progression policy', () => {
  it('measures only the actually deployed party', () => {
    let progression = createChroniclesProgression();
    progression = grantChroniclesXp(progression, 'matthias', 600, 'matthias-veteran').progression;

    expect(chroniclesDeployedPartyLevel(progression, ['matthias'])).toBe(6);
    expect(chroniclesDeployedPartyLevel(progression, ['rook', 'bishop', 'knight'])).toBe(1);
  });

  it('raises threat with depth without mirroring player levels one-for-one', () => {
    const progression = leveledParty(6);
    const shallow = chroniclesDifficultyBand({ progression, depth: 0 });
    const deep = chroniclesDifficultyBand({ progression, depth: 6 });

    expect(shallow.partyLevel).toBe(6);
    expect(shallow.targetLevel).toBe(3);
    expect(deep.targetLevel).toBe(6);
    expect(deep.maxLevel).toBeLessThanOrEqual(deep.partyLevel + 1);
  });

  it('caps depth pressure and never creates runaway enemy levels', () => {
    const progression = leveledParty(2);
    const absurdDepth = chroniclesDifficultyBand({ progression, depth: 999 });

    expect(absurdDepth.depthPressure).toBe(6);
    expect(absurdDepth.targetLevel).toBeLessThanOrEqual(3);
    expect(absurdDepth.maxLevel).toBeLessThanOrEqual(3);
  });

  it('derives run depth from the authoritative route order', () => {
    const run = {
      currentMapId: 'archive',
      areas: [
        { mapId: 'crypt' },
        { mapId: 'gallery' },
        { mapId: 'archive' },
        { mapId: 'foundry' },
      ],
    };
    expect(chroniclesRunDepth(run)).toBe(2);
    expect(chroniclesRunDepth(run, 'foundry')).toBe(3);
    expect(chroniclesRunDepth(run, 'unknown')).toBe(0);
  });
});
