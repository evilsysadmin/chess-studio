import { useEffect, useRef, useState } from 'react';
import {
  PAWN_SLUG_TOUCH_GESTURE,
  pawnSlugTouchHapticPattern,
  pawnSlugTouchMinimumPressMs,
  pawnSlugTouchMoveDirection,
  pawnSlugTouchTapAction,
  pawnSlugTouchVerticalAction,
  pawnSlugTouchZone,
} from '../pawnSlugTouchGestures.js';
import './PawnSlugTouchSurface.css';
import './PawnSlugLandscape.css';

function haptic(action) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const pattern = pawnSlugTouchHapticPattern(action);
  if (pattern.length) navigator.vibrate(pattern);
}

export default function PawnSlugTouchSurface({ send }) {
  const sendRef = useRef(send);
  const pointersRef = useRef(new Map());
  const timersRef = useRef(new Map());
  const powerPressedRef = useRef(false);
  const powerStartedAtRef = useRef(0);
  const [trained, setTrained] = useState(false);
  sendRef.current = send;

  function cancelPendingRelease(action) {
    for (const [timer, pendingAction] of timersRef.current) {
      if (pendingAction !== action) continue;
      window.clearTimeout(timer);
      timersRef.current.delete(timer);
    }
  }

  function press(action) {
    cancelPendingRelease(action);
    sendRef.current(action, true);
    haptic(action);
  }

  function scheduleRelease(action, startedAt, { immediate = false } = {}) {
    if (!action) return;
    const minimumPressMs = immediate ? 0 : pawnSlugTouchMinimumPressMs(action);
    if (minimumPressMs <= 0) {
      sendRef.current(action, false);
      return;
    }
    const elapsed = Math.max(0, performance.now() - startedAt);
    const delay = Math.max(0, minimumPressMs - elapsed);
    if (delay <= 0) {
      sendRef.current(action, false);
      return;
    }
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      sendRef.current(action, false);
    }, delay);
    timersRef.current.set(timer, action);
  }

  useEffect(() => () => {
    for (const [timer, action] of timersRef.current) {
      window.clearTimeout(timer);
      sendRef.current(action, false);
    }
    timersRef.current.clear();
    for (const pointer of pointersRef.current.values()) {
      if (pointer.action) sendRef.current(pointer.action, false);
    }
    pointersRef.current.clear();
    powerPressedRef.current = false;
    sendRef.current('grenade', false);
  }, []);

  function point(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
    };
  }

  function release(pointer, { immediate = false } = {}) {
    if (!pointer?.action) return;
    scheduleRelease(pointer.action, pointer.actionStartedAt, { immediate });
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    setTrained(true);
    const start = point(event);
    const zone = pawnSlugTouchZone(start.x, start.width);
    const pointer = {
      zone,
      startX: start.x,
      startY: start.y,
      width: start.width,
      action: null,
      actionStartedAt: 0,
    };

    if (zone === 'move') {
      pointer.action = pawnSlugTouchMoveDirection(start.x, start.width);
      pointer.actionStartedAt = performance.now();
      press(pointer.action);
    } else if (zone === 'fire') {
      pointer.action = 'fire';
      pointer.actionStartedAt = performance.now();
      press('fire');
    }

    pointersRef.current.set(event.pointerId, pointer);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const pointer = pointersRef.current.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    const current = point(event);

    if (pointer.zone === 'move') {
      const direction = pawnSlugTouchMoveDirection(current.x, current.width);
      if (direction !== pointer.action) {
        if (pointer.action) sendRef.current(pointer.action, false);
        pointer.action = direction;
        pointer.actionStartedAt = performance.now();
        press(direction);
      }
      return;
    }

    if (pointer.zone !== 'gesture' || pointer.action) return;
    const action = pawnSlugTouchVerticalAction(current.x - pointer.startX, current.y - pointer.startY);
    if (!action) return;
    pointer.action = action;
    pointer.actionStartedAt = performance.now();
    press(action);
  }

  function finish(event, allowTap = true, immediateRelease = false) {
    const pointer = pointersRef.current.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    if (allowTap && pointer.zone === 'gesture' && !pointer.action) {
      const current = point(event);
      const action = pawnSlugTouchTapAction(current.x - pointer.startX, current.y - pointer.startY);
      if (action) {
        pointer.action = action;
        pointer.actionStartedAt = performance.now();
        press(action);
      }
    }
    release(pointer, { immediate: immediateRelease });
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }

  function cancel(event) {
    finish(event, false, true);
  }

  function powerUpPress(event) {
    event.preventDefault();
    event.stopPropagation();
    setTrained(true);
    powerPressedRef.current = true;
    powerStartedAtRef.current = performance.now();
    press('grenade');
  }

  function powerUpRelease(event, immediate = false) {
    event.preventDefault();
    event.stopPropagation();
    if (!powerPressedRef.current) return;
    powerPressedRef.current = false;
    scheduleRelease('grenade', powerStartedAtRef.current, { immediate });
  }

  return (
    <div
      className={`pawn-slug-gesture-surface${trained ? ' is-trained' : ''}`}
      role="group"
      aria-label="Controles gestuales de Pawn Slug"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="pawn-slug-gesture-hint is-move" aria-hidden="true">← MOVER →</span>
      <span className="pawn-slug-gesture-hint is-jump" aria-hidden="true">TAP/↑ SALTAR · ↓ AGACHARSE</span>
      <span className="pawn-slug-gesture-hint is-fire" aria-hidden="true">MANTÉN · DISPARAR</span>
      <button
        type="button"
        className="pawn-slug-gesture-powerup"
        aria-label="Power-up"
        onPointerDown={powerUpPress}
        onPointerUp={(event) => powerUpRelease(event)}
        onPointerCancel={(event) => powerUpRelease(event, true)}
        onPointerLeave={(event) => powerUpRelease(event, true)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span aria-hidden="true">●</span>
        <small>POWER</small>
      </button>
    </div>
  );
}
