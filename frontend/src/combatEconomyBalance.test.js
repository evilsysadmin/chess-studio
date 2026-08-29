import { describe, expect, it } from 'vitest';
import { combatEconomyHealth, fullIntelCost, projectedCampaignSupplies } from './combatEconomyBalance.js';
import { evaluateCampaignMissionOrders } from './combatMissionOrders.js';

describe('gate de economía de campaña Combat Chess', () => {
  it('una batalla normal perfecta no compra por sí sola un Dossier completo', () => {
    const health = combatEconomyHealth();
    expect(health.fullIntel).toBe(15);
    expect(health.flawlessNormal).toBe(13);
    expect(health.normalFundsFullDossier).toBe(false);
    expect(health.startingFundsFullDossier).toBe(false);
  });

  it('el Cifrador abarata Intel sin volverlo gratuito', () => {
    expect(fullIntelCost({ cipher: true })).toBe(9);
  });

  it('cap de misión limita incluso una operación clasificada perfecta', () => {
    const node = { id: 's5-l1-elite', type: 'elite', stage: 5 };
    const result = evaluateCampaignMissionOrders('economy-gate', node, {
      casualties: 0, captures: 20, tacticalCredits: 20, underdogCredits: 20,
    }, { intelLevel: 3 });
    expect(result.results).toHaveLength(3);
    expect(result.earned).toBeLessThanOrEqual(9);
    expect(result.capped).toBeGreaterThanOrEqual(0);
  });

  it('un jugador medio sigue teniendo que elegir entre Intel y acumular suministros', () => {
    const projection = projectedCampaignSupplies({
      battleTypes: ['battle', 'battle', 'elite', 'battle', 'boss'],
      missionBonuses: [2, 3, 4, 3, 5],
      intelPurchases: [3, 3, 5, 3, 5, 7],
      eventIncome: 4,
    });
    expect(projection.supplies).toBeGreaterThanOrEqual(0);
    expect(projection.supplies).toBeLessThan(30);
  });
});
