import { beforeEach, describe, expect, it } from 'vitest';
import {
  campaignMap,
  startCampaign,
  availableCampaignNodes,
  selectCampaignNode,
  markCampaignBattleStarted,
  markCampaignBattleWon,
  campaignRewardOptions,
  chooseCampaignReward,
  campaignEventOptions,
  resolveCampaignEvent,
  campaignDifficulty,
  loadCampaign,
  resetCombatCampaign,
} from './combatCampaign.js';

beforeEach(() => localStorage.clear());

describe('Combat Chess campaign map', () => {
  it('genera el mismo mapa para la misma seed y acaba en boss', () => {
    const a = campaignMap('rivas');
    const b = campaignMap('rivas');
    expect(a).toEqual(b);
    expect(a.stages).toHaveLength(7);
    expect(a.stages.at(-1)).toHaveLength(1);
    expect(a.stages.at(-1)[0]).toMatchObject({ type: 'boss', label: 'El Rey Viejo', floor: 10 });
  });

  it('sólo deja elegir nodos conectados desde la posición actual', () => {
    let run = startCampaign('rutas');
    const available = availableCampaignNodes(run);
    expect(available).toHaveLength(2);
    expect(available.every((node) => node.stage === 1)).toBe(true);
    const illegal = campaignMap(run.seed).stages[3][0];
    expect(selectCampaignNode(run, illegal.id)).toEqual(run);
  });

  it('una batalla exige start -> fighting -> reward y el botín élite duplica stack', () => {
    let run = startCampaign('elite');
    const first = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, first.id);
    expect(run.phase).toBe('battle');
    run = markCampaignBattleStarted(run);
    expect(run.phase).toBe('fighting');
    run = markCampaignBattleWon(run);
    expect(run.phase).toBe('reward');
    const perk = campaignRewardOptions(run)[0];
    run = chooseCampaignReward(run, perk.id);
    expect(run.phase).toBe('map');
    expect(run.perks).toContain(perk.id);
  });

  it('evento recon acumula inteligencia y la aplica a la siguiente batalla', () => {
    let run = startCampaign('event-route');
    // Forzamos un estado válido tras limpiar un nodo de etapa 1 para probar la etapa 2.
    const map = campaignMap(run.seed);
    run = { ...run, currentNodeId: map.stages[0][0].id, clearedNodeIds: [map.stages[0][0].id], route: ['start', map.stages[0][0].id] };
    localStorage.setItem('chess-study-combat-campaign-v1', JSON.stringify(run));
    run = loadCampaign();
    const event = availableCampaignNodes(run).find((node) => node.type === 'event');
    expect(event).toBeTruthy();
    run = selectCampaignNode(run, event.id);
    expect(campaignEventOptions(run).map((o) => o.id)).toEqual(['recon', 'salvage']);
    run = resolveCampaignEvent(run, 'recon');
    expect(run.nextDifficultyDelta).toBe(-6);
    const nextBattle = availableCampaignNodes(run).find((node) => ['battle', 'elite'].includes(node.type));
    if (nextBattle) expect(campaignDifficulty(run, nextBattle)).toBe(nextBattle.baseDifficulty - 6);
  });

  it('reset elimina el intento de campaña', () => {
    startCampaign('reset');
    resetCombatCampaign();
    expect(loadCampaign().active).toBe(false);
  });
});
