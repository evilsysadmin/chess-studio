import { describe, expect, it } from 'vitest';
import { homeBlenderDrawFamily, installHomeBlenderDrawPassProbe } from './HomeBlenderDrawPassProbe.js';

function rig() {
  const info = { calls: 0 };
  const cast = { parent: null };
  const actor = { parent: null };
  const runtime = { parent: null };
  const renderer = {
    info: { render: info },
    renderBufferDirect(...args) { info.calls += args[5] || 1; },
    shadowMap: {
      render(draws) {
        for (const [object, calls] of draws) renderer.renderBufferDirect(null, null, null, null, object, calls);
      },
    },
  };
  const originals = [renderer.shadowMap.render, renderer.renderBufferDirect];
  return { info, cast, actor, runtime, renderer, originals };
}

describe('Home WebGL draw-pass census (profiler only)', () => {
  it('counts actual main and shadow draws by GLB/Matthias/runtime identities and restores wrappers', () => {
    const x = rig();
    const probe = installHomeBlenderDrawPassProbe(x.renderer,
      (object) => homeBlenderDrawFamily(object, x.cast, x.actor));
    const child = { parent: x.cast };
    const actorChild = { parent: x.actor };
    probe.begin();
    x.renderer.shadowMap.render([[child, 6], [actorChild, 3]]);
    x.renderer.renderBufferDirect(null, null, null, null, child, 27);
    x.renderer.renderBufferDirect(null, null, null, null, actorChild, 4);
    x.renderer.renderBufferDirect(null, null, null, null, x.runtime, 2);
    expect(probe.sample(42)).toEqual({
      totalCalls: 42, shadowCalls: 9, mainCalls: 33, shadowPasses: 1,
      families: {
        shadow: { castle: 6, matthias: 3, runtime: 0 },
        main: { castle: 27, matthias: 4, runtime: 2 },
      },
    });
    x.info.calls = 0;
    probe.begin();
    x.renderer.renderBufferDirect(null, null, null, null, child, 5);
    expect(probe.sample(5)).toEqual({
      totalCalls: 5, shadowCalls: 0, mainCalls: 5, shadowPasses: 0,
      families: { shadow: { castle: 0, matthias: 0, runtime: 0 },
        main: { castle: 5, matthias: 0, runtime: 0 } },
    });
    probe.dispose();
    expect(x.renderer.shadowMap.render).toBe(x.originals[0]);
    expect(x.renderer.renderBufferDirect).toBe(x.originals[1]);
  });

  it('does not attribute unobserved draws or allow impossible counts', () => {
    const x = rig();
    const probe = installHomeBlenderDrawPassProbe(x.renderer,
      (object) => homeBlenderDrawFamily(object, x.cast, x.actor));
    probe.begin();
    x.renderer.renderBufferDirect(null, null, null, null, x.cast, 5);
    expect(probe.sample(7)).toEqual({
      totalCalls: 7, shadowCalls: 0, mainCalls: 7, shadowPasses: 0, families: null,
    });
    expect(probe.sample(3)).toBeNull();
    probe.dispose();
  });

  it('fails closed on unavailable or replaced Three APIs, errors, and invalid object groups', () => {
    expect(installHomeBlenderDrawPassProbe({}, () => 'runtime')).toBeNull();
    const x = rig();
    const probe = installHomeBlenderDrawPassProbe(x.renderer, () => 'unknown');
    probe.begin();
    x.renderer.renderBufferDirect(null, null, null, null, x.cast, 1);
    expect(probe.sample(1)).toBeNull();
    probe.dispose();
    const y = rig();
    const probe2 = installHomeBlenderDrawPassProbe(y.renderer, () => 'runtime');
    probe2.begin();
    y.renderer.renderBufferDirect = () => {};
    expect(probe2.sample(0)?.families).toBeDefined();
    probe2.begin();
    expect(probe2.sample(0)).toBeNull();
    probe2.dispose();
    expect(y.renderer.renderBufferDirect).not.toBe(y.originals[1]);
  });
});
