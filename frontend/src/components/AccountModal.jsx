import { lazy, Suspense } from 'react';

const AccountModalInner = lazy(() => Promise.all([
  import('./AccountModalInner.jsx'),
  import('../styles/20-piece-skins.css'),
]).then(([module]) => module));

function AccountModalFallback({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="army-card friendly-modal"
        role="status"
        aria-live="polite"
        aria-label="Cargando mi cuenta"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Mi cuenta</span>
        <h3>Abriendo expediente…</h3>
      </div>
    </div>
  );
}

export default function AccountModal(props) {
  return (
    <Suspense fallback={<AccountModalFallback onClose={props.onClose} />}>
      <AccountModalInner {...props} />
    </Suspense>
  );
}
