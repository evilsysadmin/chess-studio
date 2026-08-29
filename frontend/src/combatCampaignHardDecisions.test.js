import { beforeEach, describe, expect, it } from 'vitest';
import {
  availableCampaignNodes,
  campaignEventOptions,
  campaignMap,
  loadCampaign,
  resolveCampaignEvent,
  selectCampaignNode,
  startCampaign,
} from './combatCampaign.js';

beforeEach(() => localStorage.clear());

function eventState(seed = 'hard-decisions') {
  let run = startCampaign(seed);
  const map = campaignMap(run.seed);
  const cleared = map.stages[0][0];
  run = {
    ...run,
    phase: 'map',
    currentNodeId: cleared.id,
    selectedNodeId: null,
    clearedNodeIds: [cleared.id],
    route: ['start', cleared.id],
  };
  localStorage.setItem('chess-study-combat-campaign-v1', JSON.stringify(run));
  run = loadCampaign();
  const event = availableCampaignNodes(run).find((node) => node.type === 'event');
  expect(event, `seed ${seed} debe exponer evento en etapa 2`).toBeTruthy();
  return selectCampaignNode(run, event.id);
}

describe('Combat campaign · decisiones con coste real', () => {
  it('ningún beneficio económico o reducción de amenaza es completamente gratis', () => {
    for (let i = 0; i < 24; i += 1) {
      const run = eventState(`tradeoff-${i}`);
      const options = campaignEventOptions({ ...run, operationalCredits: 20 });
      expect(options).toHaveLength(3);
      for (const option of options) {
        if (Number(option.credits) > 0) {
          expect(Number(option.creditCost) > 0 || Number(option.difficultyDelta) > 0, `${option.id} regala créditos`).toBe(true);
        }
        if (Number(option.difficultyDelta) < 0) {
          expect(Number(option.creditCost), `${option.id} reduce amenaza gratis`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('cada evento conserva al menos una salida sin coste para no crear un estado muerto', () => {
    for (let i = 0; i < 24; i += 1) {
      const run = eventState(`escape-${i}`);
      const options = campaignEventOptions({ ...run, operationalCredits: 0 });
      expect(options.some((option) => !option.disabled && Number(option.creditCost || 0) === 0)).toBe(true);
    }
  });

  it('marca como no disponible una decisión que no puedes pagar y resolverla no muta campaña', () => {
    const run = { ...eventState('broke'), operationalCredits: 0 };
    const paid = campaignEventOptions(run).find((option) => Number(option.creditCost) > 0);
    expect(paid).toBeTruthy();
    expect(paid.disabled).toBe(true);
    expect(paid.description).toMatch(/Coste:/);
    expect(resolveCampaignEvent(run, paid.id)).toEqual(run);
  });

  it('una decisión pagada descuenta exactamente su coste y luego aplica la recompensa', () => {
    const run = { ...eventState('paid'), operationalCredits: 20 };
    const paid = campaignEventOptions(run).find((option) => Number(option.creditCost) > 0);
    expect(paid).toBeTruthy();
    expect(paid.disabled).toBe(false);

    const resolved = resolveCampaignEvent(run, paid.id);
    const expectedCredits = 20 - Number(paid.creditCost || 0) + Math.max(0, Number(paid.credits) || 0);
    expect(resolved.operationalCredits).toBe(expectedCredits);
    expect(resolved.phase).toBe('map');
    expect(resolved.eventLog.at(-1)).toMatch(/suministros|créditos|amenaza|reliquia|botín/i);
  });
});
