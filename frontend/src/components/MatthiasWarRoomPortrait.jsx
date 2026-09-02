import { useEffect, useState } from 'react';
import { getEffectiveReducedMotion, USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import MatthiasThreeAvatar from './MatthiasThreeAvatar.jsx';
import './MatthiasWarRoomPortrait.css';
import './MatthiasWarRoomThreeAvatar.css';
import './WarRoomReferencePolish.css';
import './WarRoomTurnPill.css';
import './WarRoom3DMobileControls.css';
import './WarRoomDesktopRailLayout.css';

const COMPACT_WAR_ROOM_QUERY = '(max-width: 820px)';
export const WAR_ROOM_COMPACT_MOTION_INTENSITY = 1.35;

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

export function nextWarRoomGesture(random = Math.random) {
  const roll = random();
  if (roll < 0.055) return 'coffee';
  if (roll < 0.2) return 'lean-in';
  if (roll < 0.36) return 'glare';
  if (roll < 0.53) return 'head-left';
  if (roll < 0.7) return 'head-right';
  if (roll < 0.85) return 'survey';
  return 'glance';
}

function gestureDuration(gesture) {
  if (gesture === 'coffee') return 3400;
  if (gesture === 'survey') return 2600;
  if (gesture === 'lean-in') return 2100;
  if (gesture === 'glare') return 2000;
  if (gesture === 'head-left' || gesture === 'head-right') return 1650;
  return 1500;
}

function normalizeAngerLevel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(4, Math.round(parsed)));
}

function normalizeReaction(value) {
  return value === 'disapprove' || value === 'smirk' ? value : 'none';
}

export default function MatthiasWarRoomPortrait({
  avatar,
  speechKey = '',
  speechText = '',
  angerLevel = 0,
  reactionKey = '',
  reactionType = 'none',
}) {
  const [speaking, setSpeaking] = useState(false);
  const [gesture, setGesture] = useState('idle');
  const [reaction, setReaction] = useState('none');
  const [reducedMotion, setReducedMotionState] = useState(() => getEffectiveReducedMotion());
  const [compactViewport, setCompactViewport] = useState(() => warRoomCompactViewport());
  const normalizedAnger = normalizeAngerLevel(angerLevel);

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
    if (!speechKey || !speechText || reducedMotion) return undefined;
    setSpeaking(true);
    const timer = window.setTimeout(() => setSpeaking(false), speechDuration(speechText));
    return () => window.clearTimeout(timer);
  }, [reducedMotion, speechKey, speechText]);

  useEffect(() => {
    if (!reactionKey || reducedMotion) return undefined;
    const next = normalizeReaction(reactionType);
    if (next === 'none') return undefined;
    setReaction(next);
    const timer = window.setTimeout(() => setReaction('none'), next === 'disapprove' ? 1150 : 1350);
    return () => window.clearTimeout(timer);
  }, [reactionKey, reactionType, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    let gestureTimer = 0;
    let resetTimer = 0;
    let cancelled = false;

    const schedule = () => {
      const delay = 2400 + Math.round(Math.random() * 3800);
      gestureTimer = window.setTimeout(() => {
        if (cancelled) return;
        const next = nextWarRoomGesture();
        setGesture(next);
        resetTimer = window.setTimeout(() => {
          if (cancelled) return;
          setGesture('idle');
          schedule();
        }, gestureDuration(next));
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(gestureTimer);
      window.clearTimeout(resetTimer);
    };
  }, [reducedMotion]);

  const stateClass = [
    speaking ? 'is-speaking is-ordering' : '',
    gesture === 'glance' ? 'is-glancing' : '',
    gesture === 'glare' ? 'is-glaring' : '',
    gesture === 'head-left' ? 'is-head-left' : '',
    gesture === 'head-right' ? 'is-head-right' : '',
    gesture === 'lean-in' ? 'is-leaning-in' : '',
    gesture === 'survey' ? 'is-surveying' : '',
    gesture === 'coffee' ? 'has-coffee' : '',
    reaction === 'disapprove' ? 'is-disapproving' : '',
    reaction === 'smirk' ? 'is-smirking' : '',
    compactViewport ? 'is-compact-motion' : '',
    `anger-level-${normalizedAnger}`,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`game-3d-matthias-portrait-wrap ${stateClass}`}
      data-matthias-warroom-gesture={gesture}
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
            activity={reaction === 'disapprove' ? 'Desaprobación táctica' : reaction === 'smirk' ? 'Ventaja táctica' : 'Vigilando el tablero'}
            speaking={speaking}
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
