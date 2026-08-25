import { useMemo } from 'react';
import { combatArmyGlance } from '../combatArmyGlance.js';
import { useEscapeToClose } from '../useEscapeToClose.js';

export default function CombatArmySummaryModal({ roster, onOpenCombat, onClose }) {
  useEscapeToClose(onClose);
  const summary = useMemo(() => combatArmyGlance(roster), [roster]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="army-card combat-summary-modal" role="dialog" aria-modal="true" aria-labelledby="combat-summary-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <span className="section-label">COMBAT CHESS</span>
        <h2 id="combat-summary-title">Tu ejército</h2>
        <p className="hint-text">Estado actual de tus unidades persistentes.</p>
        <div className="combat-summary-xp"><span>Créditos disponibles</span><strong>{Number(roster?.credits || 0)}</strong><small>Revives, contratos y equipo. La XP mejora únicamente a cada unidad.</small></div>
        <div className="combat-summary-facts">
          <div><strong>{summary.active}</strong><span>unidades activas</span></div>
          <div><strong>{summary.experienced}</strong><span>veteranos</span></div>
          <div><strong>{summary.decorated}</strong><span>condecorados</span></div>
          <div><strong>{summary.memorial}</strong><span>en el memorial</span></div>
        </div>
        {summary.standout ? (
          <div className="combat-summary-veteran">
            <span>Veterano destacado</span><strong>{summary.standout.alias}</strong>
            <small>{summary.standout.battles} batallas · {summary.standout.survivals} supervivencias · {summary.standout.kills} bajas</small>
          </div>
        ) : <p className="combat-summary-empty">Tu primer veterano aparecerá aquí después de combatir.</p>}
        <div className="combat-summary-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>Cerrar</button>
          <button type="button" className="primary-btn" onClick={onOpenCombat}>Ver ejército</button>
        </div>
      </section>
    </div>
  );
}
