import { afterEach, describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsLegalMoves,
  chroniclesTacticsMove,
} from '../chroniclesOfMatthiasTactics.js';
import {
  chroniclesClearRuntimeMapDefinitions,
  chroniclesInstallRuntimeMapDefinition,
  chroniclesMapById,
  chroniclesMapIds,
} from './chroniclesMapCatalog.js';
import {
  chroniclesHeadlessSceneSignature,
  chroniclesHeadlessSceneSnapshot,
} from './chroniclesHeadlessScene.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

afterEach(() => chroniclesClearRuntimeMapDefinitions());

describe('Chronicles headless scene harness', () => {
  it('runs every shipped map without DOM or WebGL renderer state', () => {
    chroniclesMapIds().forEach((mapId) => {
      const snapshot = chroniclesHeadlessSceneSnapshot(createChroniclesState(mapId));
      expect(snapshot.mapId).toBe(mapId);
      expect(snapshot.geometry.width).toBeGreaterThan(0);
      expect(snapshot.geometry.height).toBeGreaterThan(0);
      expect(snapshot.geometry.floors.length).toBeGreaterThan(0);
      expect(snapshot.party.length).toBe(4);
      expect(() => JSON.stringify(snapshot)).not.toThrow();
    });
  });

  it('walks every shipped map headlessly through real legal movement', () => {
    chroniclesMapIds().forEach((mapId) => {
      let state = createChroniclesState(mapId);

      for (let step = 0; step < 6; step += 1) {
        const legalMoves = chroniclesTacticsLegalMoves(state);
        const snapshot = chroniclesHeadlessSceneSnapshot(state, {
          interaction: { mode: 'move', legalMoves, legalTargets: [] },
        });

        expect(snapshot.mapId).toBe(mapId);
        expect(snapshot.focusCell).toBe(`${state.x},${state.y}`);
        expect(snapshot.interaction?.legalMoves).toEqual(
          legalMoves.map((move) => `${move.x},${move.y}`),
        );
        expect(() => JSON.stringify(snapshot)).not.toThrow();

        if (!legalMoves.length) break;
        const chosen = legalMoves[step % legalMoves.length];
        const next = chroniclesTacticsMove(state, chosen);
        expect(next).not.toBe(state);
        expect([next.x, next.y]).toEqual([chosen.x, chosen.y]);
        state = next;
      }
    });
  });

  it('is deterministic and ignores RPG or narrative fields that cannot change rendering', () => {
    const state = createChroniclesState();
    const first = chroniclesHeadlessSceneSignature(state);
    const noisy = chroniclesHeadlessSceneSignature({
      ...state,
      xp: 99999,
      skillPoints: 42,
      rpgModifiers: { matthias: { attackDamageBonus: 99 } },
      journal: [{ id: 'noise', body: 'not renderer state' }],
    });

    expect(noisy).toBe(first);
    expect(chroniclesHeadlessSceneSignature(state)).toBe(first);
  });

  it('changes signature when a seeded runtime manifest changes dungeon geometry', () => {
    const authored = chroniclesHeadlessSceneSignature(createChroniclesState('crypt-eight-squares'));
    const remote = clone(chroniclesMapById('crypt-eight-squares'));
    remote.grid[2] = '#..##.#';
    remote.generation = {
      kind: 'seeded-layout',
      mapCode: 'CM1|theme=crypt|size=7x7|verbs=guardian|enemies=2|treasures=1|secrets=0|difficulty=2|seed=418',
      generatorVersion: 2,
      layoutRevision: 'c'.repeat(64),
    };
    chroniclesInstallRuntimeMapDefinition(remote);

    const generated = chroniclesHeadlessSceneSignature(createChroniclesState('crypt-eight-squares'));

    expect(generated).not.toBe(authored);
  });

  it('captures legal interaction without leaking combat numbers into the signature', () => {
    const state = createChroniclesState();
    const signature = chroniclesHeadlessSceneSnapshot(state, {
      selectedMemberId: 'bishop',
      interaction: {
        mode: 'hybrid',
        legalMoves: [{ x: state.x + 1, y: state.y, cost: 999 }],
        legalTargets: [{ enemyId: 'corrupted-pawn', x: 3, y: 5, damage: 999, hp: 999 }],
      },
    });

    expect(signature.selectedMemberId).toBe('bishop');
    expect(signature.interaction).toEqual({
      mode: 'hybrid',
      legalMoves: [`${state.x + 1},${state.y}`],
      legalTargets: ['corrupted-pawn@3,5'],
    });
    expect(JSON.stringify(signature)).not.toContain('999');
  });
});
