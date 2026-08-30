import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMBAT_ENEMY_OFFICERS,
  COMBAT_ENEMY_OFFICERS_KEY,
  campaignOfficerContext,
  enemyOfficerBriefing,
  enemyOfficerForNode,
  loadEnemyOfficerHistory,
  officerServiceRank,
  recordEnemyOfficerSessionEncounter,
} from './combatEnemyOfficers.js';

describe('oficiales enemigos persistentes de Combat Chess', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('asigna una identidad estable desde un pool pequeño que puede reaparecer entre campañas', () => {
    const node = { id: 's3-l1-battle', stage: 3, lane: 1, type: 'battle', label: 'Cruce bajo fuego' };
    const first = enemyOfficerForNode('alpha', node);
    const again = enemyOfficerForNode('alpha', node);

    expect(first).toEqual(again);
    expect(COMBAT_ENEMY_OFFICERS).toContainEqual(first);
    expect(COMBAT_ENEMY_OFFICERS.length).toBeLessThanOrEqual(12);
  });

  it('extrae sólo sesiones de campaña con oficial y deja al boss con su identidad propia', () => {
    expect(campaignOfficerContext('campaign:seed-1:s4-l2-elite', 'Guardia de Hierro')).toEqual({
      campaignSeed: 'seed-1',
      node: { id: 's4-l2-elite', stage: 4, lane: 2, type: 'elite', label: 'Guardia de Hierro' },
    });
    expect(campaignOfficerContext('campaign:seed-1:s7-l1-boss', 'Rey')).toBeNull();
    expect(campaignOfficerContext('run:seed-1:4', 'Piso 4')).toBeNull();
  });

  it('registra resultados reales una sola vez por game id y construye la revancha desde ese historial', () => {
    const session = 'campaign:alpha:s3-l1-battle';
    recordEnemyOfficerSessionEncounter({
      combatSessionId: session,
      encounterLabel: 'Cruce bajo fuego',
      outcome: 'loss',
      encounterId: 'game-17',
      at: 1000,
    });
    recordEnemyOfficerSessionEncounter({
      combatSessionId: session,
      encounterLabel: 'Cruce bajo fuego',
      outcome: 'loss',
      encounterId: 'game-17',
      at: 2000,
    });

    const context = campaignOfficerContext(session, 'Cruce bajo fuego');
    const officer = enemyOfficerForNode(context.campaignSeed, context.node);
    const history = loadEnemyOfficerHistory();
    expect(history[officer.id]).toMatchObject({
      encounters: 1,
      playerWins: 0,
      officerWins: 1,
      draws: 0,
      retreats: 0,
      lastOutcome: 'loss',
      lastNodeLabel: 'Cruce bajo fuego',
    });
    const briefing = enemyOfficerBriefing(context.campaignSeed, context.node, history);
    expect(briefing.note).toContain('Te venció la última vez');
    expect(briefing.note).toContain('no altera la fuerza de la CPU');
    expect(localStorage.getItem(COMBAT_ENEMY_OFFICERS_KEY)).toContain('game-17');
  });

  it('separa tablas y retiradas del balance de victorias', () => {
    recordEnemyOfficerSessionEncounter({ combatSessionId: 'campaign:alpha:s3-l1-battle', encounterLabel: 'Uno', outcome: 'draw', encounterId: 'g1', at: 1 });
    recordEnemyOfficerSessionEncounter({ combatSessionId: 'campaign:alpha:s3-l1-battle', encounterLabel: 'Uno', outcome: 'retired', encounterId: 'g2', at: 2 });
    const context = campaignOfficerContext('campaign:alpha:s3-l1-battle', 'Uno');
    const officer = enemyOfficerForNode(context.campaignSeed, context.node);
    expect(loadEnemyOfficerHistory()[officer.id]).toMatchObject({ encounters: 2, playerWins: 0, officerWins: 0, draws: 1, retreats: 1 });
  });

  it('no asciende a un oficial sólo por acumular derrotas contra el jugador', () => {
    const lieutenant = COMBAT_ENEMY_OFFICERS.find((officer) => officer.rank === 'Teniente');
    expect(officerServiceRank(lieutenant, { encounters: 12, playerWins: 12, officerWins: 0, draws: 0 })).toMatchObject({
      rank: 'Teniente',
      promotions: 0,
      serviceScore: 2,
    });
  });

  it('asciende de forma narrativa cuando sus resultados reales justifican el expediente', () => {
    const lieutenant = COMBAT_ENEMY_OFFICERS.find((officer) => officer.rank === 'Teniente');
    const colonel = COMBAT_ENEMY_OFFICERS.find((officer) => officer.rank === 'Coronel');

    expect(officerServiceRank(lieutenant, { encounters: 4, officerWins: 1, draws: 0 })).toMatchObject({
      rank: 'Capitán',
      promotions: 1,
      serviceScore: 4,
    });
    expect(officerServiceRank(lieutenant, { encounters: 4, officerWins: 3, draws: 0 })).toMatchObject({
      rank: 'Mayor',
      promotions: 2,
      serviceScore: 10,
    });
    expect(officerServiceRank(colonel, { encounters: 4, officerWins: 2, draws: 0 })).toMatchObject({
      rank: 'General',
      promotions: 1,
      nextPromotionIn: null,
    });
  });
});
