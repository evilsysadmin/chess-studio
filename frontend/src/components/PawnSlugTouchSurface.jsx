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
import { createPawnSlugTouchActionOwners } from '../pawnSlugTouchActionOwners.js';
import './PawnSlugTouchSurface.css';
import './PawnSlugLandscape.css';
import './PawnSlugTouchPress.css';

function haptic(action) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const pattern = pawnSlugTouchHapticPattern(action);
  if (pattern.length) navigator.vibrate(pattern);
}

export default function PawnSlugTouchSurface({ send }) {
  const sendRef = useRef(send);
  const pointersRef = useRef(new Map());
  const timersRef = useRef(new Map());
  const ownersRef = useRef(null);
  const powerPointersRef = useRef(new Map());
  const [trainedZones, setTrainedZones] = useState(() => ({ move: false, gesture: false, fire: false }));
  if (!ownersRef.current) ownersRef.current = createPawnSlugTouchActionOwners();
  sendRef.current = send;

  function trainZone(zone) {
    if (!Object.prototype.hasOwnProperty.call(trainedZones, zone) || trainedZones[zone]) return;
    setTrainedZones((current) => (current[zone] ? current : { ...current, [zone]: true }));
  }

  function cancelPendingRelease(action) {
    let cancelled = false;
    for (const [timer, pendingAction] of timersRef.current) {
      if (pendingAction !== action) continue;
      window.clearTimeout(timer);
      timersRef.current.delete(timer);
      cancelled = true;
    }
    return cancelled;
  }

  function press(action, owner) {
    const keptPressed = cancelPendingRelease(action);
    const firstOwner = ownersRef.current.acquire(action, owner);
    if (firstOwner && !keptPressed) sendRef.current(action, true);
    haptic(action);
  }

  function scheduleRelease(action, startedAt, owner, { immediate = false } = {}) {
    if (!action || owner == null) return;
    const lastOwner = ownersRef.current.release(action, owner);
    if (!lastOwner) return;

    const releaseNow = () => {
      if (!ownersRef.current.has(action)) sendRef.current(action, false);
    };
    const minimumPressMs = immediate ? 0 : pawnSlugTouchMinimumPressMs(action);
    if (minimumPressMs <= 0) {
      releaseNow();
      return;
    }
    const elapsed = Math.max(0, performance.now() - startedAt);
    const delay = Math.max(0, minimumPressMs - elapsed);
    if (delay <= 0) {
      releaseNow();
      return;
    }
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      releaseNow();
    }, delay);
    timersRef.current.set(timer, action);
  }

  useEffect(() => () => {
    const actionsToRelease = new Set();
    for (const [timer, action] of timersRef.current) {
      window.clearTimeout(timer);
      actionsToRelease.add(action);
    }
    timersRef.current.clear();
    for (const action of ownersRef.current.clear()) actionsToRelease.add(action);
    pointersRef.current.clear();
    powerPointersRef.current.clear();
    for (const action of actionsToRelease) sendRef.current(action, false);
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
    scheduleRelease(pointer.action, pointer.actionStartedAt, pointer.owner, { immediate });
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    const start = point(event);
    const zone = pawnSlugTouchZone(start.x, start.width);
    const pointer = {
      owner: event.pointerId,
      zone,
      startX: start.x,
      startY: start.y,
      width: start.width,
      action: null,
      actionStartedAt: 0,
    };

    if (zone === 'move') {
      trainZone('move');
      pointer.action = pawnSlugTouchMoveDirection(start.x, start.width);
      pointer.actionStartedAt = performance.now();
      press(pointer.action, pointer.owner);
    } else if (zone === 'fire') {
      trainZone('fire');
      pointer.action = 'fire';
      pointer.actionStartedAt = performance.now();
      press('fire', pointer.owner);
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
      const direction = pawnSlugTouchMoveDirection(current.x, current.width, pointer.action);
      if (direction !== pointer.action) {
        if (pointer.action) {
          scheduleRelease(pointer.action, pointer.actionStartedAt, pointer.owner, { immediate: true });
        }
        pointer.action = direction;
        pointer.actionStartedAt = performance.now();
        press(direction, pointer.owner);
      }
      return;
    }

    if (pointer.zone !== 'gesture' || pointer.action) return;
    const action = pawnSlugTouchVerticalAction(current.x - pointer.startX, current.y - pointer.startY);
    if (!action) return;
    trainZone('gesture');
    pointer.action = action;
    pointer.actionStartedAt = performance.now();
    press(action, pointer.owner);
  }

  function finish(event, allowTap = true, immediateRelease = false) {
    const pointer = pointersRef.current.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    if (allowTap && pointer.zone === 'gesture' && !pointer.action) {
      const current = point(event);
      const action = pawnSlugTouchTapAction(current.x - pointer.startX, current.y - pointer.startY);
      if (action) {
        trainZone('gesture');
        pointer.action = action;
        pointer.actionStartedAt = performance.now();
        press(action, pointer.owner);
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
    const owner = `power:${event.pointerId}`;
    if (powerPointersRef.current.has(owner)) return;
    powerPointersRef.current.set(owner, performance.now());
    press('grenade', owner);
  }

  function powerUpRelease(event, immediate = false) {
    event.preventDefault();
    event.stopPropagation();
    const owner = `power:${event.pointerId}`;
    const startedAt = powerPointersRef.current.get(owner);
    if (startedAt == null) return;
    powerPointersRef.current.delete(owner);
    scheduleRelease('grenade', startedAt, owner, { immediate });
  }

  const trainingClasses = [
    trainedZones.move ? 'is-move-trained' : '',
    trainedZones.gesture ? 'is-gesture-trained' : '',
    trainedZones.fire ? 'is-fire-trained' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`pawn-slug-gesture-surface${trainingClasses ? ` ${trainingClasses}` : ''}`}
      role="group"
      aria-label="Controles gestuales de Pawn Slug"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="pawn-slug-gesture-hint is-move" aria-hidden="true">MANTÉN ←/→ · CORRER</span>
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
