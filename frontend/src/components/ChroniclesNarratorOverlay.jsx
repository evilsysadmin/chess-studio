import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeToClose } from '../useEscapeToClose.js';
import './ChroniclesNarratorOverlay.css';

const LOW_SIGNAL_NARRATION = Object.freeze([
  /^Giras a la (izquierda|derecha)\.$/i,
  /^Piedra, polvo y la sospecha de que algo respira detrás del muro\.$/i,
  /^Hay una pared\./i,
  /contra absolutamente nada\./i,
  / impacta con .* responde/i,
  / alcanza .* con /i,
  / castiga a la torre carcelero desde la retaguardia /i,
  /^Turno de las criaturas:/i,
  /^Combate por turnos · iniciativa =/i,
]);

const PARTY_OWNED_MILESTONES = Object.freeze([
  /^El sello despierta\./i,
  / remata al peón corrompido /i,
  / derriba a la torre carcelero /i,
  / deshace al alfil espectral /i,
  / derriba al caballo carroñero /i,
  /^Salida encontrada\./i,
]);

export function shouldShowChroniclesNarration(message) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return false;
  return ![...LOW_SIGNAL_NARRATION, ...PARTY_OWNED_MILESTONES].some((pattern) => pattern.test(text));
}

export default function ChroniclesNarratorOverlay({ message, children = null, open = false, onOpenChange = () => {} }) {
  const isMeaningful = shouldShowChroniclesNarration(message);
  const [lastNarration, setLastNarration] = useState(() => (isMeaningful ? message : ''));
  const dialogId = useId();
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (isMeaningful) setLastNarration(message);
  }, [isMeaningful, message]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('.chronicles-dm-close')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  // Android/browser Back follows the same stack as other game dialogs.
  useEscapeToClose(() => onOpenChange(false), { disabled: !open, contextMenu: false });

  const narration = isMeaningful ? message : lastNarration || 'Todavía no hay anotaciones en la crónica.';

  function onDialogKeyDown(event) {
    // No movement, attack or game-menu hotkeys while the reader owns focus.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialogRef.current?.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      {/* The desktop MM3 note stays as a passive band; the reader is opt-in. */}
      <div className="chronicles-dm-band" role="status" aria-live="polite">{narration}</div>
      <div className="chronicles-dm-overlay">
        <button ref={triggerRef} type="button" className="chronicles-dm-trigger"
          aria-label="Crónica de expedición" aria-haspopup="dialog" aria-expanded={open}
          aria-controls={dialogId} onClick={() => onOpenChange(!open)}>
          <span className="chronicles-dm-sigil" aria-hidden="true">✦</span>
          <span>Crónica</span>
          <span className="chronicles-dm-chevron" aria-hidden="true">⌄</span>
        </button>
      </div>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="chronicles-dm-backdrop" onClick={(event) => {
          if (event.target === event.currentTarget) onOpenChange(false);
        }}>
          <section ref={dialogRef} id={dialogId} className="chronicles-dm-dialog" role="dialog"
            aria-modal="true" aria-labelledby={dialogId + '-title'} onKeyDown={onDialogKeyDown}>
            <header className="chronicles-dm-dialog-header">
              <div>
                <span className="chronicles-dm-kicker">EL LIBRO DE LAS EXPEDICIONES</span>
                <h2 id={dialogId + '-title'}>Crónica</h2>
              </div>
              <button type="button" className="chronicles-dm-close" aria-label="Cerrar crónica"
                onClick={() => onOpenChange(false)}>×</button>
            </header>
            <div ref={scrollRef} className="chronicles-dm-dialog-body" tabIndex={0}>
              <span className="chronicles-dm-kicker">CRÓNICA DE EXPEDICIÓN</span>
              <p>{narration}</p>
              {children && <div className="chronicles-dm-quests">{children}</div>}
            </div>
          </section>
        </div>, document.body,
      )}
    </>
  );
}