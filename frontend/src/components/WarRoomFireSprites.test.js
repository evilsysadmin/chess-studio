import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFireSprites } from './fireSprites.js';
import { attachHansFireDimmer } from './WarRoomFireSprites.js';

describe('WarRoomFireSprites · Hans fire dimmer', () => {
  it('lets Hans dim and revive the v2 hearth plume and its practical light', () => {
    const root = new THREE.Group();
    const practical = new THREE.PointLight(0xffaa66, 2);
    practical.name = 'war-room-blender-fire-practical';
    root.add(practical);
    const points = createFireSprites({ base: [0, 0, 0], height: 0.6, opacity: 0.9 });
    root.add(points);
    attachHansFireDimmer(root, points);
    const { uniforms } = points.material;

    points.onBeforeRender(null);
    expect(uniforms.uOpacity.value).toBeCloseTo(0.9);
    expect(practical.intensity).toBeCloseTo(2);

    const core = new THREE.Group();
    core.scale.set(1, 0.3, 1);
    root.userData.warRoomHansFireDimmer = { core, light: { intensity: 0.25 } };
    points.onBeforeRender(null);
    expect(uniforms.uOpacity.value).toBeCloseTo(0.225);
    expect(uniforms.uHeight.value).toBeCloseTo(0.18);
    expect(practical.intensity).toBeCloseTo(0.5);

    delete root.userData.warRoomHansFireDimmer;
    points.onBeforeRender(null);
    expect(uniforms.uOpacity.value).toBeCloseTo(0.9);
    expect(practical.intensity).toBeCloseTo(2);
  });
});
