import { useEffect, useState } from 'react';
import { getEffectiveReducedMotion } from '../userPreferences.js';
import './MatthiasWarRoomPortrait.css';
import './WarRoomReferencePolish.css';

function speechDuration(text) {
  return Math.max(1500, Math.min(4200, String(text || '').length * 46));
}

export function nextWarRoomGesture(random = Math.random) {
  const roll = random();
  if (roll < 0.18) return 'coffee';
  if (roll < 0.42) return 'order';
  return 'glance';
}

export default function MatthiasWarRoomPortrait({ avatar, speechKey = '', speechText = '' }) {
  const [speaking, setSpeaking] = useState(false);
  const [gesture, setGesture] = useState('idle');

  useEffect(() => {
    if (!speechKey || !speechText || getEffectiveReducedMotion()) return undefined;
    setSpeaking(true);
    const timer = window.setTimeout(() => setSpeaking(false), speechDuration(speechText));
    return () => window.clearTimeout(timer);
  }, [speechKey, speechText]);

  useEffect(() => {
    if (getEffectiveReducedMotion()) return undefined;
    let gestureTimer = 0;
    let resetTimer = 0;
    let cancelled = false;

    const schedule = () => {
      const delay = 15000 + Math.round(Math.random() * 21000);
      gestureTimer = window.setTimeout(() => {
        if (cancelled) return;
        const next = nextWarRoomGesture();
        setGesture(next);
        const duration = next === 'coffee' ? 4600 : next === 'order' ? 1800 : 2100;
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
    gesture === 'glance' ? 'is-glancing' : '',
    gesture === 'coffee' ? 'has-coffee' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`game-3d-matthias-portrait-wrap ${stateClass}`} data-matthias-warroom-gesture={gesture}>
      <img src={avatar} alt="Matthias, peón militar" className="game-3d-matthias-portrait" />
      <span className="game-3d-matthias-mouth" aria-hidden="true" />
      <span className="game-3d-matthias-coffee" aria-hidden="true"><i /><b /></span>
      <span className="game-3d-matthias-rank" aria-hidden="true">♟</span>
    </div>
  );
}
