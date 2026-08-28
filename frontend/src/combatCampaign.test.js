import { beforeEach, describe, expect, it } from 'vitest';
import { campaignBossForSeed, CAMPAIGN_BOSSES } from './combatBosses.js';
import {
  campaignMap,
  startCampaign,
  availableCampaignNodes,
  selectCampaignNode,
  markCampaignBriefingAccepted,
  markCampaignBattleStarted,
  markCampaignBattleRetired,
  recoverInterruptedCampaign,
  resumeInterruptedCampaign,
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
  campaignBiomeForNode,
  CAMPAIGN_BIOMES,
} from './combatCampaign.js';

beforeEach(() => localStorage.clear());

describe('Combat Chess campaign map', () => {
  it('genera el mismo mapa para la misma seed y acaba en boss', () => {
    const a = campaignMap('rivas');
    const b = campaignMap('rivas');
    expect(a).toEqual(b);
    expect(a.stages).toHaveLength(7);
    expect(a.stages.at(-1)).toHaveLength(1);
    const boss = campaignBossForSeed('rivas');
    expect(a.stages.at(-1)[0]).toMatchObject({ type: 'boss', label: boss.label, bossId: boss.id, floor: 10 });
  });



  it('ambienta cada combate de campaña de forma determinista sin tocar los temas globales', () => {
    const themes = new Set(Object.values(CAMPAIGN_BIOMES).map((biome) => biome.boardTheme));
    expect(themes).toEqual(new Set(['combat-jungle', 'combat-urban', 'combat-desert', 'combat-citadel']));

    for (let i = 0; i < 40; i += 1) {
      const seed = `biome-seed-${i}`;
      const map = campaignMap(seed);
      for (const node of map.nodes.filter((item) => ['battle', 'elite', 'boss'].includes(item.type))) {
        const first = campaignBiomeForNode(seed, node);
        const second = campaignBiomeForNode(seed, node);
        expect(second).toEqual(first);
        expect(themes.has(first.boardTheme)).toBe(true);
        if (node.type === 'boss') expect(first).toEqual(CAMPAIGN_BIOMES.citadel);
      }
    }
  });

  it('elige bosses deterministas con identidad y regla propias', () => {
    const seen = new Set();
    for (let i = 0; i < 60; i += 1) seen.add(campaignBossForSeed(`boss-seed-${i}`).id);
    expect(seen.size).toBe(CAMPAIGN_BOSSES.length);
    for (const boss of CAMPAIGN_BOSSES) {
      expect(boss.maxHp).toBeGreaterThanOrEqual(4);
      expect(boss.mechanicLabel).toBeTruthy();
      expect(boss.mechanicDescription).toBeTruthy();
      expect(boss.spriteId).toBeTruthy();
    }
  });

  it('sólo deja elegir nodos conectados desde la posición actual', () => {
    let run = startCampaign('rutas');
    const available = availableCampaignNodes(run);
    expect(available).toHaveLength(2);
    expect(available.every((node) => node.stage === 1)).toBe(true);
    const illegal = campaignMap(run.seed).stages[3][0];
    expect(selectCampaignNode(run, illegal.id)).toEqual(run);
  });

  it('un save con fase que exige nodo pero sin selección vuelve a un mapa jugable', () => {
    const run = startCampaign('briefing-roto');
    localStorage.setItem('chess-study-combat-campaign-v1', JSON.stringify({
      ...run,
      phase: 'briefing',
      selectedNodeId: 'nodo-que-no-existe',
    }));

    const recovered = loadCampaign();
    expect(recovered).toMatchObject({ active: true, phase: 'map', currentNodeId: 'start', selectedNodeId: null });
    expect(recovered.route).toEqual(['start']);
    expect(availableCampaignNodes(recovered)).toHaveLength(2);
  });


  it('migra campañas v1/v2 antiguas a v3 sin perder la ruta ni fabricar deuda', () => {
    for (const version of [1, 2]) {
      localStorage.clear();
      const base = startCampaign(`legacy-v${version}`);
      const first = availableCampaignNodes(base)[0];
      const selected = selectCampaignNode(base, first.id);
      localStorage.setItem('chess-study-combat-campaign-v1', JSON.stringify({
        ...selected,
        version,
        operationalCredits: version === 1 ? undefined : 4,
        intelligenceByNode: version === 1 ? undefined : { [first.id]: 1 },
        relicIds: version === 1 ? undefined : ['fieldCipher'],
      }));
      const migrated = loadCampaign();
      expect(migrated.version).toBe(3);
      expect(migrated.phase).toBe('briefing');
      expect(migrated.selectedNodeId).toBe(first.id);
      expect(migrated.operationalCredits).toBeGreaterThanOrEqual(0);
      expect(migrated.route[0]).toBe('start');
    }
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

  it('una retirada táctica conserva la campaña y devuelve el mismo sector al briefing', () => {
    let run = startCampaign('retirada-tactica');
    const first = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, first.id);
    run = markCampaignBriefingAccepted(run);
    run = markCampaignBattleStarted(run);
    expect(run.phase).toBe('fighting');

    const retired = markCampaignBattleRetired(run);
    expect(retired.active).toBe(true);
    expect(retired.phase).toBe('briefing');
    expect(retired.selectedNodeId).toBe(first.id);
    expect(retired.clearedNodeIds).not.toContain(first.id);
    expect(retired.route).toEqual(run.route);
    expect(retired.eventLog.at(-1)).toMatch(/Retirada táctica/);
    expect(loadCampaign()).toEqual(retired);
  });

  it('tolera retirada en la ventana battle -> fighting sin declarar operación interrumpida', () => {
    let run = startCampaign('retirada-race');
    const first = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, first.id);
    run = markCampaignBriefingAccepted(run);
    expect(run.phase).toBe('battle');

    const retired = markCampaignBattleRetired(run);
    expect(retired.active).toBe(true);
    expect(retired.phase).toBe('briefing');
    expect(retired.selectedNodeId).toBe(first.id);
  });

  it('recupera una batalla sin snapshot al briefing del mismo sector sin perder progreso', () => {
    let run = startCampaign('snapshot-perdido');
    const first = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, first.id);
    run = purchaseCampaignIntel(run, first.id);
    run = { ...run, perks: ['firstStrike'], relicIds: ['fieldCipher'] };
    localStorage.setItem('chess-study-combat-campaign-v1', JSON.stringify(run));
    run = markCampaignBriefingAccepted(loadCampaign());
    run = markCampaignBattleStarted(run);

    const recovered = recoverInterruptedCampaign(run);

    expect(recovered).toMatchObject({
      active: true,
      phase: 'briefing',
      selectedNodeId: first.id,
      operationalCredits: run.operationalCredits,
      intelligenceByNode: run.intelligenceByNode,
      perks: run.perks,
      relicIds: run.relicIds,
    });
    expect(recovered.clearedNodeIds).not.toContain(first.id);
    expect(loadCampaign()).toEqual(recovered);
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

  it('da una estimación rival gratis y la inteligencia reduce la incertidumbre sin mentir', () => {
    let run = startCampaign('intel-estimate');
    const node = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, node.id);
    const basic = campaignIntelBriefing(run, node);
    expect(basic.level).toBe(0);
    expect(basic.threatBand).toBeTruthy();
    expect(basic.opponentLevelRange).toMatch(/^\d+(?:–\d+)?$/);
    expect(basic.opponentLevelConfidence).toBe('Baja');
    expect(basic.exactOpponentLevel).toBeNull();

    const exactLevel = Math.max(1, Math.min(10, Math.ceil(campaignDifficulty(run, node) / 10)));
    const [basicMin, basicMax = basicMin] = basic.opponentLevelRange.split('–').map(Number);
    expect(exactLevel).toBeGreaterThanOrEqual(basicMin);
    expect(exactLevel).toBeLessThanOrEqual(basicMax);

    run = purchaseCampaignIntel(run, node.id);
    const contact = campaignIntelBriefing(run, node);
    const [contactMin, contactMax = contactMin] = contact.opponentLevelRange.split('–').map(Number);
    expect(contact.opponentLevelConfidence).toBe('Media');
    expect(contactMax - contactMin).toBeLessThanOrEqual(basicMax - basicMin);
    expect(exactLevel).toBeGreaterThanOrEqual(contactMin);
    expect(exactLevel).toBeLessThanOrEqual(contactMax);
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
    expect(archive[0]).toMatchObject({ reason:'retired', credits:9, relicIds:['fieldCipher'], bossId: campaignBossForSeed('archive').id });
  });

  it('una operación ya archivada como interrumpida puede reanudarse y sale del archivo', () => {
    let run = startCampaign('archive-recovery');
    const first = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, first.id);
    run = purchaseCampaignIntel(run, first.id);
    run = markCampaignBriefingAccepted(run);
    run = markCampaignBattleStarted(run);
    const result = endCampaign(run, 'interrupted');

    expect(loadCampaign().active).toBe(false);
    const recovered = resumeInterruptedCampaign(result.archiveEntry);

    expect(recovered).toMatchObject({
      active: true,
      phase: 'briefing',
      seed: run.seed,
      selectedNodeId: first.id,
      operationalCredits: run.operationalCredits,
      intelligenceByNode: run.intelligenceByNode,
    });
    expect(loadCampaignArchive().some((entry) => entry.id === result.archiveEntry.id)).toBe(false);
  });

  it('recupera archivos interrumpidos antiguos en el último nodo resuelto sin regalar el combate pendiente', () => {
    let run = startCampaign('legacy-interrupted');
    const first = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, first.id);
    run = markCampaignBriefingAccepted(run);
    run = markCampaignBattleStarted(run);
    const result = endCampaign(run, 'interrupted');
    const legacyEntry = { ...result.archiveEntry };
    delete legacyEntry.resumeState;

    const recovered = resumeInterruptedCampaign(legacyEntry);

    expect(recovered).toMatchObject({
      active: true,
      phase: 'map',
      seed: run.seed,
      currentNodeId: 'start',
      operationalCredits: run.operationalCredits,
    });
    expect(recovered.clearedNodeIds).toEqual([]);
  });

  it('un reinicio de campaña puede archivarse como reinicio sin borrar el ejército/meta progreso', () => {
    const run = startCampaign('restart-contract');
    const result = endCampaign(run, 'restarted');
    expect(result.reason).toBe('restarted');
    expect(loadCampaign().active).toBe(false);
    expect(loadCampaignArchive()[0]?.reason).toBe('restarted');
    const fresh = startCampaign('restart-fresh');
    expect(fresh.active).toBe(true);
    expect(fresh.phase).toBe('map');
    expect(fresh.seed).toBe('restart-fresh');
  });

  it('recorre muchas campañas procedurales completas sin estados muertos ni saltos de sector', () => {
    for (let seedIndex = 0; seedIndex < 64; seedIndex += 1) {
      let run = startCampaign(`flow-audit-${seedIndex}`);
      let guard = 0;

      while (run.phase !== 'completed' && guard < 80) {
        guard += 1;
        if (run.phase === 'map') {
          const available = availableCampaignNodes(run);
          expect(available.length, `seed ${seedIndex} sin salida desde ${run.currentNodeId}`).toBeGreaterThan(0);
          run = selectCampaignNode(run, available[seedIndex % available.length].id);
          continue;
        }
        if (run.phase === 'event') {
          const options = campaignEventOptions(run);
          expect(options.length, `seed ${seedIndex} evento sin opciones`).toBeGreaterThan(0);
          run = resolveCampaignEvent(run, options[seedIndex % options.length].id);
          continue;
        }
        if (run.phase === 'camp') {
          const options = campaignRewardOptions(run);
          expect(options.length, `seed ${seedIndex} campamento sin recompensa`).toBeGreaterThan(0);
          run = chooseCampaignReward(run, options[seedIndex % options.length].id);
          continue;
        }
        if (run.phase === 'briefing') {
          run = markCampaignBriefingAccepted(run);
          continue;
        }
        if (run.phase === 'battle') {
          run = markCampaignBattleStarted(run);
          continue;
        }
        if (run.phase === 'fighting') {
          run = markCampaignBattleWon(run);
          continue;
        }
        if (run.phase === 'reward') {
          const options = campaignRewardOptions(run);
          expect(options.length, `seed ${seedIndex} victoria sin recompensa`).toBeGreaterThan(0);
          run = chooseCampaignReward(run, options[seedIndex % options.length].id);
          continue;
        }
        throw new Error(`Fase inesperada ${run.phase} en seed ${seedIndex}`);
      }

      expect(guard, `seed ${seedIndex} excedió el límite de transiciones`).toBeLessThan(80);
      expect(run.phase, `seed ${seedIndex} no llegó al boss`).toBe('completed');
      expect(run.clearedNodeIds).toHaveLength(7);
      expect(run.route).toHaveLength(8); // base + un sector por etapa
      const result = endCampaign(run, 'completed');
      expect(result.reason).toBe('completed');
      expect(loadCampaign().active).toBe(false);
    }
  });

  it('retirada -> briefing -> reintento conserva recursos e inteligencia del mismo sector', () => {
    let run = startCampaign('retreat-retry-audit');
    const first = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, first.id);
    run = purchaseCampaignIntel(run, first.id);
    const before = {
      route: [...run.route],
      credits: run.operationalCredits,
      intel: { ...run.intelligenceByNode },
      perks: [...run.perks],
    };
    run = markCampaignBriefingAccepted(run);
    run = markCampaignBattleStarted(run);
    run = markCampaignBattleRetired(run);

    expect(run.phase).toBe('briefing');
    expect(run.selectedNodeId).toBe(first.id);
    expect(run.route).toEqual(before.route);
    expect(run.operationalCredits).toBe(before.credits);
    expect(run.intelligenceByNode).toEqual(before.intel);
    expect(run.perks).toEqual(before.perks);

    run = markCampaignBriefingAccepted(run);
    expect(run.phase).toBe('battle');
    run = markCampaignBattleStarted(run);
    expect(run.phase).toBe('fighting');
    expect(run.selectedNodeId).toBe(first.id);
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


  it('empieza claramente accesible y escala de forma progresiva hasta el boss', () => {
    const map = campaignMap('progressive-war');
    const battleByStage = map.stages.map((nodes) => nodes.find((node) => node.type === 'battle')).filter(Boolean);
    const first = battleByStage.find((node) => node.stage === 1);
    expect(first.baseDifficulty).toBeLessThanOrEqual(15);
    const bases = battleByStage.map((node) => node.baseDifficulty);
    for (let index = 1; index < bases.length; index += 1) expect(bases[index]).toBeGreaterThan(bases[index - 1]);
    const earlyElite = map.stages[2].find((node) => node.type === 'elite');
    const boss = map.stages.at(-1)[0];
    expect(earlyElite.baseDifficulty).toBeLessThan(45);
    expect(boss.baseDifficulty).toBeGreaterThanOrEqual(65);
  });

  it('el briefing revela siempre la regla material aunque no se compre intel', () => {
    let run = startCampaign('public-material-rule');
    const node = availableCampaignNodes(run)[0];
    run = selectCampaignNode(run, node.id);
    const briefing = campaignIntelBriefing(run, node);
    expect(briefing.level).toBe(0);
    expect(briefing.modifierLabel).toBeTruthy();
    expect(briefing.modifierDescription).toBeTruthy();
    expect(briefing.threatBand).toBeTruthy();
    expect(briefing.opponentLevelRange).toBeTruthy();
    expect(briefing.opponentLevelConfidence).toBe('Baja');
    expect(briefing.exactDifficulty).toBeNull();
  });
});

describe('bosses de campaña con identidad mecánica', () => {
  it('cada rey final declara una regla visible y un perfil de daño distinto', () => {
    expect(CAMPAIGN_BOSSES).toHaveLength(3);
    expect(new Set(CAMPAIGN_BOSSES.map((boss) => boss.mechanicLabel)).size).toBe(3);
    expect(CAMPAIGN_BOSSES.find((boss) => boss.id === 'iron_king')?.rookShield).toBe(true);
    expect(CAMPAIGN_BOSSES.find((boss) => boss.id === 'nomad_king')?.mateDamage).toBe(3);
    expect(CAMPAIGN_BOSSES.find((boss) => boss.id === 'shadow_king')?.checkDamage).toBe(2);
  });
});
