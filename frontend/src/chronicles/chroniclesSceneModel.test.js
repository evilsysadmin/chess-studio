import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesMapIds } from './chroniclesMapCatalog.js';
import {
  CHRONICLES_SCENE_MODEL_VERSION,
  chroniclesProjectSceneModel,
  chroniclesValidateSceneModel,
} from './chroniclesSceneModel.js';

describe('Chronicles scene model projection', () => {
  it('projects gameplay state into a deterministic renderer-only contract', () => {
    const state = {
      ...createChroniclesState(),
      enemyPositions: { 'corrupted-pawn': { x: 2, y: 4 } },
    };
    const interaction = {
      mode: 'hybrid',
      legalMoves: [{ x: state.x + 1, y: state.y }],
      legalTargets: [{ enemyId: 'corrupted-pawn', x: 2, y: 4, hp: 4, damage: 99 }],
    };

    const first = chroniclesProjectSceneModel(state, {
      selectedMemberId: 'bishop',
      interaction,
    });
    const second = chroniclesProjectSceneModel(state, {
      selectedMemberId: 'bishop',
      interaction,
    });

    expect(first).toEqual(second);
    expect(first.version).toBe(CHRONICLES_SCENE_MODEL_VERSION);
    expect(first.mapId).toBe(state.mapId);
    expect(first.focusCell).toEqual({ x: state.x, y: state.y });
    expect(first.selectedMemberId).toBe('bishop');
    expect(first.party).toHaveLength(4);
    expect(first.enemies.find((enemy) => enemy.id === 'corrupted-pawn')).toMatchObject({
      visible: true,
      cell: { x: 2, y: 4 },
    });
    expect(first.interaction).toEqual({
      mode: 'hybrid',
      legalMoves: [{ x: state.x + 1, y: state.y }],
      legalTargets: [{ enemyId: 'corrupted-pawn', x: 2, y: 4 }],
    });
  });

  it('projects every shipped map through the same renderer contract', () => {
    chroniclesMapIds().forEach((mapId) => {
      const state = createChroniclesState(mapId);
      const model = chroniclesProjectSceneModel(state);

      expect(model.mapId).toBe(mapId);
      expect(model.scenePlan.mapId).toBe(mapId);
      expect(new Set(model.party.map((member) => member.id)).size).toBe(model.party.length);
      expect(new Set(model.enemies.map((enemy) => enemy.id)).size).toBe(model.enemies.length);
      expect(() => JSON.stringify(model)).not.toThrow();
      expect(chroniclesValidateSceneModel(model)).toBe(model);
    });
  });

  it('fails closed when a renderer receives a malformed scene model', () => {
    const valid = chroniclesProjectSceneModel(createChroniclesState());

    expect(() => chroniclesValidateSceneModel({ ...valid, version: 999 })).toThrow(/version/i);
    expect(() => chroniclesValidateSceneModel({
      ...valid,
      focusCell: { x: Number.NaN, y: 1 },
    })).toThrow(/focusCell/i);
    expect(() => chroniclesValidateSceneModel({
      ...valid,
      enemies: [...valid.enemies, valid.enemies[0]],
    })).toThrow(/duplicate enemy/i);
  });

  it('does not leak RPG progression, narrative or combat-rule fields into the renderer contract', () => {
    const state = {
      ...createChroniclesState(),
      xp: 999,
      skillPoints: 9,
      quests: { forbidden: true },
      journal: [{ id: 'secret-lore', body: 'renderer must not care' }],
      rpgModifiers: { matthias: { attackDamageBonus: 50 } },
    };

    const model = chroniclesProjectSceneModel(state);
    const serialized = JSON.stringify(model);

    expect(model).not.toHaveProperty('xp');
    expect(model).not.toHaveProperty('skillPoints');
    expect(model).not.toHaveProperty('quests');
    expect(model).not.toHaveProperty('journal');
    expect(model).not.toHaveProperty('rpgModifiers');
    expect(serialized).not.toContain('secret-lore');
    expect(serialized).not.toContain('attackDamageBonus');
  });

  it('projects visibility and prop state before Three.js sees the frame', () => {
    const cryptState = {
      ...createChroniclesState(),
      enemyHp: 0,
    };
    const cryptModel = chroniclesProjectSceneModel(cryptState);
    const corruptedPawn = cryptModel.enemies.find((enemy) => enemy.id === 'corrupted-pawn');

    expect(corruptedPawn.visible).toBe(false);
    expect(corruptedPawn.cell).toBeNull();

    const galleryState = {
      ...createChroniclesState('gallery-of-forks'),
      galleryLeverPulled: true,
      galleryRelicCollected: false,
    };
    const galleryModel = chroniclesProjectSceneModel(galleryState);
    expect(galleryModel.worldObjects).toMatchObject({
      leverActivated: true,
      pickupVisible: true,
    });
  });
});
