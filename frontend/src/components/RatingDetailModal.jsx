import { RATING_TIERS, ratingProgress, loadRatingHistory } from '../playerRating.js';
import { ratingTrend, tierTrendComment } from '../insights.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import RatingChart from './RatingChart.jsx';

export default function RatingDetailModal({ rating, onClose }) {
  useEscapeToClose(onClose);
  const progress = ratingProgress(rating.rating);
  const history = loadRatingHistory();
  const trend = ratingTrend(history);
  const comment = tierTrendComment(progress.tier.label, trend);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card rating-detail-modal" role="dialog" aria-modal="true" aria-label="Detalle de rating" onClick={(e) => e.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="eyebrow">Cómo te ve la CPU</span>
        <h3>{progress.tier.label} · {rating.rating}</h3>
        <p className="hint-text rating-tier-comment">{comment}</p>

        {!progress.isMaxTier && (
          <>
            <div className="status-chip-bar" style={{ margin: '0.7rem 0 0.3rem' }}>
              <span className="status-chip-bar-fill" style={{ width: `${progress.progressPct}%` }} />
            </div>
            <p className="hint-text" style={{ marginBottom: '1rem' }}>
              Te faltan <b>{progress.pointsToNextTier}</b> puntos para "{RATING_TIERS[RATING_TIERS.indexOf(progress.tier) + 1]?.label}".
            </p>
          </>
        )}
        {progress.isMaxTier && (
          <p className="hint-text" style={{ marginBottom: '1rem' }}>
            Llegaste a la categoría más alta — no hay techo más arriba, pero el rating sigue moviéndose igual
            según tus resultados.
          </p>
        )}

        <div className="menu-section">
          <h2>Evolución</h2>
          <RatingChart history={history} />
        </div>

        <details className="friendly-disclosure rating-detail-more">
          <summary>Ver categorías y cómo se calcula</summary>
          <div className="friendly-disclosure-body">
            <div className="army-list">
              {RATING_TIERS.map((tier) => {
                const isCurrent = tier.label === progress.tier.label;
                const range = tier.max === Infinity ? `${tier.min}+` : `${tier.min}–${tier.max}`;
                return (
                  <div className={`army-row ${isCurrent ? 'rating-tier-current' : ''}`} key={tier.label}>
                    <span className={`army-aura ${isCurrent ? 'tier-gold' : 'tier-dead'}`}>
                      {isCurrent ? '●' : ''}
                    </span>
                    <div className="army-row-info">
                      <span className="army-row-name">{tier.label}</span>
                      <span className="army-row-stats">{range}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="hint-text rating-detail-explanation">
              Funciona como ELO: ganar a un rival fuerte mueve más el rating que ganar a uno flojo. Cuentan Torneo y partidas normales; Práctica y Combat Chess quedan fuera para no mezclar pistas o azar de combate. Hay <b>{rating.games}</b> partida{rating.games === 1 ? '' : 's'} contadas.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
