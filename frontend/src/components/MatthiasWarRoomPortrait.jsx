import { useEffect, useMemo, useReducer, useState } from 'react';
import { getEffectiveReducedMotion, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import MatthiasThreeAvatar from './MatthiasThreeAvatar.jsx';
import {
  createMatthiasWarRoomMachine,
  MATTHIAS_WAR_ROOM_STATES,
  MATTHIAS_WAR_ROOM_STATE_VERSION,
  matthiasWarRoomIdleDelay,
  matthiasWarRoomStateDescriptor,
  matthiasWarRoomStateDuration,
  nextMatthiasAmbientState,
  normalizeWarRoomAnger,
  normalizeWarRoomReaction,
  transitionMatthiasWarRoom,
} from './matthiasWarRoomStateMachine.js';
import './MatthiasWarRoomPortrait.css';
import './MatthiasWarRoomStateExpressions.css';
import './MatthiasWarRoomThreeAvatar.css';
import './MatthiasWarRoomAndroidMotion.css';
import './WarRoomReferencePolish.css';
import './WarRoomTurnPill.css';
import './WarRoom3DMobileControls.css';
import './WarRoomDesktopRailLayout.css';

const COMPACT_WAR_ROOM_QUERY = '(max-width: 820px)';
export const WAR_ROOM_COMPACT_MOTION_INTENSITY = 1.35;

const AMBIENT_STATES = new Set([
  MATTHIAS_WAR_ROOM_STATES.GLANCE,
  MATTHIAS_WAR_ROOM_STATES.GLARE,
  MATTHIAS_WAR_ROOM_STATES.HEAD_LEFT,
  MATTHIAS_WAR_ROOM_STATES.HEAD_RIGHT,
  MATTHIAS_WAR_ROOM_STATES.LEAN_IN,
  MATTHIAS_WAR_ROOM_STATES.SURVEY,
  MATTHIAS_WAR_ROOM_STATES.COFFEE,
]);

function speechDuration(text) {
  return Math.max(1500, Math.min(4200, String(text || '').length * 46));
}

export function warRoomCompactViewport({ mediaMatches, innerWidth } = {}) {
  if (typeof mediaMatches === 'boolean') return mediaMatches;
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') return window.matchMedia(COMPACT_WAR_ROOM_QUERY).matches;
  const width = innerWidth ?? window.innerWidth;
  return Number.isFinite(width) && width <= 820;
}

export function nextWarRoomGesture(random = Math.random, angerLevel = 0, lastAmbient = null) {
  return nextMatthiasAmbientState({ random, angerLevel, lastAmbient });
}

export default function MatthiasWarRoomPortrait({
  avatar,
  speechKey = '',
  speechText = '',
  angerLevel = 0,
  reactionKey = '',
  reactionType = 'none',
}) {
  const [machine, dispatch] = useReducer(transitionMatthiasWarRoom, undefined, createMatthiasWarRoomMachine);
  const [reducedMotion, setReducedMotionState] = useState(() => getEffectiveReducedMotion());
  const [compactViewport, setCompactViewport] = useState(() => warRoomCompactViewport());
  const normalizedAnger = normalizeWarRoomAnger(angerLevel);
  const descriptor = useMemo(
    () => matthiasWarRoomStateDescriptor(machine.mode, normalizedAnger),
    [machine.mode, normalizedAnger],
  );
  const reaction = machine.mode === MATTHIAS_WAR_ROOM_STATES.GRUMBLE
    ? 'disapprove'
    : machine.mode === MATTHIAS_WAR_ROOM_STATES.SMIRK
      ? 'smirk'
      : 'none';
  // Keep the Three.js renderer stable for posture-only microstates. Only coffee
  // needs a different inner mesh profile (`sip`); glance/glare/etc. belong to
  // the outer actor rig and must not recreate a WebGL context every few seconds.
  const motionActivity = machine.mode === MATTHIAS_WAR_ROOM_STATES.COFFEE
    ? descriptor.activity
    : 'Vigilando el tablero';

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const refresh = () => setReducedMotionState(getEffectiveReducedMotion());
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
    media?.addEventListener?.('change', refresh);
    return () => {
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
      media?.removeEventListener?.('change', refresh);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia(COMPACT_WAR_ROOM_QUERY)
      : null;
    const refresh = () => setCompactViewport(warRoomCompactViewport({
      mediaMatches: media?.matches,
      innerWidth: window.innerWidth,
    }));
    refresh();
    media?.addEventListener?.('change', refresh);
    if (!media) window.addEventListener('resize', refresh);
    return () => {
      media?.removeEventListener?.('change', refresh);
      if (!media) window.removeEventListener('resize', refresh);
    };
  }, []);

  useEffect(() => {
    if (!reducedMotion) return;
    dispatch({ type: 'RESET' });
  }, [reducedMotion]);

  useEffect(() => {
    if (!speechKey || !speechText || reducedMotion || typeof window === 'undefined') return undefined;
    dispatch({ type: 'SPEECH_START' });
    const timer = window.setTimeout(
      () => dispatch({ type: 'SPEECH_END' }),
      speechDuration(speechText),
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, speechKey, speechText]);

  useEffect(() => {
    if (!reactionKey || reducedMotion || typeof window === 'undefined') return undefined;
    const reactionMode = normalizeWarRoomReaction(reactionType);
    if (!reactionMode) return undefined;
    dispatch({ type: 'REACTION_START', reaction: reactionType });
    const timer = window.setTimeout(
      () => dispatch({ type: 'REACTION_END', reaction: reactionType }),
      matthiasWarRoomStateDuration(reactionMode, normalizedAnger),
    );
    return () => window.clearTimeout(timer);
  }, [reactionKey, reactionType, reducedMotion, normalizedAnger]);

  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') return undefined;
    let timer = 0;

    if (machine.mode === MATTHIAS_WAR_ROOM_STATES.IDLE && !machine.speaking) {
      const next = nextMatthiasAmbientState({
        angerLevel: normalizedAnger,
        lastAmbient: machine.lastAmbient,
      });
      timer = window.setTimeout(
        () => dispatch({ type: 'AMBIENT_START', mode: next }),
        matthiasWarRoomIdleDelay(Math.random, normalizedAnger),
      );
    } else if (AMBIENT_STATES.has(machine.mode)) {
      timer = window.setTimeout(
        () => dispatch({ type: 'AMBIENT_END', mode: machine.mode }),
        matthiasWarRoomStateDuration(machine.mode, normalizedAnger),
      );
    }

    return () => window.clearTimeout(timer);
  }, [machine.mode, machine.speaking, machine.lastAmbient, normalizedAnger, reducedMotion]);

  const stateClass = [
    machine.speaking ? 'is-speaking is-ordering' : '',
    descriptor.gesture === 'glance' ? 'is-glancing' : '',
    descriptor.gesture === 'glare' ? 'is-glaring' : '',
    descriptor.gesture === 'head-left' ? 'is-head-left' : '',
    descriptor.gesture === 'head-right' ? 'is-head-right' : '',
    descriptor.gesture === 'lean-in' ? 'is-leaning-in' : '',
    descriptor.gesture === 'survey' ? 'is-surveying' : '',
    descriptor.gesture === 'coffee' ? 'has-coffee' : '',
    reaction === 'disapprove' ? 'is-disapproving' : '',
    reaction === 'smirk' ? 'is-smirking' : '',
    compactViewport ? 'is-compact-motion' : '',
    `anger-level-${normalizedAnger}`,
    `expression-${descriptor.expression}`,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`game-3d-matthias-portrait-wrap ${stateClass}`}
      data-matthias-warroom-state={machine.mode}
      data-matthias-warroom-state-version={MATTHIAS_WAR_ROOM_STATE_VERSION}
      data-matthias-warroom-gesture={descriptor.gesture}
      data-matthias-expression={descriptor.expression}
      data-matthias-speaking={machine.speaking ? 'true' : 'false'}
      data-matthias-anger-level={normalizedAnger}
      data-matthias-reaction={reaction}
      data-matthias-face-overlay="none"
      data-matthias-face-rig="three-mesh-v1"
      data-matthias-motion-version="v4-android"
      data-matthias-compact-motion={compactViewport ? 'true' : 'false'}
    >
      <span className="game-3d-matthias-presence" aria-hidden="true" />
      <span className="game-3d-matthias-character" aria-hidden="true">
        <span className="game-3d-matthias-portrait">
          <MatthiasThreeAvatar
            avatar={avatar}
            scene="war-room-command"
            activity={motionActivity}
            speaking={machine.speaking}
            reducedMotion={reducedMotion}
            motionIntensity={compactViewport ? WAR_ROOM_COMPACT_MOTION_INTENSITY : 1}
          />
        </span>
      </span>
      <span className="sr-only">Matthias, peón militar rival</span>
      <span className="game-3d-matthias-coffee" aria-hidden="true"><i /><b /></span>
      <span className="game-3d-matthias-rank" aria-hidden="true">♟</span>
    </div>
  );
}
