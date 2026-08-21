import React from 'react';
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
      <div className="army-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
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

        <div className="menu-section">
          <h2>Categorías</h2>
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
        </div>

        <p className="hint-text" style={{ marginTop: '1rem' }}>
          Se calcula tipo ELO: le ganas a un rival fuerte, subes bastante; le ganas a uno flojo, casi nada;
          perder contra algo débil te baja más que perder contra algo fuerte. Cuentan las partidas de Torneo y
          las normales sin "Partida de práctica" (ahí las pistas son gratis, no mide bien tu nivel real).
          Combat Chess queda afuera a propósito: el resultado depende bastante del dado de las capturas, no es una
          señal limpia — para eso está la "pista inversa" del historial de combate — hay{' '}
          <b>{rating.games}</b> partida{rating.games === 1 ? '' : 's'} contadas hasta ahora.
        </p>
      </div>
    </div>
  );
}
