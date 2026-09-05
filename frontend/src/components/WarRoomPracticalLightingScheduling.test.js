import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyWarRoomPracticalLighting } from './WarRoomPracticalLighting.js';

describe('War Room practical refinement scheduling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('aplaza el trabajo estático de desktop hasta después del primer frame cuando el navegador ofrece idle callbacks', () => {
    const raf = vi.fn();
    const idle = vi.fn();
    vi.stubEnv('VITEST', 'false');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/151 Safari/537.36' });
    vi.stubGlobal('window', {
      requestAnimationFrame: raf,
      requestIdleCallback: idle,
    });

    const room = new THREE.Group();
    expect(applyWarRoomPracticalLighting(room, {
      wallZ: -7.6,
      towardBoard: 1,
      coarsePointer: false,
    })).toBe(0);

    expect(raf).toHaveBeenCalledTimes(1);
    expect(idle).not.toHaveBeenCalled();
    expect(room.userData.warRoomPracticalRefinementState).toBe('scheduled:idle-sliced-v1');
    expect(room.userData.warRoomPracticalLightingVersion).toBeUndefined();
  });
});
