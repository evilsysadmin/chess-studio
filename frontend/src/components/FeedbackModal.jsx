import { lazy, Suspense } from 'react';

const FeedbackModalInner = lazy(() => import('./FeedbackModalInner.jsx'));

function FeedbackModalFallback({ onClose }) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <section
        className="army-card feedback-modal"
        role="status"
        aria-live="polite"
        aria-label="Cargando feedback"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Feedback</span>
        <h2>Preparando el formulario…</h2>
        <p className="hint-text">Cargando historial y adjuntos.</p>
      </section>
    </div>
  );
}

export default function FeedbackModal(props) {
  return (
    <Suspense fallback={<FeedbackModalFallback onClose={props.onClose} />}>
      <FeedbackModalInner {...props} />
    </Suspense>
  );
}
