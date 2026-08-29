import { afterEach, describe, expect, it } from 'vitest';
import {
  COMBAT_STARTING_CREDITS,
  COMBAT_EQUIPMENT,
  awardCombatCredits,
  battleCreditReward,
  combatCreditSignalForAttempt,
  buyEquipment,
  hireMercenary,
  mercenaryMarketOffers,
  equipmentMarketOffers,
  normalizeCombatEconomy,
  settleMercenaryContracts,
} from './combatEconomy.js';
import { setAdminPreviewAccess } from './adminPreview.js';

afterEach(() => setAdminPreviewAccess(false));

describe('economía de Combat', () => {
  it('migra la vieja XP global a créditos y deja la XP sólo en las unidades', () => {
    expect(normalizeCombatEconomy({ combatXp: 12 })).toMatchObject({ credits: COMBAT_STARTING_CREDITS + 24, combatXp: 0 });
    expect(normalizeCombatEconomy({ credits: 9, combatXp: 99 })).toMatchObject({ credits: 9, combatXp: 0 });
  });

  it('premia jugar y capturar sin convertir el mercado en requisito', () => {
    const win = battleCreditReward({ outcome: 'win', captures: 4, floor: 4, variant: 'roguelike' });
    const loss = battleCreditReward({ outcome: 'loss', captures: 1, floor: 4, variant: 'roguelike' });
    expect(win).toEqual({ total: 22, captures: 8, result: 5, sector: 4, preservation: 5, underdog: 0, tactics: 0, capped: 0 });
    expect(loss.total).toBe(2);
    expect(battleCreditReward({ outcome: 'retired', captures: 9 }).total).toBe(0);
  });

  it('no duplica créditos si se procesa dos veces la misma batalla', () => {
    const once = awardCombatCredits({ credits: 20 }, { total: 8 }, 'battle-1');
    expect(awardCombatCredits(once, 8, 'battle-1')).toBe(once);
    expect(once.credits).toBe(28);
  });

  it('exige nivel, saldo y un hueco libre para el equipo', () => {
    const base = { credits: 60, pieces: { 'p-a': { alive: true, strengthPoints: 3, speedPoints: 1 } } };
    const bought = buyEquipment(base, 'mobility-rig', 'p-a');
    expect(bought.credits).toBe(30);
    expect(bought.pieces['p-a'].equipmentId).toBe('mobility-rig');
    expect(buyEquipment(bought, 'service-pistol', 'p-a')).toBe(bought);
  });

  it('permite a un admin probar equipo y mercenarios sin falsear créditos ni nivel', () => {
    setAdminPreviewAccess(true);
    const base = { credits: 0, pieces: { 'p-a': { alive: true, strengthPoints: 0, speedPoints: 0 } }, identities: {}, unitRecords: {} };
    const equipped = buyEquipment(base, 'sniper-rifle', 'p-a');
    expect(equipped).toMatchObject({ credits: 0, pieces: { 'p-a': { equipmentId: 'sniper-rifle' } } });
    const offer = mercenaryMarketOffers({ rotationKey: '2026-08-25' })[0];
    const hired = hireMercenary(base, offer, 'one', 1000);
    expect(Object.keys(hired.pieces).some((key) => key.includes('-merc-'))).toBe(true);
    expect(hired.credits).toBe(0);
  });

  it('los créditos iniciales permiten una decisión útil, no barra libre', () => {
    const offers = mercenaryMarketOffers({ merit: 0, rotationKey: '2026-08-27' });
    expect(offers.some((offer) => offer.prices.one <= COMBAT_STARTING_CREDITS)).toBe(true);
    expect(offers.every((offer) => offer.prices.three > COMBAT_STARTING_CREDITS)).toBe(true);
    expect(COMBAT_STARTING_CREDITS).toBeLessThan(40); // ni siquiera abre de salida el rifle de asalto
  });

  it('ofrece mercenarios estables, los contrata y consume sólo batallas desplegadas', () => {
    const offers = mercenaryMarketOffers({ merit: 90, rotationKey: '2026-08-25' });
    expect(new Set(offers.map((entry) => entry.type)).size).toBe(3);
    expect(new Set(offers.map((entry) => entry.alias)).size).toBe(3);
    expect(offers).toEqual(mercenaryMarketOffers({ merit: 90, rotationKey: '2026-08-25' }));
    const offer = offers[0];
    expect(offer.specialtyLabel).toBeTruthy();
    expect(offer.specialtyDescription).toBeTruthy();
    expect((offer.fieldBonus.strength || 0) + (offer.fieldBonus.speed || 0)).toBeGreaterThan(0);
    const hired = hireMercenary({ credits: 500, pieces: {}, identities: {}, unitRecords: {} }, offer, 'three', 1000);
    const key = Object.keys(hired.pieces).find((candidate) => candidate.includes('-merc-'));
    expect(key).toBeTruthy();
    expect(hired.pieces[key].mercenary.battlesRemaining).toBe(3);
    expect(hired.pieces[key].mercenary.specialtyLabel).toBe(offer.specialtyLabel);
    expect(hired.pieces[key].equipmentId).toBe(offer.equipmentId);
    expect(settleMercenaryContracts(hired, []).roster).toBe(hired);
    const one = settleMercenaryContracts(hired, [key]).roster;
    expect(one.pieces[key].mercenary.battlesRemaining).toBe(2);
  });
  it('premia preservar tropas y una captura difícil sin hacer rentable perder a propósito', () => {
    const clean = battleCreditReward({ outcome: 'win', captures: 3, casualties: 0, floor: 2, variant: 'roguelike' });
    const bloody = battleCreditReward({ outcome: 'win', captures: 3, casualties: 7, floor: 2, variant: 'roguelike' });
    expect(clean.preservation).toBe(5);
    expect(bloody.preservation).toBe(0);
    expect(clean.total).toBeGreaterThan(bloody.total);

    const farmedLoss = battleCreditReward({ outcome: 'loss', captures: 12, underdogCredits: 30, tacticalCredits: 30 });
    expect(farmedLoss.total).toBe(8);
    expect(farmedLoss.capped).toBeGreaterThan(0);
  });

  it('reconoce mérito táctico aunque el dado niegue una captura peón contra dama', () => {
    const fen = '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1';
    const attacker = { type: 'p' };
    const defender = { type: 'q' };
    const hit = combatCreditSignalForAttempt({ fen, from: 'e4', to: 'd5', attacker, defender, hit: true });
    const miss = combatCreditSignalForAttempt({ fen, from: 'e4', to: 'd5', attacker, defender, hit: false });
    expect(hit.underdogCredits).toBe(3);
    expect(miss.underdogCredits).toBe(0);
    expect(miss.tacticalCredits).toBeGreaterThanOrEqual(2);
  });

  it('stress de campaña separa juego limpio, juego medio y farmeo de derrotas sin barra libre', () => {
    const totalEquipmentCost = COMBAT_EQUIPMENT.reduce((sum, item) => sum + item.cost, 0);
    const project = (rows) => rows.reduce((credits, row, index) => credits + battleCreditReward({
      floor: index + 1,
      variant: 'roguelike',
      encounterTier: index === 6 ? 'boss' : index === 4 ? 'elite' : 'normal',
      ...row,
    }).total, COMBAT_STARTING_CREDITS);

    const skilled = project(Array.from({ length: 7 }, (_, index) => ({
      outcome: 'win',
      captures: index >= 4 ? 4 : 3,
      casualties: index < 4 ? 0 : 1,
      underdogCredits: 1,
      tacticalCredits: 2,
    })));
    const steady = project(Array.from({ length: 7 }, (_, index) => ({
      outcome: index === 2 ? 'loss' : 'win',
      captures: 3,
      casualties: index === 2 ? 5 : 2,
      tacticalCredits: 1,
    })));
    const reckless = project(Array.from({ length: 7 }, (_, index) => ({
      outcome: [0, 3, 6].includes(index) ? 'win' : 'loss',
      captures: 6,
      casualties: 6,
      underdogCredits: 3,
      tacticalCredits: 3,
    })));
    const lossFarm = project(Array.from({ length: 7 }, () => ({
      outcome: 'loss', captures: 12, casualties: 15, underdogCredits: 30, tacticalCredits: 30,
    })));

    expect(skilled).toBeGreaterThan(steady);
    expect(steady).toBeGreaterThan(reckless);
    expect(reckless).toBeGreaterThan(lossFarm);
    // Una campaña casi perfecta puede equipar cinco veteranos distintos al
    // final, pero ni siquiera deja saldo para duplicar el artículo más barato.
    expect(skilled).toBeGreaterThanOrEqual(totalEquipmentCost);
    expect(skilled).toBeLessThan(totalEquipmentCost + Math.min(...COMBAT_EQUIPMENT.map((item) => item.cost)));
    // Perder a propósito siete veces da algo de recuperación, jamás una economía viable.
    expect(lossFarm).toBeLessThan(100);
  });

  it('la campaña completa deja progreso útil, pero no compra todo el arsenal gratis', () => {
    const conservative = Array.from({ length: 7 }, (_, index) => battleCreditReward({
      outcome: 'win', captures: 3, casualties: index < 4 ? 1 : 2, floor: index + 1,
      encounterTier: index === 6 ? 'boss' : index === 4 ? 'elite' : 'normal', variant: 'roguelike',
    }).total).reduce((sum, value) => sum + value, COMBAT_STARTING_CREDITS);
    const reckless = Array.from({ length: 7 }, (_, index) => battleCreditReward({
      outcome: index % 3 === 2 ? 'loss' : 'win', captures: 6, casualties: 6, floor: index + 1, variant: 'roguelike',
    }).total).reduce((sum, value) => sum + value, COMBAT_STARTING_CREDITS);
    expect(conservative).toBeGreaterThan(reckless);
    expect(conservative).toBeLessThan(220);
    expect(reckless).toBeGreaterThan(COMBAT_STARTING_CREDITS);
  });

});

describe('mercado táctico rotatorio', () => {
  it('ofrece un catálogo corto y determinista de equipo', () => {
    const a = equipmentMarketOffers({ rotationKey: '2026-08-27' });
    const b = equipmentMarketOffers({ rotationKey: '2026-08-27' });
    expect(a).toHaveLength(3);
    expect(a.map((item) => item.id)).toEqual(b.map((item) => item.id));
    expect(new Set(a.map((item) => item.id)).size).toBe(3);
  });

  it('las especialidades de mercenario cambian de verdad su reparto de stats', () => {
    const offers = mercenaryMarketOffers({ merit: 180, rotationKey: '2026-08-27' });
    const scout = offers.find((offer) => offer.specialtyId === 'scout');
    const assault = offers.find((offer) => offer.specialtyId === 'assault');
    if (scout) expect(scout.speedPoints).toBeGreaterThanOrEqual(scout.strengthPoints);
    if (assault) expect(assault.strengthPoints).toBeGreaterThanOrEqual(assault.speedPoints);
  });
});

