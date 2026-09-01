import { useEffect, useState } from 'react';
import { getEffectiveReducedMotion } from '../userPreferences.js';
import './MatthiasWarRoomPortrait.css';
import './WarRoomReferencePolish.css';
import './WarRoomTurnPill.css';

function speechDuration(text) {
  return Math.max(1500, Math.min(4200, String(text || '').length * 46));
}

export function nextWarRoomGesture(random = Math.random) {
  const roll = random();
  if (roll < 0.08) return 'coffee';
  if (roll < 0.34) return 'glare';
  if (roll < 0.56) return 'head-left';
  if (roll < 0.78) return 'head-right';
  return 'glance';
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
  const [blinking, setBlinking] = useState(false);
  const [reaction, setReaction] = useState('none');
  const normalizedAnger = normalizeAngerLevel(angerLevel);

  useEffect(() => {
    if (!speechKey || !speechText || getEffectiveReducedMotion()) return undefined;
    setSpeaking(true);
    const timer = window.setTimeout(() => setSpeaking(false), speechDuration(speechText));
    return () => window.clearTimeout(timer);
  }, [speechKey, speechText]);

  useEffect(() => {
    if (!reactionKey || getEffectiveReducedMotion()) return undefined;
    const next = normalizeReaction(reactionType);
    if (next === 'none') return undefined;
    setReaction(next);
    const timer = window.setTimeout(() => setReaction('none'), next === 'disapprove' ? 1150 : 1350);
    return () => window.clearTimeout(timer);
  }, [reactionKey, reactionType]);

  useEffect(() => {
    if (getEffectiveReducedMotion()) return undefined;
    let blinkTimer = 0;
    let reopenTimer = 0;
    let cancelled = false;

    const scheduleBlink = () => {
      const delay = 2600 + Math.round(Math.random() * 3800);
      blinkTimer = window.setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        reopenTimer = window.setTimeout(() => {
          if (cancelled) return;
          setBlinking(false);
          scheduleBlink();
        }, 135);
      }, delay);
    };

    scheduleBlink();
    return () => {
      cancelled = true;
      window.clearTimeout(blinkTimer);
      window.clearTimeout(reopenTimer);
    };
  }, []);

  useEffect(() => {
    if (getEffectiveReducedMotion()) return undefined;
    let gestureTimer = 0;
    let resetTimer = 0;
    let cancelled = false;

    const schedule = () => {
      const delay = 3400 + Math.round(Math.random() * 5200);
      gestureTimer = window.setTimeout(() => {
        if (cancelled) return;
        const next = nextWarRoomGesture();
        setGesture(next);
        const duration = next === 'coffee' ? 3600 : next === 'glare' ? 1900 : 1450;
        resetTimer = window.setTimeout(() => {
          if (cancelled) return;
          setGesture('idle');
          schedule();
        }, duration);
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(gestureTimer);
      window.clearTimeout(resetTimer);
    };
  }, []);

  const ordering = speaking || gesture === 'order';
  const stateClass = [
    speaking ? 'is-speaking' : '',
    ordering ? 'is-ordering' : '',
    blinking ? 'is-blinking' : '',
    gesture === 'glance' ? 'is-glancing' : '',
    gesture === 'glare' ? 'is-glaring' : '',
    gesture === 'head-left' ? 'is-head-left' : '',
    gesture === 'head-right' ? 'is-head-right' : '',
    gesture === 'coffee' ? 'has-coffee' : '',
    reaction === 'disapprove' ? 'is-disapproving' : '',
    reaction === 'smirk' ? 'is-smirking' : '',
    `anger-level-${normalizedAnger}`,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`game-3d-matthias-portrait-wrap ${stateClass}`}
      data-matthias-warroom-gesture={gesture}
      data-matthias-anger-level={normalizedAnger}
      data-matthias-reaction={reaction}
    >
      <span className="game-3d-matthias-character" aria-hidden="true">
        <img src={avatar} alt="" className="game-3d-matthias-portrait" />
        <span className="game-3d-matthias-brows" />
        <span className="game-3d-matthias-eyelids" />
        <span className="game-3d-matthias-mouth" />
      </span>
      <span className="sr-only">Matthias, peón militar rival</span>
      <span className="game-3d-matthias-coffee" aria-hidden="true"><i /><b /></span>
      <span className="game-3d-matthias-rank" aria-hidden="true">♟</span>
    </div>
  );
}
