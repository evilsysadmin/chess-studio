import { afterEach, describe, expect, it } from 'vitest';
import {
  COMBAT_STARTING_CREDITS,
  awardCombatCredits,
  battleCreditReward,
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
    expect(win).toEqual({ total: 18, captures: 8, result: 6, sector: 4 });
    expect(loss.total).toBe(4);
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

  it('ofrece mercenarios estables, los contrata y consume sólo batallas desplegadas', () => {
    const offers = mercenaryMarketOffers({ merit: 90, rotationKey: '2026-08-25' });
    expect(new Set(offers.map((entry) => entry.type)).size).toBe(3);
    expect(new Set(offers.map((entry) => entry.alias)).size).toBe(3);
    expect(offers).toEqual(mercenaryMarketOffers({ merit: 90, rotationKey: '2026-08-25' }));
    const offer = offers[0];
    expect(offer.specialtyLabel).toBeTruthy();
    expect(offer.specialtyDescription).toBeTruthy();
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

