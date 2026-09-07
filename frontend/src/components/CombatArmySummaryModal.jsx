import { lazy, Suspense } from 'react';

const CombatArmySummaryModalInner = lazy(() => import('./CombatArmySummaryModalInner.jsx'));

function CombatArmySummaryFallback({ onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="army-card combat-summary-modal" role="status" aria-live="polite" aria-label="Cargando resumen de Combat Chess" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="section-label">COMBAT CHESS</span>
        <h2>Abriendo expediente…</h2>
      </section>
    </div>
  );
}

export default function CombatArmySummaryModal(props) {
  return (
    <Suspense fallback={<CombatArmySummaryFallback onClose={props.onClose} />}>
      <CombatArmySummaryModalInner {...props} />
    </Suspense>
  );
}
