import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadRoster,
  applyRosterToRegistry,
  saveSurvivorsToRoster,
  revivePiece,
  expireDeadPieces,
  resetRoster,
  renameRosterIdentity,
} from './combatRoster.js';
import { createInitialRegistry } from './combat.js';
import { Chess } from 'chess.js';

beforeEach(() => localStorage.clear());

describe('loadRoster', () => {
  it('migra bajas antiguas sin progreso sin borrar su identidad antes del Memorial', () => {
    localStorage.setItem(
      'chess-study-combat-roster',
      JSON.stringify({
        pieces: {
          'r-h': { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: false },
          'q-d': { strengthPoints: 3, speedPoints: 2, bankedXp: 0, alive: false },
        },
        combatXp: 50,
        revivesUsed: 0,
      })
    );

    const loaded = loadRoster();
    expect(loaded.pieces['r-h']).toMatchObject({ alive: false, strengthPoints: 0, speedPoints: 0 });
    expect(loaded.pieces['q-d']).toBeDefined();
    expect(loaded.identities['r-h']?.identityId).toBeTruthy();
    expect(loaded.unitRecords[loaded.identities['r-h'].identityId]).toBeDefined();

    const rawAfter = JSON.parse(localStorage.getItem('chess-study-combat-roster'));
    expect(rawAfter.pieces['r-h'].alive).toBe(false);
  });
});

describe('saveSurvivorsToRoster', () => {
  it('una pieza capturada CON progreso real queda marcada muerta, NO conserva su nivel de antes', () => {
    // Esto es justamente el bug que se encontró y arregló: antes, una pieza
    // capturada se quedaba con el progreso de ANTES de la partida en vez de
    // "morir" de verdad.
    const startRoster = { pieces: { 'n-b': { strengthPoints: 4, speedPoints: 4, bankedXp: 0, alive: true } }, combatXp: 0 };
    const registryWithoutKnight = {}; // el caballo ya no está: lo capturaron
    const next = saveSurvivorsToRoster(registryWithoutKnight, startRoster, 'w', 'loss');
    expect(next.pieces['n-b'].alive).toBe(false);
  });

  it('una pieza capturada en nivel 1 queda como baja no revivible hasta entrar al Memorial', () => {
    const next = saveSurvivorsToRoster({}, { pieces: {}, combatXp: 0 }, 'w', 'loss');
    expect(next.pieces['n-b']).toMatchObject({ alive: false, strengthPoints: 0, speedPoints: 0 });
    expect(next.identities['n-b']?.identityId).toBeTruthy();
  });

  it('solo guarda piezas del color del humano, nunca las del rival', () => {
    // Registro con las 16 piezas de cada bando, todas presentes (nadie
    // capturado), solo para chequear que ninguna clave del rival se cuele.
    const registry = {
      d1: { id: 'w-q-d1', type: 'q', color: 'w', square: 'd1', strengthPoints: 1, speedPoints: 0, bankedXp: 0 },
      d8: { id: 'b-q-d8', type: 'q', color: 'b', square: 'd8', strengthPoints: 5, speedPoints: 5, bankedXp: 0 },
      ...Object.fromEntries(
        ['a1', 'b1', 'c1', 'e1', 'f1', 'g1', 'h1', 'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2']
          .map((sq, i) => [sq, { id: `w-p-${sq}`, type: 'p', color: 'w', square: sq, strengthPoints: 0, speedPoints: 0, bankedXp: 0 }]),
      ),
    };
    const next = saveSurvivorsToRoster(registry, { pieces: {}, combatXp: 0 }, 'w', 'win');
    // si se hubiera colado la dama negra (strengthPoints:5), este valor
    // sería otro — confirma que la del rival nunca pisa la del humano.
    expect(next.pieces['q-d'].strengthPoints).toBe(1);
    expect(next.pieces['q-d'].alive).toBe(true);
  });


  it('conserva el loadout elegido de una pieza viva al guardar la batalla', () => {
    const registry = {
      a4: { id: 'w-p-a2', type: 'n', color: 'w', square: 'a4', strengthPoints: 3, speedPoints: 2, bankedXp: 5, deploymentType: 'n' },
    };
    const next = saveSurvivorsToRoster(registry, { pieces: {}, combatXp: 0 }, 'w', 'win');
    expect(next.pieces['p-a']).toMatchObject({ alive: true, deploymentType: 'n', strengthPoints: 3, speedPoints: 2, bankedXp: 5 });
  });

  it('conserva el loadout mientras la pieza está caída y si se revive', () => {
    const roster = { pieces: { 'p-a': { strengthPoints: 4, speedPoints: 4, bankedXp: 0, alive: true, deploymentType: 'b' } }, combatXp: 50 };
    const dead = saveSurvivorsToRoster({}, roster, 'w', 'loss');
    expect(dead.pieces['p-a']).toMatchObject({ alive: false, deploymentType: 'b' });
    const revived = revivePiece(dead, 'p-a', 'b');
    expect(revived.pieces['p-a']).toMatchObject({ alive: true, deploymentType: 'b', strengthPoints: 2, speedPoints: 2 });
  });

  it('otorga XP de combate según el resultado (ganar > tablas > perder)', () => {
    const win = saveSurvivorsToRoster({}, { pieces: {}, combatXp: 0 }, 'w', 'win');
    const draw = saveSurvivorsToRoster({}, { pieces: {}, combatXp: 0 }, 'w', 'draw');
    const loss = saveSurvivorsToRoster({}, { pieces: {}, combatXp: 0 }, 'w', 'loss');
    expect(win.combatXp).toBeGreaterThan(draw.combatXp);
    expect(draw.combatXp).toBeGreaterThan(loss.combatXp);
  });
  it('el rey nunca entra al roster, aunque haya sobrevivido con XP', () => {
    const registry = {
      e1: { id: 'w-k-e1', type: 'k', color: 'w', square: 'e1', strengthPoints: 0, speedPoints: 0, bankedXp: 50 },
    };
    const next = saveSurvivorsToRoster(registry, { pieces: {}, combatXp: 0 }, 'w', 'win');
    // el rey nunca debe aparecer como clave, ni vivo ni muerto — no participa del roster
    expect(next.pieces['k-e']).toBeUndefined();
  });
});

