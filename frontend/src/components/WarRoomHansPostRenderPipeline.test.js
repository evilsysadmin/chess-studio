import { describe, expect, it } from 'vitest';
import {
  getWarRoomHansPostRenderStageKeys,
  registerWarRoomHansPostRenderStage,
  WAR_ROOM_HANS_POST_RENDER_PIPELINE_VERSION,
} from './WarRoomHansPostRenderPipeline.js';

describe('Hans post-render pipeline', () => {
  it('keeps one wrapper and runs registered stages in explicit order', () => {
    const calls = [];
    const driver = {
      userData: {},
      onBeforeRender: () => calls.push('base'),
    };

    expect(registerWarRoomHansPostRenderStage(driver, {
      key: 'elder-gait',
      order: 20,
      run: () => calls.push('elder'),
    })).toBe(1);
    const pipelineHook = driver.onBeforeRender;

    expect(registerWarRoomHansPostRenderStage(driver, {
      key: 'facing-guard',
      order: 10,
      run: () => calls.push('facing'),
    })).toBe(1);

    expect(driver.onBeforeRender).toBe(pipelineHook);
    expect(getWarRoomHansPostRenderStageKeys(driver)).toEqual(['facing-guard', 'elder-gait']);
    expect(driver.userData.warRoomHansPostRenderPipeline).toBe(WAR_ROOM_HANS_POST_RENDER_PIPELINE_VERSION);
    expect(driver.userData.warRoomHansPostRenderStageCount).toBe(2);
    expect(driver.userData.warRoomHansPostRenderHotPath).toBe('direct-args-v2');

    driver.onBeforeRender();
    expect(calls).toEqual(['base', 'facing', 'elder']);
  });

  it('forwards the native Three.js render arguments without changing identity', () => {
    const seen = [];
    const driver = {
      userData: {},
      onBeforeRender: (renderer, scene, camera, geometry, material, group) => {
        seen.push(['base', renderer, scene, camera, geometry, material, group]);
      },
    };
    const args = Array.from({ length: 6 }, (_, index) => ({ index }));

    expect(registerWarRoomHansPostRenderStage(driver, {
      key: 'probe',
      order: 1,
      run: (renderer, scene, camera, geometry, material, group) => {
        seen.push(['probe', renderer, scene, camera, geometry, material, group]);
      },
    })).toBe(1);

    driver.onBeforeRender(...args);
    expect(seen).toEqual([
      ['base', ...args],
      ['probe', ...args],
    ]);
  });

  it('rejects duplicate stage keys instead of nesting another render wrapper', () => {
    const driver = { userData: {}, onBeforeRender: () => {} };
    expect(registerWarRoomHansPostRenderStage(driver, {
      key: 'facing-guard',
      order: 10,
      run: () => {},
    })).toBe(1);
    const pipelineHook = driver.onBeforeRender;

    expect(registerWarRoomHansPostRenderStage(driver, {
      key: 'facing-guard',
      order: 99,
      run: () => {},
    })).toBe(0);
    expect(driver.onBeforeRender).toBe(pipelineHook);
    expect(driver.userData.warRoomHansPostRenderStageCount).toBe(1);
  });
});
