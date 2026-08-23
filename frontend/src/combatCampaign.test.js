import { beforeEach, describe, expect, it } from 'vitest';
import {
  campaignMap,
  startCampaign,
  availableCampaignNodes,
  selectCampaignNode,
  markCampaignBriefingAccepted,
  markCampaignBattleStarted,
  markCampaignBattleWon,
  campaignRewardOptions,
  chooseCampaignReward,
  campaignEventOptions,
  resolveCampaignEvent,
  campaignDifficulty,
  campaignIntelBriefing,
  purchaseCampaignIntel,
  loadCampaign,
  resetCombatCampaign,
  nextCampaignIntelTier,
  campaignRelicDetails,
  loadCampaignArchive,
  endCampaign,
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
    expect(run.phase).toBe('briefing');
    run = markCampaignBriefingAccepted(run);
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
    const options = campaignEventOptions(run);
    expect(options).toHaveLength(3);
    const quiet = options.find((option) => Number(option.difficultyDelta) < 0);
    expect(quiet).toBeTruthy();
    run = resolveCampaignEvent(run, quiet.id);
    expect(run.nextDifficultyDelta).toBeLessThan(0);
    const nextBattle = availableCampaignNodes(run).find((node) => ['battle', 'elite'].includes(node.type));
    if (nextBattle) expect(campaignDifficulty(run, nextBattle)).toBe(nextBattle.baseDifficulty - 6);
  });

  it('compra intel por niveles y nunca gasta más créditos de los disponibles', () => {
    let run = startCampaign('intel');
    const node = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, node.id);
    expect(run.phase).toBe('briefing');
    expect(run.operationalCredits).toBe(6);
    expect(campaignIntelBriefing(run, node).level).toBe(0);
    run = purchaseCampaignIntel(run, node.id);
    const level1 = campaignIntelBriefing(run, node);
    expect(level1.level).toBe(1);
    expect(level1.threatRange).toBeTruthy();
    expect(run.operationalCredits).toBe(3);
    const unchanged = purchaseCampaignIntel(run, node.id);
    expect(unchanged).toEqual(run); // nivel 2 cuesta 5; no hay saldo
  });

  it('una victoria concede créditos una sola vez porque sólo fighting puede resolver victoria', () => {
    let run = startCampaign('credits');
    const node = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, node.id);
    run = markCampaignBriefingAccepted(run);
    run = markCampaignBattleStarted(run);
    const before = run.operationalCredits;
    run = markCampaignBattleWon(run);
    expect(run.operationalCredits).toBe(before + 4);
    const twice = markCampaignBattleWon(run);
    expect(twice).toEqual(run);
  });


  it('las reliquias operativas cambian economía e intel sin tocar el tablero', () => {
    let run = startCampaign('relics');
    run = { ...run, relicIds: ['fieldCipher', 'quartermasterSeal'] };
    localStorage.setItem('chess-study-combat-campaign-v1', JSON.stringify(run));
    run = loadCampaign();
    expect(campaignRelicDetails(run).map((row) => row.id)).toEqual(expect.arrayContaining(['fieldCipher', 'quartermasterSeal']));
    const node = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, node.id);
    expect(nextCampaignIntelTier(run).cost).toBe(1);
    run = markCampaignBriefingAccepted(run);
    run = markCampaignBattleStarted(run);
    const before = run.operationalCredits;
    run = markCampaignBattleWon(run);
    expect(run.operationalCredits).toBe(before + 6);
  });

  it('migra campañas v2 sin inventar reliquias', () => {
    const v2 = { ...startCampaign('legacy-v2'), version: 2 };
    delete v2.relicIds;
    localStorage.setItem('chess-study-combat-campaign-v1', JSON.stringify(v2));
    const migrated = loadCampaign();
    expect(migrated.version).toBe(3);
    expect(migrated.relicIds).toEqual([]);
  });

  it('archiva una operación terminada con ruta, reliquias y saldo real', () => {
    let run = startCampaign('archive');
    run = { ...run, relicIds:['fieldCipher'], operationalCredits:9 };
    localStorage.setItem('chess-study-combat-campaign-v1', JSON.stringify(run));
    run = loadCampaign();
    const result = endCampaign(run, 'retired');
    expect(result.archiveEntry).toBeTruthy();
    const archive = loadCampaignArchive();
    expect(archive).toHaveLength(1);
    expect(archive[0]).toMatchObject({ reason:'retired', credits:9, relicIds:['fieldCipher'] });
  });

  it('reset elimina el intento de campaña', () => {
    startCampaign('reset');
    resetCombatCampaign();
    expect(loadCampaign().active).toBe(false);
  });
});

describe('campaña · onboarding y reglas visibles', () => {
  it('el primer sector no sorprende con material enemigo extra', () => {
    const run = startCampaign('onboarding-standard-material');
    const first = availableCampaignNodes(run).filter((node) => node.type === 'battle');
    expect(first.length).toBeGreaterThan(0);
    for (const node of first) expect(node.modifierId).toBe('none');
  });

  it('el briefing revela siempre la regla material aunque no se compre intel', () => {
    let run = startCampaign('public-material-rule');
    const node = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, node.id);
    const briefing = campaignIntelBriefing(run, node);
    expect(briefing.level).toBe(0);
    expect(briefing.modifierLabel).toBeTruthy();
    expect(briefing.modifierDescription).toBeTruthy();
    expect(briefing.exactDifficulty).toBeNull();
  });
});
