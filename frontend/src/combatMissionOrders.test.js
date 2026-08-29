import { describe, expect, it } from 'vitest';
import { campaignMissionOrders, classifiedCampaignMission, evaluateCampaignMissionOrders } from './combatMissionOrders.js';

describe('órdenes opcionales de Combat Chess', () => {
  const node = { id: 's3-l1-elite', type: 'elite', stage: 3 };

  it('genera dos órdenes deterministas, distintas y con recompensa acotada', () => {
    const first = campaignMissionOrders('operacion-rivas', node);
    const second = campaignMissionOrders('operacion-rivas', node);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(new Set(first.map((order) => order.id)).size).toBe(2);
    expect(first.every((order) => order.reward >= 2 && order.reward <= 4)).toBe(true);
  });

  it('sólo evalúa métricas reales de la batalla y suma únicamente órdenes cumplidas', () => {
    const orders = campaignMissionOrders('operacion-rivas', node);
    const perfect = evaluateCampaignMissionOrders('operacion-rivas', node, {
      casualties: 0,
      captures: 8,
      tacticalCredits: 8,
      underdogCredits: 8,
    });
    expect(perfect.completed.map((order) => order.id)).toEqual(orders.map((order) => order.id));
    expect(perfect.earned).toBe(orders.reduce((sum, order) => sum + order.reward, 0));

    const poor = evaluateCampaignMissionOrders('operacion-rivas', node, {
      casualties: 9,
      captures: 0,
      tacticalCredits: 0,
      underdogCredits: 0,
    });
    expect(poor.earned).toBe(0);
  });

  it('si faltan métricas verificables no concede éxitos por defecto', () => {
    const result = evaluateCampaignMissionOrders('operacion-rivas', node);
    expect(result.verified).toBe(false);
    expect(result.earned).toBe(0);
    expect(result.completed).toEqual([]);
  });

  it('no inventa órdenes en nodos seguros o de evento', () => {
    expect(campaignMissionOrders('x', { id: 'camp', type: 'camp' })).toEqual([]);
    expect(campaignMissionOrders('x', { id: 'event', type: 'event' })).toEqual([]);
  });

  it('Intel de Evaluación revela una operación clasificada estable sin hacer reroll', () => {
    expect(classifiedCampaignMission('operacion-rivas', node, 1)).toBeNull();
    const classified = classifiedCampaignMission('operacion-rivas', node, 2);
    expect(classified).toMatchObject({ classified: true });
    expect(classified.reward).toBeGreaterThanOrEqual(5);
    expect(classified).toEqual(classifiedCampaignMission('operacion-rivas', node, 3));

    const perfect = evaluateCampaignMissionOrders('operacion-rivas', node, {
      casualties: 0,
      captures: 12,
      tacticalCredits: 12,
      underdogCredits: 12,
    }, { intelLevel: 2 });
    expect(perfect.results).toHaveLength(3);
    expect(perfect.classifiedRevealed).toBe(true);
    expect(perfect.completed).toHaveLength(3);
  });
});
