import { CPU_IDENTITY } from '../cpuIdentity.js';

export default function MatthiasHomeVisit({ visit = null, onAction, onDismiss, onOpenInsights }) {
  const avatarButton = (
    <button
      type="button"
      className="matthias-home-avatar-button"
      onClick={onOpenInsights}
      aria-label="Abrir Así juegas con Matthias"
      title="Matthias · abrir Así juegas"
    >
      <img className="matthias-home-avatar" src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />
      <span>{CPU_IDENTITY.name}</span>
    </button>
  );

  if (!visit) {
    return <aside className="matthias-home-resident" aria-label="Matthias en Home">{avatarButton}</aside>;
  }

  return (
    <aside className="matthias-home-visit is-speaking" aria-label="Mensaje de Matthias">
      {avatarButton}
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
