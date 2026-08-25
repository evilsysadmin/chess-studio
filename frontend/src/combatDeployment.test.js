import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { createInitialRegistry, rosterKeyFor } from './combat.js';
import { expireDeadPieces, loadRoster, saveSurvivorsToRoster } from './combatRoster.js';
import { setRosterDeploymentType } from './combatMetamorphosis.js';
import {
  annotateRegistryWithDeployment,
  autofillDeployment,
  applyDeploymentToPosition,
  deploymentSummary,
  effectiveDeploymentType,
  ensureDeploymentState,
  firstFreeDeploymentSlotForUnit,
  grantReserveRecruit,
  isUnitCompatibleWithSlot,
  removeDeploymentUnit,
  setDeploymentUnit,
} from './combatDeployment.js';

beforeEach(() => localStorage.clear());

function unlockKnightForm(roster, key = 'p-a') {
  const identityId = roster.identities[key].identityId;
  const pieces = {
    ...roster.pieces,
    [key]: {
      strengthPoints: 7,
      speedPoints: 0,
      bankedXp: 0,
      alive: true,
      deploymentType: null,
      unlockedTechniques: [],
      equippedTechnique: null,
    },
  };
  const unitRecords = {
    ...roster.unitRecords,
    [identityId]: {
      ...roster.unitRecords[identityId],
      stats: { ...roster.unitRecords[identityId].stats, battles: 3, survivals: 3 },
    },
  };
  return { ...roster, pieces, unitRecords };
}

