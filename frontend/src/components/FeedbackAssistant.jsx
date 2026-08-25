import { useEffect, useState } from 'react';
import { STORAGE_LOCAL, getStorageItem } from '../safeStorage.js';
import { setProfileStorageItem } from '../profileKeys.js';

const STORAGE_KEY = 'chess-study-feedback-assistant-v1';
const NUDGE_DELAY_MS = 12_000;
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const THANK_YOU_PAUSE_MS = 14 * 24 * 60 * 60 * 1000;

function readAssistantState() {
  try {
    const value = JSON.parse(getStorageItem(STORAGE_LOCAL, STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function pauseAssistant(duration) {
  setProfileStorageItem(STORAGE_KEY, JSON.stringify({ nextPromptAt: Date.now() + duration }));
}

export default function FeedbackAssistant({ blocked = false, autoOpen = true, onFeedback }) {
  const [open, setOpen] = useState(false);
  const [attention, setAttention] = useState(false);

  useEffect(() => {
    if (blocked || open) return undefined;
    const { nextPromptAt = 0 } = readAssistantState();
    if (nextPromptAt > Date.now()) return undefined;
    const timer = window.setTimeout(() => {
      if (autoOpen) setOpen(true);
      else setAttention(true);
    }, NUDGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoOpen, blocked, open]);

  function dismiss() {
    pauseAssistant(SNOOZE_MS);
    setAttention(false);
    setOpen(false);
  }

  function openFeedback() {
    pauseAssistant(THANK_YOU_PAUSE_MS);
    setAttention(false);
    setOpen(false);
    onFeedback();
  }

  function toggleAssistant() {
    if (open) dismiss();
    else {
      setAttention(false);
      setOpen(true);
    }
  }

  const avatarSrc = `${import.meta.env.BASE_URL}support-pawn.png`;

  return (
    <div className="feedback-assistant">
      {open && !blocked && (
        <aside className="feedback-assistant-card" aria-label="Asistente de feedback">
          <button type="button" className="feedback-assistant-close" onClick={dismiss} aria-label="Cerrar sugerencia">×</button>
          <img src={avatarSrc} alt="" className="feedback-assistant-avatar feedback-assistant-avatar-card" />
          <div className="feedback-assistant-copy">
            <span className="section-label">OFICIAL DE SOPORTE</span>
            <strong>¿Cómo va Chess Studio?</strong>
            <p>Si algo te frena, no se entiende o tienes una idea, cuéntamelo.</p>
            <div className="feedback-assistant-actions">
              <button type="button" className="primary-btn" onClick={openFeedback}>Dar feedback</button>
              <button type="button" className="secondary-btn" onClick={dismiss}>Ahora no</button>
            </div>
          </div>
        </aside>
      )}
      {!open && (
        <button
          type="button"
          className={`feedback-assistant-launcher ${attention ? 'has-attention' : ''}`}
          onClick={toggleAssistant}
          aria-label="Abrir asistente de feedback"
          aria-expanded="false"
        >
          <img src={avatarSrc} alt="" className="feedback-assistant-avatar" />
          <span>Feedback</span>
        </button>
      )}
    </div>
  );
}
