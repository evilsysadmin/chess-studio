import { describe, expect, it, vi } from 'vitest';
import { createPawnSlugInputState } from './pawnSlugRuntimeCore.js';
import { createPawnSlugRuntimeInputController } from './pawnSlugRuntimeInput.js';

function createRuntime(phase = 'playing') {
  return {
    state: { phase },
    input: createPawnSlugInputState(),
    weapons: {
      cycleWeapon: vi.fn(),
      selectWeapon: vi.fn(),
    },
  };
}

describe('Pawn Slug runtime input controller', () => {
  it('keeps semi-auto fire edge-triggered until the trigger is released', () => {
    const runtime = createRuntime();
    const controller = createPawnSlugRuntimeInputController(runtime);

    controller.input('fire', true);
    expect(runtime.input.fire).toBe(true);
    expect(runtime.input.firePressed).toBe(true);

    runtime.input.firePressed = false;
    controller.input('fire', true);
    expect(runtime.input.firePressed).toBe(false);

    controller.input('fire', false);
    controller.input('fire', true);
    expect(runtime.input.firePressed).toBe(true);
  });

  it('routes weapon cycling and direct slots only on press', () => {
    const runtime = createRuntime();
    const controller = createPawnSlugRuntimeInputController(runtime);

    controller.input('weapon-prev', true);
    controller.input('weapon-next', true);
    controller.input('weapon:shotgun', true);
    controller.input('weapon:shotgun', false);

    expect(runtime.weapons.cycleWeapon).toHaveBeenNthCalledWith(1, -1);
    expect(runtime.weapons.cycleWeapon).toHaveBeenNthCalledWith(2, 1);
    expect(runtime.weapons.selectWeapon).toHaveBeenCalledTimes(1);
    expect(runtime.weapons.selectWeapon).toHaveBeenCalledWith('shotgun');
  });

  it('starts missions from terminal phases without leaking the triggering key into movement state', () => {
    const runtime = createRuntime('ready');
    const startMission = vi.fn();
    const controller = createPawnSlugRuntimeInputController(runtime, { startMission });
    const preventDefault = vi.fn();

    controller.handleKeyDown({ key: ' ', repeat: false, preventDefault });

    expect(startMission).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(runtime.input.jump).toBe(false);

    runtime.state.phase = 'playing';
    controller.handleKeyDown({ key: 'ArrowLeft', repeat: false, preventDefault });
    expect(runtime.input.left).toBe(true);
    controller.handleKeyUp({ key: 'ArrowLeft' });
    expect(runtime.input.left).toBe(false);
  });

  it('attaches and removes keyboard listeners exactly once', () => {
    const runtime = createRuntime();
    const targetWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const controller = createPawnSlugRuntimeInputController(runtime, { targetWindow });

    controller.attach();
    controller.attach();
    expect(targetWindow.addEventListener).toHaveBeenCalledTimes(2);

    controller.destroy();
    controller.destroy();
    expect(targetWindow.removeEventListener).toHaveBeenCalledTimes(2);
    expect(targetWindow.removeEventListener.mock.calls.map(([type]) => type)).toEqual(['keydown', 'keyup']);
  });
});
