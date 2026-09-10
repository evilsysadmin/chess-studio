import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { installPawnSlugEnemyDeathReplay } from './pawnSlugEnemyDeathReplay.js';

describe('Pawn Slug enemy death replay', () => {
  function fixture({ reducedMotion = false } = {}) {
    const parent = new THREE.Group();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.userData.motionBaseScaleX = 2;
    sprite.scale.set(2, 2, 1);
    parent.add(sprite);
    let clock = 1000;
    let queued = null;
    const animate = vi.fn();
    const replay = installPawnSlugEnemyDeathReplay(sprite, {
      duration: 0.7,
      hold: 0.2,
      reducedMotion,
      animate,
      now: () => clock,
      raf: (callback) => { queued = callback; return 17; },
      cancel: vi.fn(),
    });
    return {
      parent,
      sprite,
      animate,
      replay,
      advance(ms) {
        clock += ms;
        const callback = queued;
        queued = null;
        callback?.(clock);
      },
    };
  }

  it('re-attaches a killed sprite and defers the runtime disposer until death finishes', () => {
    const { parent, sprite, animate, replay, advance } = fixture();
    const disposeChild = vi.fn();

    sprite.visible = false;
    parent.remove(sprite);
    expect(replay.active).toBe(true);
    expect(sprite.visible).toBe(true);
    expect(parent.children).toContain(sprite);

    sprite.traverse(disposeChild);
    expect(disposeChild).not.toHaveBeenCalled();

    advance(350);
    expect(animate).toHaveBeenCalled();
    expect(parent.children).toContain(sprite);

    advance(600);
    expect(parent.children).not.toContain(sprite);
    expect(disposeChild).toHaveBeenCalledTimes(1);
    expect(replay.active).toBe(false);
  });

  it('jumps to the grounded terminal pose under reduced motion while retaining a short hold', () => {
    const { parent, sprite, animate, advance } = fixture({ reducedMotion: true });
    sprite.visible = false;
    parent.remove(sprite);
    advance(20);
    expect(animate).toHaveBeenCalledWith(999);
    expect(parent.children).toContain(sprite);
  });

  it('lets an external reset remove and dispose an in-flight corpse immediately', () => {
    const { parent, sprite, replay } = fixture();
    const disposeChild = vi.fn();
    sprite.visible = false;
    parent.remove(sprite);
    sprite.traverse(disposeChild);
    expect(replay.active).toBe(true);

    parent.remove(sprite);
    sprite.traverse(disposeChild);
    expect(replay.active).toBe(false);
    expect(parent.children).not.toContain(sprite);
    expect(disposeChild).toHaveBeenCalledTimes(1);
  });
});
