import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_MATERIAL_ATLAS,
  CHRONICLES_MATERIAL_ENVIRONMENTS,
  chroniclesMaterialEnvironmentForMapId,
  chroniclesMaterialPlanForScene,
  chroniclesMaterialProfile,
} from './chroniclesMaterialAtlas.js';

describe('Chronicles semantic material atlas', () => {
  it('keeps the approved mock families addressable by stable texture ids', () => {
    expect(Object.keys(CHRONICLES_MATERIAL_ATLAS)).toHaveLength(30);
    expect(chroniclesMaterialProfile('D01').label).toBe('Piedra oscura');
    expect(chroniclesMaterialProfile('C01').label).toBe('Piedra caliza');
    expect(chroniclesMaterialProfile('E05').label).toBe('Roca natural');
    expect(chroniclesMaterialProfile('N06').label).toBe('Pared húmeda');
    expect(chroniclesMaterialProfile('V05').label).toBe('Ladrillo ruinoso');
  });

  it('maps shipped map archetypes to semantically compatible environment families', () => {
    expect(chroniclesMaterialEnvironmentForMapId('crypt-eight-squares')).toBe('dungeon');
    expect(chroniclesMaterialEnvironmentForMapId('gallery-of-forks')).toBe('castle-interior');
    expect(chroniclesMaterialEnvironmentForMapId('echo-cistern')).toBe('cave-water');
    expect(chroniclesMaterialEnvironmentForMapId('hollow-bell-tower')).toBe('exterior');
    expect(chroniclesMaterialEnvironmentForMapId('iron-foundry')).toBe('iron-foundry');
    expect(chroniclesMaterialEnvironmentForMapId('black-glass-chapel')).toBe('black-glass');
  });

  it('keeps future cave and mountain maps inside the cave family instead of random cross-biome mixing', () => {
    expect(chroniclesMaterialEnvironmentForMapId('mountain-cavern-01')).toBe('cave');
    expect(chroniclesMaterialEnvironmentForMapId('old-silver-mine')).toBe('cave');
    expect(chroniclesMaterialEnvironmentForMapId('flooded-sewer')).toBe('cave-water');
    [...CHRONICLES_MATERIAL_ENVIRONMENTS['cave-water'].wall, ...CHRONICLES_MATERIAL_ENVIRONMENTS['cave-water'].floor]
      .forEach((id) => expect(id.startsWith('N')).toBe(true));
    expect(CHRONICLES_MATERIAL_ENVIRONMENTS['cave-water'].floor).toEqual(['N01', 'N05', 'N06']);
  });

  it('derives deterministic profile variation from the actual procedural layout', () => {
    const base = {
      mapId: 'crypt-eight-squares',
      width: 7,
      height: 7,
      walls: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      floors: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
    };
    const same = chroniclesMaterialPlanForScene(base);
    const replay = chroniclesMaterialPlanForScene({ ...base });
    const changed = chroniclesMaterialPlanForScene({
      ...base,
      walls: [...base.walls, { x: 3, y: 2 }],
    });

    expect(replay).toEqual(same);
    expect(changed.seed).not.toBe(same.seed);
    expect(same.environmentId).toBe('dungeon');
    expect(same.wallProfileIds).toHaveLength(3);
    expect(same.floorProfileIds).toHaveLength(2);
    same.wallProfileIds.forEach((id) => expect(CHRONICLES_MATERIAL_ENVIRONMENTS.dungeon.wall).toContain(id));
    same.floorProfileIds.forEach((id) => expect(CHRONICLES_MATERIAL_ENVIRONMENTS.dungeon.floor).toContain(id));
  });

  it('does not spray prop-only wood, metal, stalactite or organic profiles onto structural walls/floors', () => {
    const structuralIds = Object.values(CHRONICLES_MATERIAL_ENVIRONMENTS)
      .flatMap((environment) => [...environment.wall, ...environment.floor]);
    expect(structuralIds).not.toContain('V01');
    expect(structuralIds).not.toContain('V02');
    expect(structuralIds).not.toContain('N04');
    expect(structuralIds).not.toContain('V06');
  });
});
