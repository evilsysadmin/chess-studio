import { lazy, Suspense } from 'react';

const RatingDetailModalInner = lazy(() => import('./RatingDetailModalInner.jsx'));

function RatingDetailFallback({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="army-card rating-detail-modal"
        role="status"
        aria-live="polite"
        aria-label="Cargando detalle de rating"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Cómo te ve la CPU</span>
        <h3>Calculando expediente…</h3>
      </div>
    </div>
  );
}

export default function RatingDetailModal(props) {
  return (
    <Suspense fallback={<RatingDetailFallback onClose={props.onClose} />}>
      <RatingDetailModalInner {...props} />
    </Suspense>
  );
}
