import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { listenCombatOperationsSectorInspection, pickCombatOperationsSector } from './CombatOperationsSectorPicking.js';

function fixture() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const root = new THREE.Group();
  const nodes = [
    { id: 'start', x: 0, y: 0 },
    { id: 'neighbor', x: 2, y: 0 },
  ];
  const rect = { left: 20, top: 30, width: 300, height: 300 };
  return { camera, root, nodes, rect };
}
function centerOf(node, { camera, root, rect }) {
  const point = root.localToWorld(new THREE.Vector3(node.x, node.y, -6.075));
  point.project(camera);
  return {
    clientX: rect.left + (point.x + 1) * rect.width / 2,
    clientY: rect.top + (1 - point.y) * rect.height / 2,
  };
}

describe('Combat Operations · read-only physical sector hit-testing', () => {
  it('locates the closest true projected seal without consulting campaign rules', () => {
    const scene = fixture();
    const { clientX, clientY } = centerOf(scene.nodes[0], scene);
    expect(pickCombatOperationsSector({ ...scene, clientX, clientY })?.id).toBe('start');
    expect(pickCombatOperationsSector({ ...scene, clientX: 20, clientY: 30 })).toBeNull();
    expect(pickCombatOperationsSector({ ...scene, clientX, clientY, nodes: [] })).toBeNull();
    const second = centerOf(scene.nodes[1], scene);
    expect(pickCombatOperationsSector({ ...scene, ...second })?.id).toBe('neighbor');
  });

  it('supports touch tolerance, rejects drag, and removes all canvas handlers', () => {
    const scene = fixture();
    const listeners = new Map();
    const canvas = {
      getBoundingClientRect: () => scene.rect,
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name, handler) => { if (listeners.get(name) === handler) listeners.delete(name); },
    };
    const inspect = vi.fn();
    const dispose = listenCombatOperationsSectorInspection({
      canvas, camera: scene.camera, root: scene.root,
      projection: { nodes: scene.nodes, onInspect: inspect },
    });
    const point = centerOf(scene.nodes[0], scene);
    listeners.get('pointerdown')({ pointerId: 3, pointerType: 'touch', ...point });
    listeners.get('pointerup')({ pointerId: 3, pointerType: 'touch', button: 0, ...point });
    expect(inspect).toHaveBeenCalledExactlyOnceWith('start');
    listeners.get('pointerdown')({ pointerId: 4, pointerType: 'mouse', ...point });
    listeners.get('pointerup')({ pointerId: 4, pointerType: 'mouse', button: 0, clientX: point.clientX + 30, clientY: point.clientY });
    expect(inspect).toHaveBeenCalledTimes(1);
    listeners.get('pointerdown')({ pointerId: 5, ...point });
    listeners.get('pointercancel')();
    listeners.get('pointerup')({ pointerId: 5, ...point });
    expect(inspect).toHaveBeenCalledTimes(1);

    listeners.get('pointerdown')({ pointerId: 7, pointerType: 'touch', ...point });
    listeners.get('pointerdown')({ pointerId: 8, pointerType: 'touch', ...point });
    listeners.get('pointerup')({ pointerId: 8, pointerType: 'touch', button: 0, ...point });
    listeners.get('pointerup')({ pointerId: 7, pointerType: 'touch', button: 0, ...point });
    expect(inspect).toHaveBeenCalledTimes(1);

    canvas.dataset = { warRoomPinching: 'true' };
    listeners.get('pointerdown')({ pointerId: 9, pointerType: 'touch', ...point });
    listeners.get('pointerup')({ pointerId: 9, pointerType: 'touch', button: 0, ...point });
    expect(inspect).toHaveBeenCalledTimes(1);

    dispose();
    expect(listeners.size).toBe(0);
  });
});