describe('applyRosterToRegistry', () => {
  it('una pieza muerta (no revivida) arranca fresca, no con su nivel viejo', () => {
    const roster = { pieces: { 'q-d': { strengthPoints: 6, speedPoints: 6, bankedXp: 0, alive: false } }, combatXp: 0 };
    const fresh = applyRosterToRegistry(createInitialRegistry(new Chess()), roster, 'w');
    expect(fresh.d1.strengthPoints).toBe(0);
    expect(fresh.d1.speedPoints).toBe(0);
  });

  it('una pieza viva aplica su progreso guardado', () => {
    const roster = { pieces: { 'q-d': { strengthPoints: 3, speedPoints: 2, bankedXp: 1, alive: true } }, combatXp: 0 };
    const applied = applyRosterToRegistry(createInitialRegistry(new Chess()), roster, 'w');
    expect(applied.d1.strengthPoints).toBe(3);
    expect(applied.d1.speedPoints).toBe(2);
  });

  it('nunca toca las piezas del color rival, aunque tengan progreso guardado', () => {
    const roster = { pieces: { 'q-d': { strengthPoints: 8, speedPoints: 8, bankedXp: 0, alive: true } }, combatXp: 0 };
    // el humano juega NEGRAS esta vez: las blancas (rival) no deberian tocarse
    const applied = applyRosterToRegistry(createInitialRegistry(new Chess()), roster, 'b');
    expect(applied.d1.strengthPoints).toBe(0); // dama blanca (rival) intacta
    expect(applied.d8.strengthPoints).toBe(8); // dama negra (humano) con el progreso
  });
});

describe('revivePiece', () => {
  it('revive con la MITAD de los puntos que tenía al morir, no intacta', () => {
    const roster = { pieces: { 'q-d': { strengthPoints: 6, speedPoints: 4, bankedXp: 0, alive: false } }, combatXp: 100 };
    const revived = revivePiece(roster, 'q-d', 'q');
    expect(revived.pieces['q-d'].strengthPoints).toBe(3);
    expect(revived.pieces['q-d'].speedPoints).toBe(2);
    expect(revived.pieces['q-d'].alive).toBe(true);
  });

  it('al revivir conserva identidad y técnicas desbloqueadas', () => {
    const roster = {
      pieces: { 'p-a': { strengthPoints: 6, speedPoints: 4, bankedXp: 0, alive: false, unlockedTechniques: ['line_fire'], equippedTechnique: 'line_fire' } },
      identities: { 'p-a': { alias: 'Starky', identityId: 'unit-starky' } },
      combatXp: 100,
      revivesUsed: 0,
    };
    const revived = revivePiece(roster, 'p-a', 'p');
    expect(revived.identities['p-a']).toEqual(roster.identities['p-a']);
    expect(revived.pieces['p-a'].unlockedTechniques).toEqual(['line_fire']);
    expect(revived.pieces['p-a'].equippedTechnique).toBe('line_fire');
    expect(revived.unitRecords['unit-starky'].stats.revives).toBe(1);
  });

  it('no revive si no alcanza el XP de combate', () => {
    const roster = { pieces: { 'q-d': { strengthPoints: 6, speedPoints: 6, bankedXp: 0, alive: false } }, combatXp: 1 };
    const result = revivePiece(roster, 'q-d', 'q'); // la dama cuesta 30
    expect(result).toBe(roster); // no cambia nada
  });

  it('no hace nada si la pieza no está muerta', () => {
    const roster = { pieces: { 'q-d': { strengthPoints: 1, speedPoints: 1, bankedXp: 0, alive: true } }, combatXp: 100 };
    const result = revivePiece(roster, 'q-d', 'q');
    expect(result).toBe(roster);
  });

  it('guard defensivo: no revive una pieza sin progreso real (nada que devolver)', () => {
    const roster = { pieces: { 'q-d': { strengthPoints: 0, speedPoints: 0, bankedXp: 0, alive: false } }, combatXp: 100 };
    const result = revivePiece(roster, 'q-d', 'q');
    expect(result).toBe(roster); // sin cambios, aunque sobre XP de combate
  });
});

