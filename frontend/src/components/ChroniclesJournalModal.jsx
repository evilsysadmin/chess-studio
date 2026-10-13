import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesQuestLog from './ChroniclesQuestLog.jsx';
import './ChroniclesJournalModal.css';

export default function ChroniclesJournalModal({ open, state, entries = [], onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEscapeToClose(onClose, { disabled: !open, contextMenu: false });

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    return () => previousFocus?.isConnected && previousFocus.focus?.();
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="chronicles-journal-modal__backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="chronicles-journal-modal" role="dialog" aria-modal="true"
        aria-label="Crónica de expedición"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'j' || event.key === 'J') {
            event.preventDefault();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || []);
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="chronicles-journal-modal__header">
          <div><small>LIBRO DE LA COMPAÑÍA</small><h2>Crónica de expedición</h2></div>
          <button ref={closeRef} type="button" aria-label="Cerrar Crónica" onClick={onClose}>×</button>
        </header>
        <div className="chronicles-journal-modal__scroll" tabIndex={0}>
          <ChroniclesQuestLog state={state} />
          <h3>Folios de expedición</h3>
          {entries.length ? <ol>{entries.map((entry) => (
            <li key={entry.id}><span aria-hidden="true">{entry.sigil}</span>
              <div><strong>{entry.title}</strong><p>{entry.body}</p></div></li>
          ))}</ol> : <p>Aún no hay anotaciones.</p>}
        </div>
        <footer>J · Esc para cerrar</footer>
      </section>
    </div>, document.body,
  );
}
