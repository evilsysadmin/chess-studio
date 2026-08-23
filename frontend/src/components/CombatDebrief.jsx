import { combatVeteranHighlight } from '../combatDebrief.js';


const PIECE = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

function outcomeTitle(outcome) {
  if (outcome === 'win') return 'Operación completada';
  if (outcome === 'retired') return 'Retirada registrada';
  if (outcome === 'draw') return 'Contacto inconcluso';
  return 'Operación perdida';
}

export default function CombatDebrief({ debrief, compact = false, onViewBattle = null, nextAction = null }) {
  if (!debrief) return null;
  const fallen = debrief.units.filter((unit) => unit.fallen);
  const promoted = debrief.units.filter((unit) => unit.promoted);
  const veteranHighlight = combatVeteranHighlight(debrief);
  const secondaryHighlights = debrief.topUnits.filter((unit) => unit.identityId !== veteranHighlight?.identityId);
  return (
    <section className={`combat-debrief ${compact ? 'compact' : ''}`} aria-label="Informe postcombate">
      <div className="combat-debrief-heading">
        <div>
          <span className="army-memorial-kicker">COMBAT CHESS · DEBRIEFING</span>
          <h3>{outcomeTitle(debrief.outcome)}</h3>
        </div>
        <span className={`combat-debrief-outcome ${debrief.outcome}`}>{String(debrief.outcome).toUpperCase()}</span>
      </div>

      <div className="combat-debrief-score">
        <span><b>{debrief.boardSurvivorCount ?? debrief.survivorCount}/{debrief.boardDeployedCount ?? debrief.deployedCount}</b><small>piezas en pie</small></span>
        <span><b>{debrief.totalKills}</b><small>bajas enemigas</small></span>
        <span><b>{debrief.combatXpGained > 0 ? `+${debrief.combatXpGained}` : '0'}</b><small>XP combate</small></span>
        <span><b>{debrief.meritGained > 0 ? `+${debrief.meritGained}` : '0'}</b><small>méritos</small></span>
      </div>

      {veteranHighlight && (
        <article className="combat-veteran-highlight" aria-label="Veterano destacado">
          <span className="combat-veteran-highlight-piece" aria-hidden="true">{PIECE[veteranHighlight.originType] || '♟'}</span>
          <div>
            <small>VETERANO DESTACADO</small>
            <strong>{veteranHighlight.alias}</strong>
            <span>{veteranHighlight.kills} bajas{veteranHighlight.bossDamage ? ` · ${veteranHighlight.bossDamage} daño boss` : ''}{veteranHighlight.promoted ? ` · Ascenso a ${veteranHighlight.afterRank}` : ''}</span>
          </div>
        </article>
      )}

      {secondaryHighlights.length > 0 && (
        <details className="combat-debrief-more-units">
          <summary>Ver otros destacados</summary>
          <div className="combat-debrief-unit-grid">
            {secondaryHighlights.map((unit) => (
              <article key={unit.identityId || unit.key} className="combat-debrief-unit">
                <span className="combat-debrief-unit-piece" aria-hidden="true">{PIECE[unit.originType] || '♟'}</span>
                <div><b>{unit.alias}</b><small>{unit.kills} bajas{unit.bossDamage ? ` · ${unit.bossDamage} daño boss` : ''}{unit.promoted ? ` · ASCENSO a ${unit.afterRank}` : ''}</small></div>
              </article>
            ))}
          </div>
        </details>
      )}

      {fallen.length > 0 && (
        <div className="combat-debrief-section danger-zone">
          <strong>Bajas propias · {fallen.length}</strong>
          <div className="combat-debrief-fallen">
            {fallen.map((unit) => <span key={unit.identityId || unit.key}>{PIECE[unit.originType] || '♟'} {unit.alias}</span>)}
          </div>
          <small>Las bajas con progreso conservan su ventana de revive hasta que empiece la siguiente batalla.</small>
        </div>
      )}

      {promoted.length > 0 && <p className="combat-service-promotion">ASCENSOS · {promoted.map((unit) => `${unit.alias} → ${unit.afterRank}`).join(' · ')}</p>}
      {debrief.newDecorations?.length > 0 && (
        <div className="combat-service-awards-earned">{debrief.newDecorations.map((medal) => <span key={medal.id}>✦ {medal.label}</span>)}</div>
      )}
      {nextAction && <div className="combat-debrief-next"><span>SIGUIENTE</span><strong>{nextAction}</strong></div>}
      {onViewBattle && debrief.battleRecord && <button type="button" className="secondary-btn combat-debrief-analysis" onClick={() => onViewBattle(debrief.battleRecord)}>Ver análisis de la batalla →</button>}
    </section>
  );
}
