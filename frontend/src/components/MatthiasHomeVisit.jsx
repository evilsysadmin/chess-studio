import { CPU_IDENTITY } from '../cpuIdentity.js';

export default function MatthiasHomeVisit({ visit, onAction, onDismiss }) {
  if (!visit) return null;
  return (
    <aside className="matthias-home-visit" aria-label="Mensaje de Matthias">
      <img className="matthias-home-avatar" src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
      <div className="matthias-home-copy">
        <span className="section-label">{CPU_IDENTITY.name} · rival residente</span>
        <p>{visit.text}</p>
      </div>
      <div className="matthias-home-actions">
        <button type="button" className="secondary-btn matthias-home-cta" onClick={onAction}>{visit.actionLabel}</button>
        <button type="button" className="matthias-home-dismiss" onClick={onDismiss} aria-label="Cerrar comentario de Matthias">×</button>
      </div>
    </aside>
  );
}