describe('Combat Chess deployment board', () => {
  it('migra un roster clásico a una formación completa de 16 puestos', () => {
    const roster = loadRoster();
    const summary = deploymentSummary(roster);
    expect(summary.ready).toBe(true);
    expect(summary.assignedCount).toBe(16);
    expect(summary.reserveCount).toBe(0);
  });


  it('enviar a reserva conserva el hueco y no recoloca mágicamente la unidad', () => {
    let roster = loadRoster();
    roster = removeDeploymentUnit(roster, 'r-a');
    expect(roster.deployment['r-a']).toBeUndefined();
    expect(deploymentSummary(roster).reserveKeys).toContain('r-a');
    expect(deploymentSummary(roster).assignedCount).toBe(15);

    // Volver a normalizar no debe deshacer la decisión explícita del jugador.
    roster = ensureDeploymentState(roster);
    expect(roster.deployment['r-a']).toBeUndefined();
    expect(deploymentSummary(roster).assignedCount).toBe(15);
  });

  it('las bajas pendientes se muestran como caídas y sus reemplazos vuelven al barracón', () => {
    let roster = loadRoster();
    roster = {
      ...roster,
      pieces: {
        ...roster.pieces,
        'p-a': { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: false },
        'p-f': { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: false },
      },
    };
    roster = ensureDeploymentState(roster);
    let summary = deploymentSummary(roster);
    expect(summary.totalRoster).toBe(14);
    expect(summary.fallenCount).toBe(2);
    expect(summary.totalIdentities).toBe(16);
    expect(summary.assignedCount).toBe(14);

    roster = expireDeadPieces(roster, '2026-08-22T22:00:00.000Z');
    summary = deploymentSummary(roster);
    expect(summary.totalRoster).toBe(16);
    expect(summary.fallenCount).toBe(0);
    expect(summary.reserveCount).toBe(0);
    expect(summary.assignedCount).toBe(16);
  });

  it('un reemplazo no se autodespliega cuando ya hay una reserva compatible', () => {
    let roster = grantReserveRecruit(loadRoster(), { grantId: 'replacement:priority', originType: 'p', rng: () => 0.1, now: 1000 });
    roster = {
      ...roster,
      pieces: { ...roster.pieces, 'p-a': { ...roster.pieces['p-a'], alive: false } },
    };
    const replaced = expireDeadPieces(ensureDeploymentState(roster), '2026-08-22T22:00:00.000Z');
    const summary = deploymentSummary(replaced);
    expect(summary.assignedCount).toBe(15);
    expect(summary.reserveCount).toBe(2);
    expect(summary.deployedKeys).not.toContain('p-a');
  });

  it('un refuerzo aumenta el barracón por encima de 16 pero nace en reserva', () => {
    const roster = loadRoster();
    const next = grantReserveRecruit(roster, { grantId: 'campaign:test:camp', originType: 'p', rng: () => 0.1, now: 1000 });
    const summary = deploymentSummary(next);
    expect(summary.totalRoster).toBe(17);
    expect(summary.assignedCount).toBe(16);
    expect(summary.reserveCount).toBe(1);
  });

  it('el grantId impide farmear el mismo refuerzo dos veces', () => {
    const roster = loadRoster();
    const once = grantReserveRecruit(roster, { grantId: 'campaign:test:elite', originType: 'n', rng: () => 0.2, now: 2000 });
    const twice = grantReserveRecruit(once, { grantId: 'campaign:test:elite', originType: 'n', rng: () => 0.3, now: 3000 });
    expect(deploymentSummary(twice).totalRoster).toBe(deploymentSummary(once).totalRoster);
  });

  it('la compatibilidad del slot usa el tipo de ORIGEN: un peón mutante sigue yendo a puesto de peón', () => {
    let roster = unlockKnightForm(loadRoster());
    roster = ensureDeploymentState(setRosterDeploymentType(roster, 'p-a', 'n'));
    expect(effectiveDeploymentType(roster, 'p-a')).toBe('n');
    expect(isUnitCompatibleWithSlot(roster, 'p-a', 'p-a')).toBe(true);
    expect(isUnitCompatibleWithSlot(roster, 'p-a', 'n-b')).toBe(false);
    expect(deploymentSummary(roster).ready).toBe(true);
  });

  it('un peón metamorfoseado conserva rosterKey de peón aunque el tablero lo dibuje/mueva como caballo', () => {
    let roster = unlockKnightForm(loadRoster());
    roster = ensureDeploymentState(setRosterDeploymentType(roster, 'p-a', 'n'));
    const chess = new Chess();
    applyDeploymentToPosition(chess, roster, 'w');
    const registry = annotateRegistryWithDeployment(createInitialRegistry(chess), roster, 'w');
    expect(registry.a2.type).toBe('n');
    expect(registry.a2.originType).toBe('p');
    expect(rosterKeyFor(registry.a2)).toBe('p-a');
  });

  it('intercambia una reserva del mismo origen y deja a la unidad anterior en reserva', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'campaign:test:reserve', originType: 'p', rng: () => 0.4, now: 4000 });
    const reserveKey = deploymentSummary(roster).reserveKeys[0];
    roster = setDeploymentUnit(roster, 'p-a', reserveKey);
    const summary = deploymentSummary(roster);
    expect(roster.deployment['p-a']).toBe(reserveKey);
    expect(summary.reserveKeys).toContain('p-a');
    expect(summary.ready).toBe(true);
  });

  it('doble clic de banquillo puede elegir de forma determinista el primer slot compatible libre', () => {
    let roster = loadRoster();
    roster = removeDeploymentUnit(roster, 'p-a');
    roster = removeDeploymentUnit(roster, 'p-b');
    roster = grantReserveRecruit(roster, { grantId: 'campaign:test:first-free', originType: 'p', rng: () => 0.42, now: 4200 });
    const reserveKey = deploymentSummary(roster).reserveKeys.find((key) => key.startsWith('p-reserve-'));
    expect(reserveKey).toBeTruthy();
    expect(firstFreeDeploymentSlotForUnit(roster, reserveKey)?.key).toBe('p-a');

    roster = setDeploymentUnit(roster, 'p-a', reserveKey);
    expect(firstFreeDeploymentSlotForUnit(roster, 'p-b')?.key).toBe('p-b');
  });

  it('la acción rápida no expulsa una unidad si no queda un slot compatible libre', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'campaign:test:no-free', originType: 'p', rng: () => 0.43, now: 4300 });
    const reserveKey = deploymentSummary(roster).reserveKeys.find((key) => key.startsWith('p-reserve-'));
    expect(firstFreeDeploymentSlotForUnit(roster, reserveKey)).toBeNull();
  });

  it('auto-fill puede priorizar veteranos o reclutas del mismo tipo sin romper slots', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'campaign:test:auto', originType: 'p', rng: () => 0.7, now: 7000 });
    const reserveKey = deploymentSummary(roster).reserveKeys[0];
    roster = {
      ...roster,
      pieces: {
        ...roster.pieces,
        'p-a': { ...roster.pieces['p-a'], strengthPoints: 6 },
        [reserveKey]: { ...roster.pieces[reserveKey], strengthPoints: 0 },
      },
    };
    const veterans = autofillDeployment(roster, { preferVeterans: true });
    expect(Object.values(veterans.deployment)).toContain('p-a');
    expect(deploymentSummary(veterans).ready).toBe(true);
    const recruits = autofillDeployment(roster, { preferVeterans: false });
    expect(Object.values(recruits.deployment)).toContain(reserveKey);
    expect(deploymentSummary(recruits).ready).toBe(true);
  });

  it('una reserva no desplegada no se marca muerta al guardar bajas de los participantes', () => {
    let roster = loadRoster();
    roster = grantReserveRecruit(roster, { grantId: 'campaign:test:safe-reserve', originType: 'p', rng: () => 0.5, now: 5000 });
    const reserveKey = deploymentSummary(roster).reserveKeys[0];
    const participantKeys = Object.values(roster.deployment).filter((key) => key !== 'k-e');
    const next = saveSurvivorsToRoster({}, roster, 'w', 'loss', participantKeys);
    expect(next.pieces[reserveKey]?.alive).not.toBe(false);
  });
});