describe('expireDeadPieces — la ventana de revivir se cierra', () => {
  it('una pieza muerta sin revivir desaparece del roster (queda fresca para siempre)', () => {
    const roster = {
      pieces: {
        'n-b': { strengthPoints: 4, speedPoints: 4, bankedXp: 0, alive: false },
        'q-d': { strengthPoints: 2, speedPoints: 1, bankedXp: 3, alive: true },
      },
      combatXp: 3,
    };
    const expired = expireDeadPieces(roster);
    expect(expired.pieces['n-b']).toBeUndefined();
    expect(expired.pieces['q-d']).toEqual(roster.pieces['q-d']); // la viva no se toca
  });

  it('si se revivió a tiempo, sobrevive el cierre de la ventana', () => {
    let roster = { pieces: { 'q-d': { strengthPoints: 6, speedPoints: 6, bankedXp: 0, alive: false } }, combatXp: 30 };
    roster = revivePiece(roster, 'q-d', 'q');
    const expired = expireDeadPieces(roster);
    expect(expired.pieces['q-d'].alive).toBe(true);
    expect(expired.pieces['q-d'].strengthPoints).toBe(3);
  });

  it('una baja definitiva recibe identidad nueva al ser reemplazada por nivel 1', () => {
    const roster = {
      pieces: { 'p-a': { strengthPoints: 3, speedPoints: 2, bankedXp: 0, alive: false } },
      identities: { 'p-a': { alias: 'Starky', identityId: 'old-starky' } },
      combatXp: 0,
    };
    const expired = expireDeadPieces(roster, '2026-08-21T20:00:00.000Z');
    expect(expired.pieces['p-a']).toBeUndefined();
    expect(expired.identities['p-a']).toBeDefined();
    expect(expired.identities['p-a'].identityId).not.toBe('old-starky');
    expect(expired.memorial).toHaveLength(1);
    expect(expired.memorial[0]).toMatchObject({ identityId: 'old-starky', alias: 'Starky', finalLevel: 6, finalRankLabel: 'Capitán' });
    expect(expired.unitRecords['old-starky']).toBeUndefined();
    expect(expired.unitRecords[expired.identities['p-a'].identityId]).toBeDefined();
  });
});


describe('resetRoster', () => {
  it('el reset específico crea y persiste un regimiento nuevo con identidades', () => {
    localStorage.setItem('chess-study-combat-roster', JSON.stringify({ pieces: { 'p-a': { strengthPoints: 9 } }, combatXp: 99 }));
    const fresh = resetRoster();
    const stored = JSON.parse(localStorage.getItem('chess-study-combat-roster'));
    expect(stored.combatXp).toBe(0);
    expect(stored.identities).toEqual(fresh.identities);
    expect(Object.keys(stored.identities).length).toBeGreaterThan(0);
  });

  it('puede limpiar sin repersistir para el reset global de progreso', () => {
    localStorage.setItem('chess-study-combat-roster', JSON.stringify({ combatXp: 99 }));
    const fresh = resetRoster({ persist: false });
    expect(fresh.combatXp).toBe(0);
    expect(Object.keys(fresh.identities).length).toBeGreaterThan(0);
    expect(localStorage.getItem('chess-study-combat-roster')).toBeNull();
  });
});


describe('renameRosterIdentity', () => {
  it('cambia el alias sin cambiar la identidad ni perder su expediente', () => {
    const roster = {
      identities: { 'p-a': { alias: 'Rivas', identityId: 'unit-rivas' } },
      unitRecords: { 'unit-rivas': { alias: 'Rivas', identityId: 'unit-rivas', stats: { battles: 7 } } },
      pieces: {}, combatXp: 0,
    };
    const next = renameRosterIdentity(roster, 'p-a', '  Martillo   Uno  ');
    expect(next.identities['p-a']).toMatchObject({ alias: 'Martillo Uno', identityId: 'unit-rivas' });
    expect(next.unitRecords['unit-rivas']).toMatchObject({ alias: 'Martillo Uno', identityId: 'unit-rivas', stats: { battles: 7 } });
  });
});
