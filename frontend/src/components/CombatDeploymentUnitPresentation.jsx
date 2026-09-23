import { pieceRankForLevel } from '../combatRanks.js';
import RankInsignia from './RankInsignia.jsx';
import { costForNextPoint, reviveCost, SPEED_POINT_VALUE, STRENGTH_POINT_VALUE, statsFor } from '../combat.js';
import { unlockedDeploymentTypes } from '../combatMetamorphosis.js';
import { unitDecorations, unitRecordForKey } from '../combatUnitService.js';
import { techniqueById, unlockedTechniquesFor } from '../combatTechniques.js';
import {
  effectiveDeploymentType,
  originTypeForRosterKey,
  slotLabel,
} from '../combatDeployment.js';

export const TYPE_SYMBOL = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' };
export const TYPE_NAME = { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' };

export function levelForSaved(saved) {
  return 1 + Math.max(0, Number(saved?.strengthPoints) || 0) + Math.max(0, Number(saved?.speedPoints) || 0);
}

export function UnitCard({
  roster,
  unitKey,
  deployedSlotKey,
  selected,
  dossierVisible,
  onPreview,
  onPreviewEnd,
  onPin,
  onDoubleClick,
  onDragStart,
  onDragEnd,
}) {
  const originType = originTypeForRosterKey(unitKey);
  const activeType = effectiveDeploymentType(roster, unitKey);
  const saved = roster.pieces?.[unitKey];
  const level = levelForSaved(saved);
  const rank = pieceRankForLevel(level);
  const alias = roster.identities?.[unitKey]?.alias || 'Sin alias';
  const transformed = activeType && activeType !== originType;
  const bankedXp = Math.max(0, Number(saved?.bankedXp) || 0);
  const canUpgrade = unitKey !== 'k-e' && (
    bankedXp >= costForNextPoint(Math.max(0, Number(saved?.strengthPoints) || 0)) ||
    bankedXp >= costForNextPoint(Math.max(0, Number(saved?.speedPoints) || 0))
  );

  return (
    <button
      type="button"
      className={`deployment-unit-card ${selected ? 'selected' : ''} ${deployedSlotKey ? 'deployed' : 'reserve'}`}
      onMouseEnter={(event) => onPreview(unitKey, event)}
      onMouseLeave={onPreviewEnd}
      onFocus={(event) => onPreview(unitKey, event, true)}
      onBlur={onPreviewEnd}
      onClick={(event) => {
        if (event.detail > 1) return;
        onPin(unitKey, event);
      }}
      onDoubleClick={(event) => {
        if (!onDoubleClick) return;
        event.preventDefault();
        event.stopPropagation();
        onDoubleClick(unitKey, event);
      }}
      data-unit-dossier-trigger="true"
      aria-haspopup="dialog"
      aria-expanded={dossierVisible}
      aria-controls={dossierVisible ? 'deployment-unit-dossier-popover' : undefined}
      draggable={unitKey !== 'k-e'}
      onDragStart={(e) => onDragStart(unitKey, e)}
      onDragEnd={onDragEnd}
      title={deployedSlotKey
        ? `Desplegada en ${slotLabel(deployedSlotKey)} · pasa el cursor para ver ficha, clic para fijarla`
        : 'En reserva · pasa el cursor para ver ficha, clic para fijarla, doble clic para desplegar'}
    >
      <span className="deployment-unit-symbol-wrap" aria-hidden="true">
        <span className="deployment-unit-symbol">{TYPE_SYMBOL[activeType] || '♙'}</span>
        <RankInsignia rankOrLevel={rank} className="unit-rank-insignia" decorative />
        {canUpgrade && <span className="deployment-upgrade-ready" title={`${bankedXp} XP · mejora disponible`}>+</span>}
      </span>
      <span className="deployment-unit-copy">
        <strong>{alias}</strong>
        <small className="deployment-unit-rank-line">
          <RankInsignia rankOrLevel={rank} className="unit-rank-inline" decorative />
          <span className={`combat-rank-tag rank-${rank.id}`}>{rank.short} · {rank.label}</span>
          <span className="combat-rank-level">nv.{level}</span>
        </small>
        <small>{transformed ? `${TYPE_NAME[originType]} → ${TYPE_NAME[activeType]}` : TYPE_NAME[originType]}</small>
      </span>
      <span className={`deployment-unit-state ${deployedSlotKey ? 'active' : ''}`}>{deployedSlotKey ? slotLabel(deployedSlotKey) : 'BANQUILLO'}</span>
    </button>
  );
}

function dossierPosition(anchorRect) {
  if (!anchorRect || typeof window === 'undefined') return { left: 16, top: 16, width: 360 };
  if (window.innerWidth <= 780) {
    return { left: 12, right: 12, bottom: 72, top: 'auto', width: 'auto' };
  }
  const width = Math.min(380, Math.max(300, window.innerWidth - 32));
  const margin = 12;
  let left = anchorRect.right + margin;
  if (left + width > window.innerWidth - margin) left = anchorRect.left - width - margin;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  const maxTop = Math.max(margin, window.innerHeight - Math.min(620, window.innerHeight * 0.76) - margin);
  const top = Math.max(margin, Math.min(anchorRect.top, maxTop));
  return { left, top, width };
}

export function UnitDossierPopover({
  roster,
  unitKey,
  slotKey,
  isFallen,
  anchorRect,
  pinned,
  onClose,
  onKeepOpen,
  onLeave,
  onRename,
  onMetamorphose,
  onBuy,
  onRemoveUnit,
}) {
  if (!unitKey || !anchorRect) return null;

  const originType = originTypeForRosterKey(unitKey);
  const activeType = effectiveDeploymentType(roster, unitKey);
  const saved = roster.pieces?.[unitKey] || {};
  const level = levelForSaved(saved);
  const rank = pieceRankForLevel(level);
  const alias = roster.identities?.[unitKey]?.alias || 'Sin alias';
  const record = unitRecordForKey(roster, unitKey);
  const service = record?.stats || {};
  const medals = unitDecorations(record);
  const techniques = unitKey !== 'k-e'
    ? (isFallen
      ? (Array.isArray(saved?.unlockedTechniques) ? saved.unlockedTechniques.map(techniqueById).filter(Boolean) : [])
      : unlockedTechniquesFor(unitKey, saved))
    : [];
  const forms = unitKey !== 'k-e'
    ? unlockedDeploymentTypes(unitKey, saved, record)
    : [originType];
  const investedPoints = Math.max(0, Number(saved.strengthPoints) || 0) + Math.max(0, Number(saved.speedPoints) || 0);
  const cost = isFallen ? reviveCost(originType) : 0;
  const bankedXp = Math.max(0, Number(saved?.bankedXp) || 0);
  const upgradePiece = unitKey !== 'k-e'
    ? {
        type: activeType || originType,
        color: 'w',
        strengthPoints: Math.max(0, Number(saved?.strengthPoints) || 0),
        speedPoints: Math.max(0, Number(saved?.speedPoints) || 0),
        bankedXp,
      }
    : null;
  const upgradeStats = upgradePiece ? statsFor(upgradePiece) : null;
  const strengthCost = upgradePiece ? costForNextPoint(upgradePiece.strengthPoints) : null;
  const speedCost = upgradePiece ? costForNextPoint(upgradePiece.speedPoints) : null;

  return (
    <section
      id="deployment-unit-dossier-popover"
      className={`deployment-unit-dossier-popover ${pinned ? 'pinned' : 'preview'}`}
      style={dossierPosition(anchorRect)}
      role="dialog"
      aria-modal="false"
      aria-label={`Ficha de unidad de ${alias}`}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onLeave}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="deployment-unit-dossier-topbar">
        <div>
          <span>FICHA DE UNIDAD</span>
          <small>{pinned ? 'Fijada · clic en otra unidad para cambiar' : 'Vista rápida · clic para fijar'}</small>
        </div>
        <button type="button" className="deployment-unit-dossier-close" onClick={onClose} aria-label="Cerrar ficha de unidad">×</button>
      </div>

      <div className="deployment-selected-unit deployment-unit-dossier-identity">
        <span className="deployment-selected-symbol" aria-hidden="true">{TYPE_SYMBOL[activeType] || TYPE_SYMBOL[originType] || '♙'}</span>
        <div>
          <h3>{alias}</h3>
          <p className="deployment-dossier-rank">
            <RankInsignia rankOrLevel={rank} className="unit-rank-inline" decorative />
            <span className={`combat-rank-tag rank-${rank.id}`}>{rank.short} · {rank.label}</span>
            <span className="combat-rank-level">nv.{level} · {TYPE_NAME[originType]}</span>
          </p>
        </div>
      </div>

      <dl className="deployment-unit-facts">
        <div><dt>Forma</dt><dd>{TYPE_NAME[activeType]}</dd></div>
        <div><dt>Estado</dt><dd className={isFallen ? 'danger-text' : ''}>{isFallen ? 'Caída · decisión pendiente' : slotKey ? `Desplegada · ${slotLabel(slotKey)}` : 'Banquillo'}</dd></div>
        <div><dt>Servicio</dt><dd>{service.battles || 0} batallas · {service.kills || 0} bajas</dd></div>
      </dl>

      {unitKey !== 'k-e' && (
        <section className={`deployment-service-dossier ${isFallen ? 'fallen' : ''}`} aria-label="Expediente de servicio de la unidad">
          <div className="deployment-service-dossier-heading">
            <strong>{isFallen ? 'Decisión de recuperación' : 'Hoja de servicio'}</strong>
            {medals.length > 0 && <span>✦ {medals.length} condecoración{medals.length === 1 ? '' : 'es'}</span>}
          </div>
          <div className="deployment-service-grid">
            <span><b>{investedPoints}</b><small>puntos invertidos</small></span>
            <span><b>{saved?.bankedXp || 0}</b><small>XP de pieza</small></span>
            <span><b>{service.survivals || 0}</b><small>supervivencias</small></span>
            <span><b>{service.bestSurvivalStreak || 0}</b><small>mejor racha</small></span>
            <span><b>{service.bossVictories || 0}</b><small>bosses</small></span>
            <span><b>{service.revives || 0}</b><small>revividas</small></span>
          </div>
          {medals.length > 0 && (
            <div className="deployment-service-medals">
              {medals.map((medal) => <span key={medal.id} title={medal.description}>✦ {medal.short} · {medal.label}</span>)}
            </div>
          )}
          {techniques.length > 0 && (
            <div className="deployment-service-techniques">
              <span>Técnicas</span>
              <b>{techniques.map((technique) => technique.label).join(' · ')}</b>
            </div>
          )}
          {isFallen && (
            <div className="deployment-revive-decision">
              <span>Créditos disponibles: <b>{Number(roster.credits || 0)}</b>.</span>
              <span>Revivir cuesta <b>{cost} créditos</b> y conserva identidad, historial, condecoraciones, equipo y técnicas.</span>
              <span>Nuevo recluta archiva esta identidad en el Memorial y crea una unidad nv.1 sin heredar progreso.</span>
            </div>
          )}
        </section>
      )}

      {!isFallen && (
        <div className="deployment-unit-dossier-actions">
          {unitKey !== 'k-e' && onBuy && (
            <section className={`deployment-unit-upgrades ${pinned ? 'enabled' : 'preview-only'}`} aria-label="Mejoras con XP de pieza">
              <div className="deployment-unit-upgrades-heading">
                <strong>Mejoras</strong>
                <span>XP de pieza · <b>{bankedXp}</b></span>
              </div>
              {pinned ? (
                <div className="deployment-unit-upgrade-grid">
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={bankedXp < strengthCost}
                    onClick={() => onBuy(unitKey, 'strength')}
                    title={bankedXp < strengthCost ? `Necesitas ${strengthCost} XP de pieza` : 'Gastar XP en Fuerza'}
                  >
                    + Fuerza · {strengthCost} XP
                    <small>→ {(upgradeStats.strength + STRENGTH_POINT_VALUE).toFixed(1)}</small>
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={bankedXp < speedCost}
                    onClick={() => onBuy(unitKey, 'speed')}
                    title={bankedXp < speedCost ? `Necesitas ${speedCost} XP de pieza` : 'Gastar XP en Velocidad'}
                  >
                    + Velocidad · {speedCost} XP
                    <small>→ {(upgradeStats.speed + SPEED_POINT_VALUE).toFixed(1)}</small>
                  </button>
                </div>
              ) : (
                <small className="deployment-unit-upgrades-hint">Clic en la unidad para fijar la ficha y gastar su XP.</small>
              )}
            </section>
          )}
          {onRename && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                const current = roster.identities?.[unitKey]?.alias || 'Sin alias';
                const next = window.prompt('Nuevo alias de la unidad (máx. 28 caracteres)', current);
                if (next != null) onRename(unitKey, next);
              }}
            >
              Renombrar unidad
            </button>
          )}
          {forms.length > 1 && (
            <div className="deployment-form-selector">
              <span title="La forma cambia cómo combate esta batalla; la identidad y el slot de origen no cambian.">Forma de combate</span>
              <div>
                {forms.map((type) => (
                  <button
                    type="button"
                    key={type}
                    className={`secondary-btn ${activeType === type ? 'active' : ''}`}
                    onClick={() => onMetamorphose?.(unitKey, type)}
                  >
                    {TYPE_SYMBOL[type]} {TYPE_NAME[type]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {slotKey && unitKey !== 'k-e' && (
            <button type="button" className="secondary-btn deployment-reserve-btn" onClick={() => onRemoveUnit?.(unitKey)}>
              Enviar a reserva
            </button>
          )}
        </div>
      )}
    </section>
  );
}
