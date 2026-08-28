import { beforeEach, describe, expect, it } from 'vitest';
import {
  availableCampaignNodes,
  campaignEventOptions,
  campaignRewardOptions,
  chooseCampaignReward,
  markCampaignBattleStarted,
  markCampaignBattleWon,
  markCampaignBriefingAccepted,
  purchaseCampaignIntel,
  resolveCampaignEvent,
  selectCampaignNode,
  startCampaign,
} from './combatCampaign.js';
import { assertCampaignInvariant } from './campaignStateMachine.js';

beforeEach(() => localStorage.clear());

function advanceCampaign(state, step) {
  if (state.phase === 'map') {
    const available = availableCampaignNodes(state);
    expect(available.length).toBeGreaterThan(0);
    return selectCampaignNode(state, available[step % available.length].id);
  }
  if (state.phase === 'briefing') {
    const withIntel = step % 3 === 0 ? purchaseCampaignIntel(state) : state;
    return markCampaignBriefingAccepted(withIntel);
  }
  if (state.phase === 'battle') return markCampaignBattleStarted(state);
  if (state.phase === 'fighting') return markCampaignBattleWon(state);
  if (state.phase === 'reward' || state.phase === 'camp') {
    const options = campaignRewardOptions(state);
    expect(options.length).toBeGreaterThan(0);
    return chooseCampaignReward(state, options[step % options.length].id);
  }
  if (state.phase === 'event') {
    const options = campaignEventOptions(state);
    expect(options.length).toBeGreaterThan(0);
    return resolveCampaignEvent(state, options[step % options.length].id);
  }
  return state;
}

describe('Combat campaign generative resilience', () => {
  it('200 campañas deterministas llegan a final feliz sin estados muertos ni créditos negativos', () => {
    for (let seedIndex = 0; seedIndex < 200; seedIndex += 1) {
      localStorage.clear();
      let state = startCampaign(`state-fuzz-${seedIndex}`);
      let steps = 0;
      while (state.phase !== 'completed' && steps < 80) {
        expect(() => assertCampaignInvariant(state)).not.toThrow();
        expect(state.operationalCredits).toBeGreaterThanOrEqual(0);
        const next = advanceCampaign(state, seedIndex + steps);
        expect(next).not.toBeNull();
        state = next;
        steps += 1;
      }
      expect(state.phase).toBe('completed');
      expect(state.operationalCredits).toBeGreaterThanOrEqual(0);
      expect(steps).toBeLessThan(80);
    }
  });
});
