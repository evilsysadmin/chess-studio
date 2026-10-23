import { describe, expect, it } from 'vitest';
import { installWarRoomShadowPassProbe, warRoomShadowDrawFamily } from './WarRoomShadowPassProbe.js';

describe('War Room opt-in shadow-pass draw census', () => {
  it('classifies actual WebGL submissions by ancestor without confusing meshes with draws', () => {
    const piece = { name: 'pawn', userData: { type: 'p', color: 'w', square: 'a2' } };
    const shell = { name: 'war-room-v3-blender-shell', userData: {} };
    const other = { name: 'hans', userData: {} };
    const pieceDetail = { name: 'piece-ring', userData: {}, parent: piece };
    const wall = { name: 'wall', userData: {}, parent: shell };
    expect(warRoomShadowDrawFamily(pieceDetail)).toBe('pieces');
    expect(warRoomShadowDrawFamily(wall)).toBe('shell');
    expect(warRoomShadowDrawFamily(other)).toBe('other');

    const info = { calls: 0 };
    const calls = [];
    const renderer = {
      info: { render: info },
      renderBufferDirect(...args) {
        calls.push({ receiver: this, args });
        info.calls += args[5].drawCount;
      },
      shadowMap: {
        render() {
          renderer.renderBufferDirect('camera', null, 'geo', 'material', pieceDetail, { drawCount: 9 });
          renderer.renderBufferDirect('camera', null, 'geo', 'material', wall, { drawCount: 6 });
          renderer.renderBufferDirect('camera', null, 'geo', 'material', other, { drawCount: 3 });
        },
      },
    };
    const oldShadow = renderer.shadowMap.render;
    const oldBuffer = renderer.renderBufferDirect;
    const probe = installWarRoomShadowPassProbe(renderer);
    probe.begin();
    renderer.shadowMap.render();
    info.calls += 19; // main scene, not attributed to any shadow caster.
    expect(probe.sample(info.calls)).toEqual({
      mainCalls: 19, shadowCalls: 18, shadowPasses: 1,
      shadowFamilyCalls: { pieces: 9, shell: 6, other: 3 },
      shadowTopCasters: {
        top: [
          { name: 'piece-ring', family: 'pieces', calls: 9 },
          { name: 'wall', family: 'shell', calls: 6 },
          { name: 'hans', family: 'other', calls: 3 },
        ],
        unrankedCalls: 0,
      },
    });
    expect(calls.every((item) => item.receiver === renderer)).toBe(true);
    probe.dispose();
    expect(renderer.shadowMap.render).toBe(oldShadow);
    expect(renderer.renderBufferDirect).toBe(oldBuffer);
  });

  it('ranks actual main-pass submissions separately from shadow casters', () => {
    const counts = { calls: 0 };
    const objects = Array.from({ length: 11 }, (_, i) =>
      ({ name: `main-${i}`, userData: {} }));
    const shadow = { name: 'shadow-only', userData: {} };
    const renderer = {
      info: { render: counts },
      renderBufferDirect(_a, _b, _c, _d, object, draws) {
        expect(object).toBeTruthy();
        counts.calls += draws;
      },
      shadowMap: {
        render() { renderer.renderBufferDirect(null, null, null, null, shadow, 7); },
      },
    };
    const direct = renderer.renderBufferDirect;
    const probe = installWarRoomShadowPassProbe(renderer);
    probe.begin();
    renderer.shadowMap.render();
    objects.forEach((object, i) =>
      renderer.renderBufferDirect(null, null, null, null, object, i + 1));
    expect(counts.calls).toBe(73);
    const row = probe.sample(counts.calls);
    expect(row.shadowCalls).toBe(7);
    expect(row.mainCalls).toBe(66);
    expect(row.shadowTopCasters).toEqual({
      top: [{ name: 'shadow-only', family: 'other', calls: 7 }], unrankedCalls: 0,
    });
    expect(row.mainTopSubmitters.top).toHaveLength(8);
    expect(row.mainTopSubmitters.top[0]).toEqual(
      { name: 'main-10', family: 'other', calls: 11 });
    expect(row.mainTopSubmitters.unrankedCalls).toBe(6);
    expect(row.mainTopSubmitters.top.reduce((sum, item) => sum + item.calls, 0)
      + row.mainTopSubmitters.unrankedCalls).toBe(row.mainCalls);

    probe.begin();
    renderer.renderBufferDirect(null, null, null, null, objects[0], 2);
    expect(probe.sample(2).mainTopSubmitters).toEqual({
      top: [{ name: 'main-0', family: 'other', calls: 2 }], unrankedCalls: 0,
    });
    probe.dispose();
    expect(renderer.renderBufferDirect).toBe(direct);
  });

  it('does not fabricate main-object ranks when real draws bypass the observed path', () => {
    const counts = { calls: 0 };
    const object = { name: 'visible', userData: {} };
    const renderer = {
      info: { render: counts },
      renderBufferDirect() { counts.calls += 3; },
      shadowMap: { render() { counts.calls += 2; } },
    };
    const probe = installWarRoomShadowPassProbe(renderer);
    probe.begin();
    renderer.shadowMap.render();
    renderer.renderBufferDirect(null, null, null, null, object);
    counts.calls += 4; // A different, unobserved renderer submission path.
    const snapshot = probe.sample(counts.calls);
    expect(snapshot).toMatchObject({ mainCalls: 7, shadowCalls: 2 });
    expect(snapshot.mainTopSubmitters).toBeUndefined();
    probe.dispose();
  });

  it('bounds the rank to eight named actual casters and accounts for omitted calls', () => {
    const info = { calls: 0 };
    const actors = Array.from({ length: 10 }, (_, index) =>
      ({ name: `actor-${index}`, userData: {} }));
    const renderer = {
      info: { render: info },
      renderBufferDirect(_a, _b, _c, _d, _object, count) { info.calls += count; },
      shadowMap: { render() {
        actors.forEach((actor, index) =>
          renderer.renderBufferDirect(null, null, null, null, actor, index + 1));
      } },
    };
    const probe = installWarRoomShadowPassProbe(renderer);
    probe.begin();
    renderer.shadowMap.render();
    const snapshot = probe.sample(info.calls);
    expect(snapshot.shadowCalls).toBe(55);
    expect(snapshot.shadowTopCasters.top).toHaveLength(8);
    expect(snapshot.shadowTopCasters.top[0]).toEqual(
      { name: 'actor-9', family: 'other', calls: 10 });
    expect(snapshot.shadowTopCasters.unrankedCalls).toBe(3);
    expect(snapshot.shadowTopCasters.top.reduce((sum, row) => sum + row.calls, 0)
      + snapshot.shadowTopCasters.unrankedCalls).toBe(snapshot.shadowCalls);
    probe.dispose();
  });

  it('fails family attribution closed when Three uses another submission path', () => {
    const info = { calls: 0 };
    const renderer = {
      info: { render: info },
      renderBufferDirect() { info.calls += 4; },
      shadowMap: { render() { renderer.renderBufferDirect(); info.calls += 2; } },
    };
    const probe = installWarRoomShadowPassProbe(renderer);
    probe.begin();
    renderer.shadowMap.render();
    expect(probe.sample(6)).toEqual({ mainCalls: 0, shadowCalls: 6, shadowPasses: 1 });
    probe.dispose();
  });

  it('subtracts measured shadow depth submissions and restores Three render method', () => {
    const info = { calls: 0 };
    const shadowMap = { render: (count) => { info.calls += count; } };
    const original = shadowMap.render;
    const probe = installWarRoomShadowPassProbe({ shadowMap, info: { render: info } });
    expect(probe).toBeTruthy();
    probe.begin();
    shadowMap.render(14);
    shadowMap.render(7);
    info.calls += 79; // real main pass
    expect(probe.sample(info.calls)).toEqual({
      shadowCalls: 21, mainCalls: 79, shadowPasses: 2,
    });
    probe.begin();
    expect(probe.sample(50)).toEqual({
      shadowCalls: 0, mainCalls: 50, shadowPasses: 0,
    });
    probe.dispose();
    expect(shadowMap.render).toBe(original);
  });

  it('handles a failed depth pass, invalid counters and external replacement without fabrication', () => {
    const info = { calls: 0 };
    const shadowMap = { render: () => { throw new Error('depth pass failed'); } };
    const original = shadowMap.render;
    const probe = installWarRoomShadowPassProbe({ shadowMap, info: { render: info } });
    probe.begin();
    expect(() => shadowMap.render()).toThrow('depth pass failed');
    expect(probe.sample(0)).toBeNull();
    info.calls = -10;
    shadowMap.render = function () { return 'external override'; };
    probe.dispose();
    expect(shadowMap.render()).toBe('external override');
    expect(original).not.toBe(shadowMap.render);
  });

  it('fails closed for missing APIs and negative/disconnected totals', () => {
    expect(installWarRoomShadowPassProbe({})).toBeNull();
    const info = { calls: 5 };
    const shadowMap = { render: () => { info.calls += 9; } };
    const probe = installWarRoomShadowPassProbe({ shadowMap, info: { render: info } });
    probe.begin();
    shadowMap.render();
    expect(probe.sample(8)).toBeNull();
    probe.begin();
    info.calls = -1;
    shadowMap.render();
    expect(probe.sample(12)).toBeNull();
    probe.dispose();
  });
});
