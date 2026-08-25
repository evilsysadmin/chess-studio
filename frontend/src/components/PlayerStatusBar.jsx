import { levelForPoints } from '../tournament.js';
import { IconTrophy, IconSword, IconStar } from './Icons.jsx';

function ratingTierClass(rating) {
  if (rating >= 1600) return 'rating-tier-high';
  if (rating >= 1000) return 'rating-tier-mid';
  return '';
}

export default function PlayerStatusBar({ tournament, combatXp, rating, onTournamentClick, onCombatClick, onRatingClick }) {
  const level = levelForPoints(tournament.progressPoints || 0);

  return (
    <div className="player-status-bar player-status-bar-compact" aria-label="Resumen de progreso">
      <button type="button" className="status-chip status-chip-compact" onClick={onTournamentClick} title="Ir al modo torneo" aria-label={`Torneo: nivel ${level}`}>
        <IconTrophy className="status-chip-icon" />
        <span><small>Torneo</small><b>Nivel {level}</b></span>
      </button>
      <button type="button" className="status-chip status-chip-compact" onClick={onCombatClick} title="Ver el estado de tu ejército" aria-label={`Estado de Combat: ${combatXp} XP`}>
        <IconSword className="status-chip-icon" />
        <span><small>Combat</small><b>{combatXp} XP</b></span>
      </button>
      <button type="button" className={`status-chip status-chip-compact ${ratingTierClass(rating.rating)}`} onClick={onRatingClick} title="Ver el detalle de tu rating" aria-label={`Rating: ${rating.rating}`}>
        <IconStar className="status-chip-icon" />
        <span><small>Rating</small><b>{rating.rating}</b></span>
      </button>
    </div>
  );
}
