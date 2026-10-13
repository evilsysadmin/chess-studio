import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeToClose } from '../useEscapeToClose.js';
import ChroniclesQuestLog, { chroniclesQuestLogEntries } from './ChroniclesQuestLog.jsx';
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

  const quests = chroniclesQuestLogEntries(state);
  const activeCount = quests.filter((quest) => quest.status === 'active').length;

  return createPortal(
    <div className="chronicles-journal-modal__backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="chronicles-journal-modal" role="dialog" aria-modal="true"
        aria-labelledby="chronicles-journal-modal-title"
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
          <span className="chronicles-journal-modal__crest" aria-hidden="true">✥</span>
          <div className="chronicles-journal-modal__heading">
            <small>ARCHIVO DE LA COMPAÑÍA</small>
            <h2 id="chronicles-journal-modal-title">Crónica de expedición</h2>
            <p>El rastro de nuestra aventura, escrito página a página.</p>
          </div>
          <button ref={closeRef} type="button" aria-label="Cerrar Crónica" title="Cerrar (J o Esc)" onClick={onClose}>×</button>
        </header>
        <div className="chronicles-journal-modal__overview" aria-label="Resumen de la expedición">
          <span><b>{activeCount}</b> {activeCount === 1 ? 'encargo activo' : 'encargos activos'}</span>
          <span aria-hidden="true" className="chronicles-journal-modal__overview-divider">✦</span>
          <span><b>{entries.length}</b> {entries.length === 1 ? 'folio escrito' : 'folios escritos'}</span>
        </div>
        <div className="chronicles-journal-modal__scroll" tabIndex={0} role="region" aria-label="Páginas de la crónica">
          <div className="chronicles-journal-modal__pages">
            <section className="chronicles-journal-modal__page chronicles-journal-modal__page--quests" aria-label="Encargos de la compañía">
              <div className="chronicles-journal-modal__page-intro">
                <span>CAPÍTULO I · EL DEBER</span>
                <p>Asuntos pendientes de la compañía</p>
              </div>
              <ChroniclesQuestLog state={state} />
              {!quests.length && <p className="chronicles-journal-modal__empty">Todavía no hay encargos que registrar.</p>}
            </section>
            <section className="chronicles-journal-modal__page chronicles-journal-modal__page--folios" aria-label="Folios de expedición">
              <div className="chronicles-journal-modal__page-intro">
                <span>CAPÍTULO II · LA MEMORIA</span>
                <p>Los lugares y sucesos que dejamos atrás</p>
              </div>
              <h3>Folios de expedición</h3>
              {entries.length ? <ol className="chronicles-journal-modal__folios">{entries.map((entry) => (
                <li key={entry.id}>
                  <span className="chronicles-journal-modal__folio-sigil" aria-hidden="true">{entry.sigil}</span>
                  <div><strong>{entry.title}</strong><p>{entry.body}</p></div>
                </li>
              ))}</ol> : <p className="chronicles-journal-modal__empty">Aún no hay anotaciones. Cada viaje deja su historia.</p>}
            </section>
          </div>
        </div>
        <footer>
          <span>ARCHIVO DE LA EXPEDICIÓN</span>
          <span><kbd>J</kbd> / <kbd>Esc</kbd> para cerrar</span>
        </footer>
      </section>
    </div>, document.body,
  );
}
