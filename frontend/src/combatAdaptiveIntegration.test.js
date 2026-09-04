import { beforeEach, describe, expect, it } from 'vitest';
import { saveCombatBattle } from './combatHistory.js';
import { availableCampaignNodes, campaignDifficulty, campaignIntelBriefing, startCampaign } from './combatCampaign.js';
import { difficultyForFloor } from './roguelikeRun.js';

function record(outcome, id) {
  saveCombatBattle({ id, date: `2026-09-04T10:00:${id.padStart(2, '0')}Z`, outcome, variant: 'roguelike', log: [] });
}

beforeEach(() => localStorage.clear());

describe('Combat Chess adaptive relief integration', () => {
  it('rebaja Campaña tras derrotas reales y mantiene la Intel coherente', () => {
    const run = startCampaign('adaptive-campaign');
    const node = availableCampaignNodes(run)[0];
    const original = campaignDifficulty(run, node);

    record('loss', '01');
    expect(campaignDifficulty(run, node)).toBe(Math.max(5, original - 5));

    record('loss', '02');
    const adapted = Math.max(5, original - 9);
    expect(campaignDifficulty(run, node)).toBe(adapted);

    const intelState = { ...run, selectedNodeId: node.id, intelligenceByNode: { [node.id]: 2 } };
    expect(campaignIntelBriefing(intelState, node).exactDifficulty).toBe(adapted);
  });

  it('aplica la misma memoria corta a Torre', () => {
    expect(difficultyForFloor(5)).toBe(40);
    record('loss', '01');
    expect(difficultyForFloor(5)).toBe(35);
    record('loss', '02');
    expect(difficultyForFloor(5)).toBe(31);
  });

  it('retira el alivio tras dos victorias consecutivas', () => {
    record('loss', '01');
    record('loss', '02');
    expect(difficultyForFloor(6)).toBeLessThan(44);

    record('win', '03');
    record('win', '04');
    expect(difficultyForFloor(6)).toBe(44);
  });
});
