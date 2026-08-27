import { useEffect, useMemo, useState } from 'react';
import { combatVeteranHighlight } from '../combatDebrief.js';
import { getToken } from '../auth.js';
import { requestRemoteNarrative } from '../narrativeRemote.js';
import { buildCombatDebriefDossier } from '../aiNarrativeTasks.js';


const PIECE = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

function outcomeTitle(outcome) {
  if (outcome === 'win') return 'Operación completada';
  if (outcome === 'retired') return 'Retirada registrada';
  if (outcome === 'draw') return 'Contacto inconcluso';
  return 'Operación perdida';
}

function debriefWhatHappened(debrief) {
  if (debrief.outcome === 'retired') return 'Retirada táctica. El sector queda pendiente y puedes reorganizar antes de reintentarlo.';
  if (debrief.outcome === 'win') return debrief.totalBossDamage > 0
    ? `Jefe neutralizado tras ${debrief.totalBossDamage} puntos de daño acumulado.`
    : `Sector asegurado con ${debrief.totalKills} baja${debrief.totalKills === 1 ? '' : 's'} enemiga${debrief.totalKills === 1 ? '' : 's'}.`;
  if (debrief.outcome === 'draw') return 'Contacto sin resolución. No se fuerza una victoria ni se inventan recompensas.';
  return `El sector se perdió. ${debrief.fallenCount ? `${debrief.fallenCount} ${debrief.fallenCount === 1 ? 'unidad cayó' : 'unidades cayeron'}.` : 'El ejército sobrevivió, pero la misión no se completó.'}`;
}

function debriefGainLine(debrief) {
  const gains = [];
  if (debrief.creditsGained > 0) gains.push(`+${debrief.creditsGained} créditos`);
  if (debrief.meritGained > 0) gains.push(`+${debrief.meritGained} méritos`);
  if (debrief.newDecorations?.length) gains.push(`${debrief.newDecorations.length} condecoración${debrief.newDecorations.length === 1 ? '' : 'es'}`);
  if (debrief.units?.some((unit) => unit.promoted)) gains.push('ascenso');
  return gains.length ? gains.join(' · ') : 'Sin ganancias registradas.';
}

function debriefNextStep(debrief, nextAction) {
  if (nextAction) return nextAction;
  if (debrief.fallenCount > 0) return 'Revisa bajas y ventanas de revive antes de la siguiente batalla.';
  if (debrief.outcome === 'retired') return 'Reorganiza el despliegue y vuelve al briefing cuando quieras reintentar.';
  if (debrief.outcome === 'win') return 'Continúa la campaña o invierte los créditos antes del siguiente sector.';
  return 'Revisa la batalla antes de volver a desplegar.';
}

export default function CombatDebrief({ debrief, compact = false, onViewBattle = null, nextAction = null }) {
  const [aiDebrief, setAiDebrief] = useState(null);
  const [aiDebriefLoading, setAiDebriefLoading] = useState(false);
  const aiDossier = useMemo(() => buildCombatDebriefDossier(debrief), [debrief]);
  const aiFactsKey = JSON.stringify(aiDossier?.facts || {});

  useEffect(() => {
    const token = getToken();
    if (!token || !aiDossier) {
      setAiDebrief(null);
      return undefined;
    }
    let active = true;
    setAiDebriefLoading(true);
    void requestRemoteNarrative(aiDossier, { token, timeoutMs: 8000 })
      .then((text) => { if (active) setAiDebrief(text || null); })
      .catch(() => { if (active) setAiDebrief(null); })
      .finally(() => { if (active) setAiDebriefLoading(false); });
    return () => { active = false; };
  }, [aiFactsKey]);

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
        <span title="Capturas, resultado y sector asegurado"><b>{debrief.creditsGained > 0 ? `+${debrief.creditsGained}` : '0'}</b><small>créditos</small></span>
        <span><b>{debrief.meritGained > 0 ? `+${debrief.meritGained}` : '0'}</b><small>méritos</small></span>
      </div>

      <div className="combat-debrief-overview" aria-label="Resumen accionable del combate">
        <section><small>QUÉ OCURRIÓ</small><strong>{debriefWhatHappened(debrief)}</strong></section>
        <section><small>GANANCIAS</small><strong>{debriefGainLine(debrief)}</strong></section>
      </div>
      <div className={`combat-debrief-next-action outcome-${debrief.outcome}`} aria-label="Siguiente decisión recomendada">
        <small>SIGUIENTE DECISIÓN</small>
        <strong>{debriefNextStep(debrief, nextAction)}</strong>
      </div>

      {debrief.creditBreakdown && debrief.creditsGained > 0 && (
        <details className="combat-credit-breakdown">
          <summary>De dónde salen los +{debrief.creditsGained} créditos</summary>
          <div className="combat-credit-breakdown-grid">
            {debrief.creditBreakdown.captures > 0 && <span><b>+{debrief.creditBreakdown.captures}</b><small>capturas</small></span>}
            {debrief.creditBreakdown.result > 0 && <span><b>+{debrief.creditBreakdown.result}</b><small>resultado</small></span>}
            {debrief.creditBreakdown.sector > 0 && <span><b>+{debrief.creditBreakdown.sector}</b><small>sector</small></span>}
            {debrief.creditBreakdown.preservation > 0 && <span><b>+{debrief.creditBreakdown.preservation}</b><small>pocas bajas</small></span>}
            {debrief.creditBreakdown.underdog > 0 && <span><b>+{debrief.creditBreakdown.underdog}</b><small>capturas difíciles</small></span>}
            {debrief.creditBreakdown.tactics > 0 && <span><b>+{debrief.creditBreakdown.tactics}</b><small>mérito táctico</small></span>}
          </div>
          {debrief.creditBreakdown.capped > 0 && <small className="combat-credit-cap-note">Límite anti-farming aplicado: {debrief.creditBreakdown.capped} créditos potenciales no se acumulan.</small>}
        </details>
      )}

      {(aiDebriefLoading || aiDebrief) && (
        <div className={`ai-task-card combat-ai-debrief ${aiDebriefLoading ? 'is-loading' : ''}`} aria-live="polite">
          <small>CONSEJOS // RESUMEN TÁCTICO</small>
          <p>{aiDebrief || 'Recontando bajas. Hasta aquí las matemáticas siguen colaborando…'}</p>
        </div>
      )}

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
      {debrief.contractsCompleted?.length > 0 && <p className="combat-service-promotion">CONTRATO CUMPLIDO · {debrief.contractsCompleted.join(' · ')}</p>}
      {debrief.newDecorations?.length > 0 && (
        <div className="combat-service-awards-earned">{debrief.newDecorations.map((medal) => <span key={medal.id}>✦ {medal.label}</span>)}</div>
      )}
      {onViewBattle && debrief.battleRecord && <button type="button" className="secondary-btn combat-debrief-analysis" onClick={() => onViewBattle(debrief.battleRecord)}>Ver análisis de la batalla →</button>}
    </section>
  );
}
