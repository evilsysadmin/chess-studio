import { describe, expect, it } from 'vitest';
import {
  homeBlenderLightProbeMode,
  homeBlenderWallTorchLayout,
  homeBlenderLightProbeLocksFullLod,
  HOME_BLENDER_LIGHT_PROBE_FAMILIES,
  applyHomeBlenderLightProbe,
  homeBlenderWallPairFillPlan,
} from './HomeBlenderLightProbe.js';

describe('opt-in Home GPU auxiliary-light isolation', () => {
  it('requires both explicit profiling flags; ordinary Home never changes', () => {
    for (const query of ['', '?homeLightProbe=aux-off', '?homeGpuProfile=1',
      '?homeGpuProfile=0&homeLightProbe=aux-off', '?homeGpuProfile=1&homeLightProbe=garbage']) {
      expect(homeBlenderLightProbeMode(query)).toBe('normal');
    }
    expect(homeBlenderLightProbeMode('?homeGpuProfile=1&homeLightProbe=aux-off')).toBe('aux-off');
    expect(homeBlenderLightProbeMode('homeGpuProfile=1&homeLightProbe=aux-off')).toBe('aux-off');
  });

  it('pins full LOD only inside an explicitly marked GPU A/B trial', () => {
    for (const query of ['', '?homeGpuProfile=1',
      '?homeLightProbe=normal',
      '?homeGpuProfile=1&homeLightProbe=unknown',
      '?homeGpuProfile=0&homeLightProbe=aux-off']) {
      expect(homeBlenderLightProbeLocksFullLod(query, 'full')).toBe(false);
    }
    for (const mode of ['normal', 'aux-off']) {
      const query = `?homeGpuProfile=1&homeLightProbe=${mode}`;
      expect(homeBlenderLightProbeLocksFullLod(query, 'full')).toBe(true);
      expect(homeBlenderLightProbeLocksFullLod(query, 'lite')).toBe(false);
      expect(homeBlenderLightProbeLocksFullLod(query, '2d')).toBe(false);
    }
  });

  it('recognises only named auxiliary families with double opt-in and locks their full-LOD trials', () => {
    expect(HOME_BLENDER_LIGHT_PROBE_FAMILIES).toEqual({
      all: 12, wall: 4, board: 2, stairs: 3, accent: 3,
    });
    for (const family of ['wall', 'board', 'stairs', 'accent']) {
      const mode = `aux-${family}-off`;
      const url = `?homeGpuProfile=1&homeLightProbe=${mode}`;
      expect(homeBlenderLightProbeMode(url)).toBe(mode);
      expect(homeBlenderLightProbeLocksFullLod(url, 'full')).toBe(true);
      expect(homeBlenderLightProbeLocksFullLod(url, 'lite')).toBe(false);
      expect(homeBlenderLightProbeMode(`?homeLightProbe=${mode}`)).toBe('normal');
    }
    expect(homeBlenderLightProbeMode('?homeGpuProfile=1&homeLightProbe=aux-unknown-off'))
      .toBe('normal');
  });

  it('disables only the selected light family; preserves the key and all other lights', () => {
    const names = ['wall', 'wall', 'wall', 'wall', 'accent', 'board', 'board',
      'accent', 'accent', 'stairs', 'stairs', 'stairs'];
    const make = () => names.map((family) => ({
      light: { visible: true, castShadow: false, userData: { homeLightProbeFamily: family } },
    })).concat([{ light: { visible: true, castShadow: true, userData: {
      homeLightProbeFamily: 'wall',
    } } }]);
    for (const [family, count] of Object.entries(HOME_BLENDER_LIGHT_PROBE_FAMILIES)) {
      const entries = make();
      const mode = family === 'all' ? 'aux-off' : `aux-${family}-off`;
      expect(applyHomeBlenderLightProbe(entries, mode)).toBe(count);
      expect(entries.filter((entry) => !entry.light.visible)).toHaveLength(count);
      expect(entries[12].light.visible).toBe(true);
    }
    const unknown = make();
    expect(applyHomeBlenderLightProbe(unknown, 'aux-garbage-off')).toBe(0);
    expect(unknown.every((entry) => entry.light.visible)).toBe(true);
  });

  it('promotes pair fills for normal Home while retaining a one-URL legacy rollback', () => {
    for (const query of ['', '?homeGpuProfile=1', '?homeWallTorches=pair',
      '?homeWallTorches=unknown', '?homeGpuProfile=0&homeLightProbe=aux-wall-off']) {
      expect(homeBlenderWallTorchLayout(query)).toBe('pair');
    }
    for (const query of ['?homeWallTorches=legacy', 'homeWallTorches=legacy',
      '?homeGpuProfile=1&homeWallTorches=legacy',
      '?homeWallTorches=legacy&homeGpuProfile=0']) {
      expect(homeBlenderWallTorchLayout(query)).toBe('legacy');
    }
  });

  it('keeps legacy as the exact baseline for all existing A/B family trials', () => {
    for (const lightMode of ['normal', 'aux-off', 'aux-wall-off', 'aux-board-off',
      'aux-stairs-off', 'aux-accent-off']) {
      const query = `?homeGpuProfile=1&homeLightProbe=${lightMode}`;
      expect(homeBlenderWallTorchLayout(query)).toBe('legacy');
      expect(homeBlenderLightProbeLocksFullLod(query, 'full')).toBe(true);
    }
    expect(homeBlenderWallTorchLayout('?homeGpuProfile=1&homeLightProbe=wall-pair'))
      .toBe('pair');
    // Explicit trial selection wins over a stale legacy rollback query.
    expect(homeBlenderWallTorchLayout(
      '?homeWallTorches=legacy&homeGpuProfile=1&homeLightProbe=wall-pair',
    )).toBe('pair');
    // Without the profiler's second flag, the query cannot force a test path.
    expect(homeBlenderWallTorchLayout('?homeLightProbe=aux-wall-off')).toBe('pair');
  });

  it('keeps the two-fill layout in production-baseline A/B tests', () => {
    const modes = ['pair-normal', 'pair-aux-board-off',
      'pair-aux-stairs-off', 'pair-aux-accent-off'];
    for (const mode of modes) {
      const query = `?homeGpuProfile=1&homeLightProbe=${mode}`;
      expect(homeBlenderLightProbeMode(query)).toBe(mode);
      expect(homeBlenderWallTorchLayout(query)).toBe('pair');
      expect(homeBlenderLightProbeLocksFullLod(query, 'full')).toBe(true);
      expect(homeBlenderLightProbeLocksFullLod(query, 'lite')).toBe(false);
      expect(homeBlenderLightProbeMode(`?homeLightProbe=${mode}`)).toBe('normal');
    }
    expect(homeBlenderLightProbeMode('?homeGpuProfile=1&homeLightProbe=pair-aux-wall-off'))
      .toBe('normal');
    expect(homeBlenderWallTorchLayout('?homeWallTorches=legacy&homeGpuProfile=1&homeLightProbe=pair-normal'))
      .toBe('pair');
  });

  it('preserves two fills and glows while isolating one extra family on production baseline', () => {
    const families = ['wall', 'wall', 'wall', 'wall', 'accent', 'board', 'board',
      'accent', 'accent', 'stairs', 'stairs', 'stairs', 'wall-pair', 'wall-pair'];
    for (const [mode, count] of [
      ['pair-normal', 4],
      ['pair-aux-board-off', 6],
      ['pair-aux-stairs-off', 7],
      ['pair-aux-accent-off', 7],
    ]) {
      const sources = families.map((family) => ({
        light: { visible: true, castShadow: false, intensity: 6,
          userData: { homeLightProbeFamily: family, glow: { opacity: 0.5 } } },
      }));
      const shadow = { light: { visible: true, castShadow: true,
        userData: { homeLightProbeFamily: 'stairs' } } };
      const list = [...sources, shadow];
      expect(applyHomeBlenderLightProbe(list, mode)).toBe(count);
      expect(list.filter((entry) => !entry.light.visible)).toHaveLength(count);
      expect(list.slice(12, 14).every((entry) => entry.light.visible)).toBe(true);
      expect(shadow.light.visible).toBe(true);
      expect(list.every((entry) => entry.light.intensity === undefined || entry.light.intensity === 6))
        .toBe(true);
    }
  });

  it('pair-fill mode requires BOTH flags and full LOD', () => {
    const pair = '?homeGpuProfile=1&homeLightProbe=wall-pair';
    expect(homeBlenderLightProbeMode(pair)).toBe('wall-pair');
    expect(homeBlenderLightProbeLocksFullLod(pair, 'full')).toBe(true);
    expect(homeBlenderLightProbeLocksFullLod(pair, 'lite')).toBe(false);
    expect(homeBlenderLightProbeMode('?homeLightProbe=wall-pair')).toBe('normal');
    expect(homeBlenderLightProbeMode('?homeGpuProfile=0&homeLightProbe=wall-pair')).toBe('normal');
  });

  it('plans two broad midpoint wall fills without moving the four authored sconces', () => {
    const wall = [-8, -4.15, 2.45, 7.95];
    const before = [...wall];
    const plan = homeBlenderWallPairFillPlan(wall);
    expect(wall).toEqual(before);
    expect(plan).toHaveLength(2);
    expect(plan.map(({ x }) => x)).toEqual([-6.075, 5.2]);
    expect(plan.map(({ intensity, distance, decay }) => [intensity, distance, decay]))
      .toEqual([[10, 8, 2], [10, 8, 2]]);
    expect(homeBlenderWallPairFillPlan([-8, 2])).toEqual([]);
    expect(homeBlenderWallPairFillPlan([-8, NaN, 2, 7])).toEqual([]);
  });

  it('hides four torch shading lights but preserves two diagnostic fills and all other sources', () => {
    const original = Array.from({ length: 4 }, (_, i) => ({
      light: { visible: true, castShadow: false, intensity: 7,
        userData: { homeLightProbeFamily: 'wall', glow: { opacity: 0.5 }, originalIndex: i } },
    }));
    const fills = homeBlenderWallPairFillPlan([-8, -4.15, 2.45, 7.95]).map(({ x }) => ({
      light: { visible: true, castShadow: false, position: { x },
        userData: { homeLightProbeFamily: 'wall-pair' } },
    }));
    const key = { light: { visible: true, castShadow: true } };
    const board = { light: { visible: true, castShadow: false,
      userData: { homeLightProbeFamily: 'board' } } };
    const list = [...original, key, board, ...fills];
    expect(applyHomeBlenderLightProbe(list, 'wall-pair')).toBe(4);
    expect(original.every(({ light }) => !light.visible && light.intensity === 7
      && light.userData.glow.opacity === 0.5)).toBe(true);
    expect(fills.every(({ light }) => light.visible)).toBe(true);
    expect(key.light.visible).toBe(true);
    expect(board.light.visible).toBe(true);
  });

  it('leaves every light unchanged in normal mode', () => {
    const entries = [{ light: { visible: true, castShadow: false } }, { light: { visible: true, castShadow: true } }];
    expect(applyHomeBlenderLightProbe(entries, 'normal')).toBe(0);
    expect(entries.map((entry) => entry.light.visible)).toEqual([true, true]);
  });

  it('hides only auxiliary non-shadow lights; never changes intensity or shadow key', () => {
    const lights = [
      { visible: true, castShadow: false, intensity: 7 },
      { visible: true, castShadow: false, intensity: 30 },
      { visible: true, castShadow: true, intensity: 8 },
    ];
    expect(applyHomeBlenderLightProbe(lights.map((light) => ({ light })), 'aux-off')).toBe(2);
    expect(lights.map((light) => [light.visible, light.intensity])).toEqual([
      [false, 7], [false, 30], [true, 8],
    ]);
    expect(applyHomeBlenderLightProbe([], 'aux-off')).toBe(0);
  });
});
