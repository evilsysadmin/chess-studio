import { useState } from 'react';
import { reviveCost } from '../combat.js';
import { pieceRankForLevel } from '../combatRanks.js';
import { originTypeForRosterKey } from '../combatDeployment.js';
import { unitDecorations, unitRecordForKey } from '../combatUnitService.js';

const TYPES = { p: ['Peón','♙'], n: ['Caballo','♘'], b: ['Alfil','♗'], r: ['Torre','♖'], q: ['Dama','♕'] };

// Only persisted unit facts. A replacement is deliberately two-stage.
export default function CombatCasualtiesPanel({
  roster, fallenKeys, sectionRef, selectedUnitKey, activeDossierKey,
  onPreviewDossier, onHideDossier, onPinDossier, onRevive, onReplace, onAfterDecision,
}) {
  const [confirmingIdentity, setConfirmingIdentity] = useState(null);
  const credits = Math.max(0, Number(roster.credits) || 0);
  return (
    <section ref={sectionRef} className="deployment-casualties" data-combat-casualties="true" aria-label="Bajas pendientes">
      <div className="deployment-casualties-heading">
        <div><span>PARTE DE BAJAS</span><b>{fallenKeys.length} pendiente{fallenKeys.length === 1 ? '' : 's'}</b></div>
        <div className="deployment-casualties-xp" title="Créditos compartidos con equipo y contratos">
          <small>CRÉDITOS</small><strong>{credits}</strong>
        </div>
      </div>
      <p className="deployment-casualties-warning">
        Última oportunidad: al iniciar la siguiente batalla, los caídos sin recuperar pasan al Memorial.
        Decide unidad por unidad.
      </p>
      <div className="deployment-casualty-list">
        {fallenKeys.map((key) => {
          const type = originTypeForRosterKey(key);
          const [typeLabel, symbol] = TYPES[type] || ['Unidad', '♙'];
          const saved = roster.pieces?.[key] || {};
          const identity = roster.identities?.[key];
          const alias = identity?.alias || 'Sin alias';
          const token = identity?.identityId || key;
          const record = unitRecordForKey(roster, key);
          const medals = unitDecorations(record);
          const stats = record?.stats || {};
          const strength = Math.max(0, Number(saved.strengthPoints) || 0);
          const speed = Math.max(0, Number(saved.speedPoints) || 0);
          const level = 1 + strength + speed;
          const revivedLevel = 1 + Math.floor(strength / 2) + Math.floor(speed / 2);
          const cost = reviveCost(type);
          const canRevive = level > 1 && credits >= cost;
          const confirming = confirmingIdentity === token;
          return (
            <article className={`deployment-casualty-card ${selectedUnitKey === key ? 'selected' : ''}`} key={key}>
              <span className="deployment-casualty-symbol" aria-hidden="true">{symbol}</span>
              <div className="deployment-casualty-copy">
                <button type="button" className="deployment-casualty-name"
                  onMouseEnter={(event) => onPreviewDossier(key, event)}
                  onMouseLeave={onHideDossier}
                  onFocus={(event) => onPreviewDossier(key, event, true)}
                  onBlur={onHideDossier}
                  onClick={(event) => onPinDossier(key, event)}
                  data-unit-dossier-trigger="true" aria-label={`Ver ficha de unidad de ${alias}`}
                  aria-haspopup="dialog" aria-expanded={activeDossierKey === key}
                  aria-controls={activeDossierKey === key ? 'deployment-unit-dossier-popover' : undefined}
                ><span>{alias}</span><span aria-hidden="true">ⓘ</span></button>
                <small>{typeLabel} · {pieceRankForLevel(level).label} · nv.{level}</small>
              </div>
              {record && <div className="deployment-casualty-record" aria-label={`Hoja de servicio de ${alias}`}>
                <span>{Number(stats.battles || 0)} batallas</span>
                <span>{Number(stats.survivals || 0)} supervivencias</span>
                <span>{Number(stats.kills || 0)} bajas enemigas</span>
                {medals.length > 0 && <span className="deployment-casualty-honours">✦ {medals.length} condecoración{medals.length === 1 ? '' : 'es'}</span>}
              </div>}
              <div className="deployment-casualty-outcomes">
                <div className="deployment-casualty-path rescue">
                  <b>RECUPERAR IDENTIDAD</b>
                  <span>nv.{level} → nv.{revivedLevel} · {cost} cr</span>
                  <small>Conserva identidad, servicio y técnicas. Fuerza y velocidad pierden la mitad (redondeando cada una hacia abajo). XP sin gastar se pierde; una batalla de recuperación.</small>
                </div>
                <div className="deployment-casualty-path retire">
                  <b>NUEVA IDENTIDAD</b><span>Recluta nv.1 · gratis</span>
                  <small>El historial de {alias} pasa al Memorial. El recién llegado no hereda XP, rango ni condecoraciones.</small>
                </div>
              </div>
              <div className="deployment-casualty-actions">
                <button type="button" className="secondary-btn" disabled={!canRevive}
                  onClick={() => { setConfirmingIdentity(null); onRevive?.(key, type); onAfterDecision?.(); }}>
                  Revivir · {cost} cr
                </button>
                <button type="button" className="secondary-btn danger-soft" aria-expanded={confirming}
                  onClick={() => setConfirmingIdentity(confirming ? null : token)}>
                  {confirming ? 'Cancelar reemplazo' : 'Reemplazar…'}
                </button>
                {!canRevive && <small className="deployment-revive-shortfall">
                  {level === 1 ? 'Sin mejoras invertidas: no se puede revivir.' : `Faltan ${Math.max(0, cost - credits)} cr para revivir.`}
                </small>}
              </div>
              {confirming && (
                <div className="deployment-casualty-confirm" role="group" aria-label={`Confirmar pérdida de ${alias}`}>
                  <strong>¿Archivar definitivamente a {alias}?</strong>
                  <p>La identidad y su progresión pasarán al Memorial; se creará un recluta nuevo. No se puede deshacer.</p>
                  <div>
                    <button type="button" className="secondary-btn" onClick={() => setConfirmingIdentity(null)}>Conservar decisión pendiente</button>
                    <button type="button" className="secondary-btn danger-soft" onClick={() => {
                      setConfirmingIdentity(null); onReplace?.(key); onAfterDecision?.();
                    }}>Confirmar reemplazo definitivo</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
