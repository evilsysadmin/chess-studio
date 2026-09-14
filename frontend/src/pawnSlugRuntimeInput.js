import { pawnSlugKeyAction } from './pawnSlugRuntimeCore.js';

const TERMINAL_PHASES = new Set(['ready', 'gameover', 'victory']);
const PREVENT_DEFAULT_KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ']);

export function createPawnSlugRuntimeInputController(runtime, {
  startMission,
  targetWindow = typeof window !== 'undefined' ? window : null,
} = {}) {
  let attached = false;

  function setInput(action, pressed = true) {
    if (typeof action !== 'string') return;
    if (action === 'action') {
      if (pressed && TERMINAL_PHASES.has(runtime.state.phase)) startMission?.();
      return;
    }
    if (action === 'weapon-prev') {
      if (pressed) runtime.weapons.cycleWeapon(-1);
      return;
    }
    if (action === 'weapon-next') {
      if (pressed) runtime.weapons.cycleWeapon(1);
      return;
    }
    if (action.startsWith('weapon:')) {
      if (pressed) runtime.weapons.selectWeapon(action.slice('weapon:'.length));
      return;
    }
    if (action === 'fire') {
      const next = Boolean(pressed);
      if (next && !runtime.input.fire) runtime.input.firePressed = true;
      runtime.input.fire = next;
      return;
    }
    if (!(action in runtime.input)) return;
    runtime.input[action] = Boolean(pressed);
  }

  function handleKeyDown(event) {
    const action = pawnSlugKeyAction(event);
    if (!action) return;
    if (PREVENT_DEFAULT_KEYS.has(event.key.toLowerCase())) event.preventDefault();
    if (event.repeat && action.startsWith('weapon')) return;
    if (TERMINAL_PHASES.has(runtime.state.phase)) {
      if (action === 'fire' || action === 'jump') startMission?.();
      return;
    }
    setInput(action, true);
  }

  function handleKeyUp(event) {
    const action = pawnSlugKeyAction(event);
    if (action) setInput(action, false);
  }

  function attach() {
    if (attached || !targetWindow?.addEventListener) return;
    targetWindow.addEventListener('keydown', handleKeyDown, { passive: false });
    targetWindow.addEventListener('keyup', handleKeyUp);
    attached = true;
  }

  function destroy() {
    if (!attached || !targetWindow?.removeEventListener) return;
    targetWindow.removeEventListener('keydown', handleKeyDown);
    targetWindow.removeEventListener('keyup', handleKeyUp);
    attached = false;
  }

  return {
    input: setInput,
    handleKeyDown,
    handleKeyUp,
    attach,
    destroy,
  };
}
