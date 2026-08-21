import React from 'react';
import { COMBAT_DECORATIONS } from '../combatService.js';

export default function CombatServicePanel({ summary, compact = false }) {
  if (!summary) return null;
  const { stats, merit, rank, nextRank, nextProgress, nextRequirement, decorations, averageSurvivors } = summary;

  return (
    <section className={`combat-service-card ${compact ? 'compact' : ''}`} aria-label="Hoja de servicio de Combat Chess">
      <div className="combat-service-heading">
        <div>
          <span className="combat-service-kicker">HOJA DE SERVICIO</span>
          <strong className="combat-service-rank"><span aria-hidden="true">{rank.insignia}</span> {rank.label}</strong>
        </div>
        <div className="combat-service-merit">
          <b>{merit}</b>
          <span>méritos</span>
        </div>
      </div>

      <div className="combat-service-stats">
        <span><b>{stats.wins}</b> victorias</span>
        <span><b>{stats.battles}</b> batallas</span>
        <span><b>{stats.bestWinStreak}</b> mejor racha</span>
        <span><b>{stats.highestFloorCleared}</b> mejor piso superado</span>
        {averageSurvivors != null && <span><b>{averageSurvivors.toFixed(1)}</b> supervivientes medios</span>}
      </div>

      {nextRank ? (
        <div className="combat-service-next">
          <div className="combat-service-next-copy">
            <span>Siguiente: <b>{nextRank.label}</b></span>
            <small>{nextRank.minMerit} méritos · {nextRequirement}</small>
          </div>
          <div className="combat-service-progress" aria-label={`Progreso de mérito hacia ${nextRank.label}`}>
            <span style={{ width: `${Math.round(nextProgress * 100)}%` }} />
          </div>
        </div>
      ) : (
        <p className="combat-service-max">Rango máximo. Ya sólo queda intentar no hacer el ridículo en el informe.</p>
      )}

      <div className="combat-service-medals">
        <div className="combat-service-medals-title">
          <span>Condecoraciones</span>
          <b>{decorations.length}/{COMBAT_DECORATIONS.length}</b>
        </div>
        {decorations.length > 0 ? (
          <div className="combat-medal-grid">
            {decorations.map((medal) => (
              <span key={medal.id} className="combat-medal" title={`${medal.label}: ${medal.description}`}>
                <i aria-hidden="true">✦</i>
                <span><b>{medal.short}</b><small>{medal.label}</small></span>
              </span>
            ))}
          </div>
        ) : (
          <p className="hint-text combat-service-empty">Todavía ninguna. Sobrevive a algo primero.</p>
        )}
      </div>
    </section>
  );
}
