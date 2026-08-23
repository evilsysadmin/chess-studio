import React from 'react';
import { levelForPoints, pointsIntoLevel, POINTS_PER_LEVEL } from '../tournament.js';
import { ratingLabel } from '../playerRating.js';
import { IconTrophy, IconSword, IconStar } from './Icons.jsx';

function ratingTierClass(rating) {
  if (rating >= 1600) return 'rating-tier-high';
  if (rating >= 1000) return 'rating-tier-mid';
  return '';
}

export default function PlayerStatusBar({ tournament, combatXp, rating, onTournamentClick, onRatingClick, compact = false }) {
  const level = levelForPoints(tournament.progressPoints || 0);
  const into = pointsIntoLevel(tournament.progressPoints || 0);
  const progressPct = Math.round((into / POINTS_PER_LEVEL) * 100);

  if (compact) {
    return (
      <div className="player-status-bar player-status-bar-compact" aria-label="Resumen de progreso">
        <button type="button" className="status-chip status-chip-compact" onClick={onTournamentClick} title="Ir al modo torneo">
          <IconTrophy className="status-chip-icon" />
          <span><small>Torneo</small><b>Nivel {level}</b></span>
        </button>
        <div className="status-chip status-chip-compact" title="XP de Combat Chess">
          <IconSword className="status-chip-icon" />
          <span><small>Combat</small><b>{combatXp} XP</b></span>
        </div>
        <button type="button" className={`status-chip status-chip-compact ${ratingTierClass(rating.rating)}`} onClick={onRatingClick} title="Ver el detalle de tu rating">
          <IconStar className="status-chip-icon" />
          <span><small>Rating</small><b>{rating.rating}</b></span>
        </button>
      </div>
    );
  }

  return (
    <div className="player-status-bar">
      <button type="button" className="status-chip" onClick={onTournamentClick} title="Ir al modo torneo">
        <IconTrophy className="status-chip-icon" />
        <span className="status-chip-body">
          <span className="status-chip-label">Torneo</span>
          <span className="status-chip-value">Nivel {level}</span>
          <span className="status-chip-bar"><span className="status-chip-bar-fill" style={{ width: `${progressPct}%` }} /></span>
          <span className="status-chip-sub status-chip-sub-stack"><span>{into}/{POINTS_PER_LEVEL} XP</span><span>{tournament.points || 0} pts</span></span>
        </span>
      </button>

      <div className="status-chip" title="XP de combate acumulado, para revivir piezas caídas">
        <IconSword className="status-chip-icon" />
        <span className="status-chip-body"><span className="status-chip-label">Combat Chess</span><span className="status-chip-value">{combatXp} XP</span></span>
      </div>

      <button type="button" className={`status-chip ${ratingTierClass(rating.rating)}`} onClick={onRatingClick} title="Ver el detalle de tu rating">
        <IconStar className="status-chip-icon" />
        <span className="status-chip-body"><span className="status-chip-label">La CPU te ve</span><span className="status-chip-value">{ratingLabel(rating.rating)}</span><span className="status-chip-sub">{rating.rating}</span></span>
      </button>
    </div>
  );
}
