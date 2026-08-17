import React from 'react';
import { levelForPoints, pointsIntoLevel, POINTS_PER_LEVEL } from '../tournament.js';
import { ratingLabel } from '../playerRating.js';
import { IconTrophy, IconSword, IconStar } from './Icons.jsx';

// A partir de qué rating el chip se ve "más brillante" — un eco visual muy
// sutil del mismo sistema de bronce/plata/oro que ya usan las piezas del
// Modo Combate, sin inventar una paleta nueva.
function ratingTierClass(rating) {
  if (rating >= 1600) return 'rating-tier-high';
  if (rating >= 1000) return 'rating-tier-mid';
  return '';
}

// Se muestra siempre, en cualquier pantalla — junta en un solo vistazo el
// progreso de los tres sistemas que hoy viven separados en localStorage:
// el nivel del torneo, el XP de combate acumulado, y el rating tipo ELO
// (una estimación de "qué tan bueno eres" según tus resultados contra la
// CPU en torneo y combate).
export default function PlayerStatusBar({ tournament, combatXp, rating, onTournamentClick, onRatingClick }) {
  const level = levelForPoints(tournament.points);
  const into = pointsIntoLevel(tournament.points);
  const progressPct = Math.round((into / POINTS_PER_LEVEL) * 100);

  return (
    <div className="player-status-bar">
      <button type="button" className="status-chip" onClick={onTournamentClick} title="Ir al modo torneo">
        <IconTrophy className="status-chip-icon" />
        <span className="status-chip-body">
          <span className="status-chip-label">Torneo</span>
          <span className="status-chip-value">Nivel {level}</span>
          <span className="status-chip-bar">
            <span className="status-chip-bar-fill" style={{ width: `${progressPct}%` }} />
          </span>
          <span className="status-chip-sub">{into}/{POINTS_PER_LEVEL} XP</span>
        </span>
      </button>

      <div className="status-chip" title="XP de combate acumulado, para revivir piezas caídas">
        <IconSword className="status-chip-icon" />
        <span className="status-chip-body">
          <span className="status-chip-label">Combate</span>
          <span className="status-chip-value">{combatXp} XP</span>
        </span>
      </div>

      <button
        type="button"
        className={`status-chip ${ratingTierClass(rating.rating)}`}
        onClick={onRatingClick}
        title="Ver el detalle de tu rating"
      >
        <IconStar className="status-chip-icon" />
        <span className="status-chip-body">
          <span className="status-chip-label">La CPU te ve</span>
          <span className="status-chip-value">{ratingLabel(rating.rating)}</span>
          <span className="status-chip-sub">{rating.rating}</span>
        </span>
      </button>
    </div>
  );
}
