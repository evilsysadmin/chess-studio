import { describe, expect, it, vi } from 'vitest';
import { clearObjectGroup, makeObjectTranslucent } from './Board3DObjectLifecycle.js';

describe('War Room scene ownership helpers', () => {
  it('releases objects detached from a mutable group, disposing their geometry and materials', () => {
    const geometryDispose = vi.fn();
    const materialDispose = vi.fn();
    const child = {
      traverse(callback) {
        callback({ geometry: { dispose: geometryDispose }, material: { dispose: materialDispose } });
      },
    };
    const group = {
      children: [child],
      remove(removed) { this.children = this.children.filter((item) => item !== removed); },
    };
    clearObjectGroup(group);
    expect(group.children).toEqual([]);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(() => clearObjectGroup(null)).not.toThrow();
  });

  it('applies the original transparent ghost treatment across material arrays', () => {
    const first = { transparent: false, opacity: 1, depthWrite: true };
    const second = { transparent: false, opacity: 1, depthWrite: true };
    const group = { traverse(callback) { callback({ material: [first, null, second] }); } };
    makeObjectTranslucent(group, 0.3);
    expect(first).toMatchObject({ transparent: true, opacity: 0.3, depthWrite: false });
    expect(second).toMatchObject({ transparent: true, opacity: 0.3, depthWrite: false });
    expect(() => makeObjectTranslucent(null, 0.3)).not.toThrow();
  });
});
