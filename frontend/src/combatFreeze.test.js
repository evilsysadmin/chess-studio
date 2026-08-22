import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAMPAIGN_VERSION,
  availableCampaignNodes,
  campaignIntelBriefing,
  loadCampaign,
  markCampaignBriefingAccepted,
  purchaseCampaignIntel,
  selectCampaignNode,
  startCampaign,
} from './combatCampaign.js';
import {
  deploymentSummary,
  grantReserveRecruit,
  isUnitCompatibleWithSlot,
  setDeploymentUnit,
} from './combatDeployment.js';
import { loadRoster, saveSurvivorsToRoster } from './combatRoster.js';
import { setRosterDeploymentType } from './combatMetamorphosis.js';
import { loadCombatSession, saveCombatSession } from './combatSession.js';
import { loadMechanicTutorialProgress, markMechanicTutorialSeen } from './mechanicTutorials.js';

const CAMPAIGN_KEY = 'chess-study-combat-campaign-v1';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('v16.6bo · feature-freeze invariants', () => {
  it('migra una campaña v1 a v2 sin perder ruta y concede los créditos iniciales', () => {
    const seed = 'legacy-freeze';
    const fresh = startCampaign(seed);
    const first = availableCampaignNodes(fresh)[0];
    localStorage.setItem(CAMPAIGN_KEY, JSON.stringify({
      version: 1,
      active: true,
      seed,
      phase: 'map',
      currentNodeId: 'start',
      selectedNodeId: null,
      clearedNodeIds: [],
      route: ['start'],
      perks: [],
      rewardChosenForNode: null,
      nextDifficultyDelta: 0,
    }));

    const migrated = loadCampaign();
    expect(migrated.version).toBe(CAMPAIGN_VERSION);
    expect(migrated.active).toBe(true);
    expect(migrated.seed).toBe(seed);
    expect(migrated.route).toEqual(['start']);
    expect(migrated.operationalCredits).toBe(6);
    expect(migrated.intelligenceByNode).toEqual({});
    expect(first).toBeTruthy();
  });

  it('sólo permite comprar inteligencia durante el briefing del nodo seleccionado', () => {
    let run = startCampaign('intel-freeze');
    const [selected, other] = availableCampaignNodes(run);
    run = selectCampaignNode(run, selected.id);

    const credits = run.operationalCredits;
    const wrongNode = purchaseCampaignIntel(run, other.id);
    expect(wrongNode).toEqual(run);
    expect(wrongNode.operationalCredits).toBe(credits);

    run = purchaseCampaignIntel(run, selected.id);
    expect(campaignIntelBriefing(run, selected).level).toBe(1);

    run = markCampaignBriefingAccepted(run);
    const afterDeploymentStarted = purchaseCampaignIntel(run, selected.id);
    expect(afterDeploymentStarted).toEqual(run);
  });

  it('una reserva puede sustituir a su misma clase sin alterar la identidad logística del slot', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, {
      grantId: 'freeze:reserve-pawn', originType: 'p', rng: () => 0.23, now: 1234,
    });
    const reserve = deploymentSummary(roster).reserveKeys.find((key) => key.startsWith('p-'));
    expect(reserve).toBeTruthy();
    expect(isUnitCompatibleWithSlot(roster, reserve, 'p-a')).toBe(true);
    expect(isUnitCompatibleWithSlot(roster, reserve, 'n-b')).toBe(false);

    roster = setDeploymentUnit(roster, 'p-a', reserve);
    expect(roster.deployment['p-a']).toBe(reserve);
    expect(deploymentSummary(roster).reserveKeys).toContain('p-a');
  });

  it('un peón metamorfoseado sigue siendo compatible con slots de peón, no con slots de caballo', () => {
    let roster = loadRoster();
    // Si la forma todavía no está desbloqueada, el setter cae de forma segura a la forma base.
    roster = setRosterDeploymentType(roster, 'p-a', 'n');
    expect(isUnitCompatibleWithSlot(roster, 'p-a', 'p-a')).toBe(true);
    expect(isUnitCompatibleWithSlot(roster, 'p-a', 'n-b')).toBe(false);
  });

  it('una unidad en reserva no se convierte en baja al resolver supervivientes de los desplegados', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, {
      grantId: 'freeze:safe-reserve', originType: 'p', rng: () => 0.31, now: 2000,
    });
    const reserve = deploymentSummary(roster).reserveKeys[0];
    const deployed = Object.values(roster.deployment || {});
    const next = saveSurvivorsToRoster({}, roster, 'w', 'loss', deployed);
    expect(next.pieces[reserve]?.alive).not.toBe(false);
  });

  it('el snapshot activo sólo reanuda la batalla con el mismo id de sesión', () => {
    saveCombatSession('campaign:freeze:s1', {
      phase: 'battle', fen: 'freeze-fen', registry: { e2: { type: 'p', color: 'w' } }, humanColor: 'w',
    });
    expect(loadCombatSession('campaign:freeze:s1')?.fen).toBe('freeze-fen');
    expect(loadCombatSession('campaign:freeze:s2')).toBeNull();
  });

  it('el progreso de tutoriales permanece aislado como estado de perfil y es reabrible', () => {
    expect(loadMechanicTutorialProgress()).toEqual({});
    markMechanicTutorialSeen('combat-deployment');
    expect(loadMechanicTutorialProgress()['combat-deployment']?.seen).toBe(true);
    expect(loadMechanicTutorialProgress()['combat-intelligence']).toBeUndefined();
  });
});
