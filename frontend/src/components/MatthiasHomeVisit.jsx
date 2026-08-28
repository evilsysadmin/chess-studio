import { CPU_IDENTITY } from '../cpuIdentity.js';

export default function MatthiasHomeVisit({ model, speaking = false, onAction, onDismiss, onOpenInsights }) {
  if (!model) return null;
  return (
    <aside className={`matthias-home-card matthias-home-card--${model.variant}${speaking ? ' is-speaking' : ''}`} aria-label="Rincón de Matthias">
      <button
        type="button"
        className="matthias-home-card__main"
        onClick={onOpenInsights}
        aria-label="Abrir Así juegas con Matthias"
        aria-describedby="matthias-home-message"
        title="Matthias · abrir Así juegas"
      >
        <div className="matthias-home-card__speech">
          <span className="section-label">{model.eyebrow}</span>
          <p id="matthias-home-message">{model.text}</p>
          {model.meta ? <small>{model.meta}</small> : null}
        </div>
        <div className="matthias-home-card__character" aria-hidden="true">
          <img src={CPU_IDENTITY.avatar} alt="" />
          <span>{CPU_IDENTITY.name}</span>
          <small>rival residente</small>
        </div>
      </button>
      <div className="matthias-home-card__actions">
        <button type="button" className="matthias-home-card__cta" onClick={onAction}>{model.actionLabel} <span aria-hidden="true">→</span></button>
        {speaking ? <button type="button" className="matthias-home-card__dismiss" onClick={onDismiss} aria-label="Cerrar comentario de Matthias">×</button> : null}
      </div>
    </aside>
  );
}
