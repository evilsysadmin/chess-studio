import { describe, expect, it } from 'vitest';
import { resolveBoard3DPresentation } from './Board3DPresentation.js';

describe('Board3D presentation profile', () => {
  it('keeps the normal War Room global variant contract', () => {
    const view = resolveBoard3DPresentation({
      globalVariant: 'v2',
      globalDomData: { 'data-board3d-variant': 'v2' },
    });
    expect(view.variant).toBe('v2');
    expect(view.domData['data-board3d-variant']).toBe('v2');
    expect(view.cameraData).toBe('fixed-tactical');
  });

  it('lets Class Room override the shell and camera without mutating global state', () => {
    const view = resolveBoard3DPresentation({
      cameraProfile: 'classroom',
      variantOverride: 'classic',
      globalVariant: 'v2',
      globalDomData: { 'data-board3d-variant': 'v2' },
      variantStatus: 'idle',
    });
    expect(view.variant).toBe('classic');
    expect(view.domData['data-board3d-variant']).toBe('classic');
    expect(view.cameraData).toBe('classroom-overhead');
    expect(view.roomLabel).toBe('CLASS ROOM');
  });
});
