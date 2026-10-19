import { describe, expect, it } from 'vitest';
import { installWarRoomShadowPassProbe } from './WarRoomShadowPassProbe.js';

describe('War Room opt-in shadow-pass draw census', () => {
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
    expect(probe.sample(0)).toEqual({
      shadowCalls: 0, mainCalls: 0, shadowPasses: 1,
    });
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
