import { describe, expect, it } from 'vitest';
import {
  CHRONICLES_MATERIAL_ATLAS,
  CHRONICLES_MATERIAL_ENVIRONMENTS,
  chroniclesMaterialEnvironmentForMapId,
  chroniclesMaterialEnvironmentForScene,
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

  it('uses exterior materials for authored settlements and wilderness instead of crypt stone', () => {
    expect(chroniclesMaterialEnvironmentForMapId('village-square')).toBe('exterior');
    expect(chroniclesMaterialEnvironmentForMapId('forest-road')).toBe('exterior');
    expect(chroniclesMaterialEnvironmentForScene({ mapId: 'ash-vault', regionKind: 'settlement' })).toBe('exterior');
    expect(chroniclesMaterialEnvironmentForScene({ mapId: 'unknown-location', regionKind: 'wilderness' })).toBe('exterior');
    expect(chroniclesMaterialEnvironmentForScene({ mapId: 'crypt-eight-squares', regionKind: 'dungeon' })).toBe('dungeon');
    const plan = chroniclesMaterialPlanForScene({ mapId: 'village-square', regionKind: 'settlement', walls: [], floors: [] });
    expect(plan.environmentId).toBe('exterior');
    plan.wallProfileIds.forEach((id) => expect(CHRONICLES_MATERIAL_ENVIRONMENTS.exterior.wall).toContain(id));
    plan.floorProfileIds.forEach((id) => expect(CHRONICLES_MATERIAL_ENVIRONMENTS.exterior.floor).toContain(id));
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

  it('honors an authored wall palette from the map instead of re-rolling it', () => {
    const plan = chroniclesMaterialPlanForScene({
      mapId: 'crypt-eight-squares',
      width: 7,
      height: 7,
      walls: [{ x: 0, y: 0 }],
      floors: [{ x: 1, y: 1 }],
      materials: {
        wallLegend: { 1: 'D01', 2: 'D02', 3: 'D03', 4: 'D04', 5: 'D05' },
        wallGrid: ['1234512', '1.....3', '2.345.4', '3...2.5', '4.1.3.1', '5.....2', '2345123'],
      },
    });

    expect(plan.wallProfileIds).toEqual(['D01', 'D02', 'D03', 'D04', 'D05']);
    expect(plan.floorProfileIds).toHaveLength(2);
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
