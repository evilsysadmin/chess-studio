import { useEffect, useState } from 'react';
import {
  WAR_ROOM_AMBIENCE_CHANGED_EVENT,
  WAR_ROOM_AMBIENCE_MUTED_KEY,
  isWarRoomAmbienceMuted,
  setWarRoomAmbienceMuted,
} from '../warRoomAmbiencePreferences.js';
import './WarRoomAmbienceToggle.css';

function SpeakerIcon({ muted }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 9.2h3.1l4.3-3.7v13l-4.3-3.7H4.5z" />
      {!muted && <path className="war-room-ambience-toggle__waves" d="M15 8.2c1.15 1 1.15 6.6 0 7.6M17.7 5.7c2.7 2.2 2.7 10.4 0 12.6" />}
      {muted && <path className="war-room-ambience-toggle__slash" d="M14.7 9.1l5.2 5.8m0-5.8l-5.2 5.8" />}
    </svg>
  );
}

export default function WarRoomAmbienceToggle() {
  const [muted, setMuted] = useState(() => isWarRoomAmbienceMuted());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refresh = () => setMuted(isWarRoomAmbienceMuted());
    const onStorage = (event) => {
      if (event.key === null || event.key === WAR_ROOM_AMBIENCE_MUTED_KEY) refresh();
    };
    window.addEventListener(WAR_ROOM_AMBIENCE_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WAR_ROOM_AMBIENCE_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function toggle() {
    setMuted(setWarRoomAmbienceMuted(!muted));
  }

  const action = muted ? 'Activar ambiente de la War Room' : 'Silenciar ambiente de la War Room';

  return (
    <button
      type="button"
      className={`war-room-ambience-toggle${muted ? ' is-muted' : ''}`}
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={action}
      title={`${action} · lluvia, viento, fuego y sala`}
    >
      <SpeakerIcon muted={muted} />
      <span className="sr-only">Ambiente de sala {muted ? 'silenciado' : 'activo'}</span>
    </button>
  );
}
