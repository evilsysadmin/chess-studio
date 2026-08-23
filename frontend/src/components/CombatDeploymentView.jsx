import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Board from './Board.jsx';
import { pieceRankForLevel } from '../combatRanks.js';
import RankInsignia from './RankInsignia.jsx';
import { costForNextPoint, reviveCost, SPEED_POINT_VALUE, STRENGTH_POINT_VALUE, statsFor } from '../combat.js';
import { unlockedDeploymentTypes } from '../combatMetamorphosis.js';
import { unitDecorations, unitRecordForKey } from '../combatUnitService.js';
import { techniqueById, unlockedTechniquesFor } from '../combatTechniques.js';
import {
  deploymentFen,
  deploymentSlotForSquare,
  deploymentSquareForSlot,
  deploymentSummary,
  effectiveDeploymentType,
  fileOrderForUnitKey,
  firstFreeDeploymentSlotForUnit,
  isUnitCompatibleWithSlot,
  originTypeForRosterKey,
  rosterUnitKeys,
  slotLabel,
} from '../combatDeployment.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import MechanicTutorialModal from './MechanicTutorialModal.jsx';
import { loadMechanicTutorialProgress } from '../mechanicTutorials.js';
import { captureDeploymentPreset, loadDeploymentPresets } from '../combatDeploymentPresets.js';

const TYPE_ORDER = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };
const TYPE_SYMBOL = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' };
const TYPE_NAME = { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' };
const DRAG_MIME = 'application/x-combat-unit';

function levelForSaved(saved) {
  return 1 + Math.max(0, Number(saved?.strengthPoints) || 0) + Math.max(0, Number(saved?.speedPoints) || 0);
}

function sortedUnitKeys(roster, sortBy = 'rank') {
  return rosterUnitKeys(roster).sort((a, b) => {
    const aType = originTypeForRosterKey(a);
    const bType = originTypeForRosterKey(b);
    const aLevel = levelForSaved(roster.pieces?.[a]);
    const bLevel = levelForSaved(roster.pieces?.[b]);
    const aAlias = String(roster.identities?.[a]?.alias || '');
    const bAlias = String(roster.identities?.[b]?.alias || '');
    if (sortBy === 'name') return aAlias.localeCompare(bAlias) || a.localeCompare(b);
    if (sortBy === 'level') return bLevel - aLevel || aAlias.localeCompare(bAlias);
    if (sortBy === 'type') {
      const typeDiff = (TYPE_ORDER[aType] ?? 99) - (TYPE_ORDER[bType] ?? 99);
      if (typeDiff) return typeDiff;
      return bLevel - aLevel || aAlias.localeCompare(bAlias);
    }
    const rankDiff = pieceRankForLevel(bLevel).minLevel - pieceRankForLevel(aLevel).minLevel;
    if (rankDiff) return rankDiff;
    const typeDiff = (TYPE_ORDER[aType] ?? 99) - (TYPE_ORDER[bType] ?? 99);
    if (typeDiff) return typeDiff;
    const fileDiff = fileOrderForUnitKey(a) - fileOrderForUnitKey(b);
    if (fileDiff) return fileDiff;
    return aAlias.localeCompare(bAlias);
  });
}

function UnitCard({
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
      </span>
      <span className="deployment-unit-copy">
        <strong>{alias}</strong>
        <small className="deployment-unit-rank-line">
          <RankInsignia rankOrLevel={rank} className="unit-rank-inline" decorative />
          {rank.label} · nv.{level}
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

function UnitDossierPopover({
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
            {rank.label} · nv.{level} · {TYPE_NAME[originType]}
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
              <span>XP de combate disponible: <b>{Number(roster.combatXp || 0)}</b>.</span>
              <span>Revivir cuesta <b>{cost} XP de combate</b> y conserva identidad, historial, condecoraciones y técnicas.</span>
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

export default function CombatDeploymentView({
  roster,
  onDeployUnit,
  onRemoveUnit,
  onResetDeployment,
  onAutoFill,
  onApplyPreset,
  onMetamorphose,
  onRename,
  onBuy,
  onRevive,
  onReplaceFallen,
  onClose,
  onConfirm,
  requireExplicitConfirmation = false,
}) {
  const summary = useMemo(() => deploymentSummary(roster), [roster]);
  const canConfirm = summary.ready && (!requireExplicitConfirmation || summary.fallenCount === 0);
  const [query, setQuery] = useState('');
  const draggingUnitRef = useRef(null);
  const previewTimerRef = useRef(null);
  const previewHideTimerRef = useRef(null);
  const [dragHoverSquare, setDragHoverSquare] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('rank');
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-deployment']?.seen);
  const [selectedUnitKey, setSelectedUnitKey] = useState(() => summary.reserveKeys[0] || summary.deployedKeys[0] || null);
  const [hoveredDossierUnitKey, setHoveredDossierUnitKey] = useState(null);
  const [pinnedDossierUnitKey, setPinnedDossierUnitKey] = useState(null);
  const [dossierAnchorRect, setDossierAnchorRect] = useState(null);
  const [presets, setPresets] = useState(() => loadDeploymentPresets());
  useEscapeToClose(() => {
    if (pinnedDossierUnitKey || hoveredDossierUnitKey) closeUnitDossier();
    else onClose();
  });
  const fen = useMemo(() => deploymentFen(roster), [roster]);
  const reverseDeployment = useMemo(
    () => Object.fromEntries(Object.entries(roster.deployment || {}).map(([slotKey, unitKey]) => [unitKey, slotKey])),
    [roster.deployment],
  );
  const reserveUnits = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    return sortedUnitKeys(roster, sortBy).filter((unitKey) => {
      if (reverseDeployment[unitKey]) return false;
      const origin = originTypeForRosterKey(unitKey);
      const alias = String(roster.identities?.[unitKey]?.alias || '').toLocaleLowerCase('es');
      if (needle && !alias.includes(needle) && !unitKey.toLocaleLowerCase('es').includes(needle)) return false;
      if (typeFilter !== 'all' && origin !== typeFilter) return false;
      return true;
    });
  }, [roster, reverseDeployment, query, typeFilter, sortBy]);
  const deployedUnits = useMemo(
    () => sortedUnitKeys(roster, 'type').filter((unitKey) => Boolean(reverseDeployment[unitKey])),
    [roster, reverseDeployment],
  );
  const selectedSlotKey = selectedUnitKey ? reverseDeployment[selectedUnitKey] || null : null;
  const selectedSquare = selectedSlotKey ? deploymentSquareForSlot(selectedSlotKey, 'w') : null;

  const validTargets = selectedUnitKey
    ? Object.keys(roster.deployment || {})
        .concat(summary.missingSlots.map((slot) => slot.key))
        .filter((slotKey, index, arr) => arr.indexOf(slotKey) === index)
        .filter((slotKey) => isUnitCompatibleWithSlot(roster, selectedUnitKey, slotKey))
        .map((slotKey) => ({ to: deploymentSquareForSlot(slotKey, 'w'), san: '' }))
    : [];

  const pieceLabels = {};
  const pieceRankLevels = {};
  const pieceVeteranMarks = {};
  for (const [slotKey, unitKey] of Object.entries(roster.deployment || {})) {
    const square = deploymentSquareForSlot(slotKey, 'w');
    if (!square) continue;
    pieceLabels[square] = roster.identities?.[unitKey]?.alias || 'Sin alias';
    pieceRankLevels[square] = levelForSaved(roster.pieces?.[unitKey]);
    const record = unitRecordForKey(roster, unitKey);
    const medals = unitDecorations(record);
    const saved = roster.pieces?.[unitKey] || {};
    const marks = [];
    if (medals.length > 0) marks.push({ id: 'decorated', glyph: '✦', label: `${medals.length} condecoración${medals.length === 1 ? '' : 'es'}` });
    if (saved.equippedTechnique) {
      const technique = techniqueById(saved.equippedTechnique);
      marks.push({ id: 'technique', glyph: '◆', label: technique ? `Técnica: ${technique.label}` : 'Técnica equipada' });
    }
    if ((record?.stats?.revives || 0) > 0) marks.push({ id: 'revived', glyph: '↺', label: `Revivida ${record.stats.revives} vez${record.stats.revives === 1 ? '' : 'es'}` });
    if (marks.length) pieceVeteranMarks[square] = marks;
  }

  function deployToSquare(square, unitKey = selectedUnitKey) {
    if (!unitKey) return;
    const slot = deploymentSlotForSquare(square, 'w');
    if (!slot || !isUnitCompatibleWithSlot(roster, unitKey, slot.key)) return;
    onDeployUnit(slot.key, unitKey);
    setSelectedUnitKey(unitKey);
  }

  function deployReserveUnitToFirstFreeSlot(unitKey, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!unitKey || reverseDeployment[unitKey]) return;

    const target = firstFreeDeploymentSlotForUnit(roster, unitKey);
    if (!target) {
      // No expulsamos a una unidad ya desplegada por un doble clic.
      // La dejamos seleccionada para que el jugador haga un swap explícito.
      setSelectedUnitKey(unitKey);
      return;
    }

    clearDossierTimers();
    closeUnitDossier();
    onDeployUnit(target.key, unitKey);
    setSelectedUnitKey(unitKey);
  }

  useEffect(() => () => {
    clearTimeout(previewTimerRef.current);
    clearTimeout(previewHideTimerRef.current);
  }, []);

  const dossierUnitKey = pinnedDossierUnitKey || hoveredDossierUnitKey;

  function clearDossierTimers() {
    clearTimeout(previewTimerRef.current);
    clearTimeout(previewHideTimerRef.current);
  }

  function previewUnitDossier(unitKey, event, immediate = false) {
    if (pinnedDossierUnitKey) return;
    const rect = event.currentTarget.getBoundingClientRect();
    clearDossierTimers();
    previewTimerRef.current = setTimeout(() => {
      setHoveredDossierUnitKey(unitKey);
      setDossierAnchorRect(rect);
    }, immediate ? 0 : 180);
  }

  function hideUnitDossierPreview() {
    clearTimeout(previewTimerRef.current);
    if (pinnedDossierUnitKey) return;
    clearTimeout(previewHideTimerRef.current);
    previewHideTimerRef.current = setTimeout(() => setHoveredDossierUnitKey(null), 140);
  }

  function keepUnitDossierOpen() {
    clearTimeout(previewHideTimerRef.current);
  }

  function pinUnitDossier(unitKey, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    clearDossierTimers();
    setSelectedUnitKey(unitKey);
    setHoveredDossierUnitKey(null);
    setDossierAnchorRect(rect);
    // Click = fijar ficha. No hacemos toggle: el segundo click de un
    // doble-click no debe cerrarla antes de ejecutar la acción contextual.
    setPinnedDossierUnitKey(unitKey);
  }

  function closeUnitDossier() {
    clearDossierTimers();
    setHoveredDossierUnitKey(null);
    setPinnedDossierUnitKey(null);
    setDossierAnchorRect(null);
  }

  function handleBoardClick(square) {
    const slot = deploymentSlotForSquare(square, 'w');
    if (!slot) return;
    if (selectedUnitKey && isUnitCompatibleWithSlot(roster, selectedUnitKey, slot.key)) {
      deployToSquare(square);
      return;
    }
    const occupant = roster.deployment?.[slot.key];
    if (occupant) setSelectedUnitKey(occupant);
  }

  function handleDragStart(unitKey, event) {
    draggingUnitRef.current = unitKey;
    clearDossierTimers();
    if (!pinnedDossierUnitKey) setHoveredDossierUnitKey(null);
    setDragHoverSquare(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_MIME, unitKey);
    event.dataTransfer.setData('text/plain', unitKey);

    // HTML5 arrastra por defecto el botón entero del barracón. Para deployment
    // sólo queremos una silueta pequeña de la pieza: así la casilla de destino
    // sigue visible debajo del cursor.
    const sourceSymbol = event.currentTarget?.querySelector?.('.deployment-unit-symbol');
    if (sourceSymbol && event.dataTransfer?.setDragImage) {
      const ghost = sourceSymbol.cloneNode(true);
      ghost.className = 'deployment-drag-ghost';
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 22, 22);
      requestAnimationFrame(() => ghost.remove());
    }
    setSelectedUnitKey(unitKey);
  }

  function handleDragEnd() {
    draggingUnitRef.current = null;
    setDragHoverSquare(null);
  }

  function handleBoardPieceDragStart(square, event) {
    const slot = deploymentSlotForSquare(square, 'w');
    const unitKey = slot ? roster.deployment?.[slot.key] : null;
    if (!unitKey || unitKey === 'k-e') {
      event.preventDefault();
      return;
    }
    handleDragStart(unitKey, event);
  }

  function deployedUnitForSquare(square) {
    const slot = deploymentSlotForSquare(square, 'w');
    return slot ? roster.deployment?.[slot.key] || null : null;
  }

  function previewBoardUnitDossier(square, event) {
    const unitKey = deployedUnitForSquare(square);
    if (!unitKey) return;
    previewUnitDossier(unitKey, event);
  }

  function pinBoardUnitDossier(square, event) {
    const unitKey = deployedUnitForSquare(square);
    if (!unitKey) return;
    pinUnitDossier(unitKey, event);
  }

  function sendBoardUnitToReserve(square, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const unitKey = deployedUnitForSquare(square);
    // El rey jefe/identidad de rey no se puede mandar al banquillo.
    if (!unitKey || unitKey === 'k-e') return;
    clearDossierTimers();
    closeUnitDossier();
    setSelectedUnitKey(null);
    onRemoveUnit?.(unitKey);
  }

  function handleSquareDragOver(square, event) {
    const unitKey = draggingUnitRef.current || selectedUnitKey;
    const slot = deploymentSlotForSquare(square, 'w');
    if (unitKey && slot && isUnitCompatibleWithSlot(roster, unitKey, slot.key)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dragHoverSquare !== square) setDragHoverSquare(square);
    } else if (dragHoverSquare) {
      setDragHoverSquare(null);
    }
  }

  function handleSquareDragLeave(square) {
    setDragHoverSquare((current) => current === square ? null : current);
  }

  function handleSquareDrop(square, event) {
    event.preventDefault();
    const unitKey = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain') || draggingUnitRef.current || selectedUnitKey;
    draggingUnitRef.current = null;
    setDragHoverSquare(null);
    deployToSquare(square, unitKey);
  }

  function squareClassName(square) {
    const slot = deploymentSlotForSquare(square, 'w');
    if (!slot) return 'deployment-square-disabled';
    const occupant = roster.deployment?.[slot.key];
    const canTakeSelected = selectedUnitKey && isUnitCompatibleWithSlot(roster, selectedUnitKey, slot.key);
    return [
      'deployment-square',
      occupant ? 'deployment-square-occupied' : 'deployment-square-empty',
      canTakeSelected ? 'deployment-square-valid' : '',
      dragHoverSquare === square ? 'deployment-square-drop-hover' : '',
    ].filter(Boolean).join(' ');
  }

  function squareBadge(square) {
    const slot = deploymentSlotForSquare(square, 'w');
    if (!slot) return null;
    return <span className="deployment-slot-badge" title={`Slot exclusivo: ${TYPE_NAME[slot.type]}`}>{TYPE_SYMBOL[slot.type]}</span>;
  }

  function savePreset(index) {
    const existing = presets[index];
    const suggested = existing?.name || `Escuadra ${index + 1}`;
    const name = window.prompt('Nombre del preset de despliegue', suggested);
    if (name == null) return;
    setPresets(captureDeploymentPreset(roster, index, name));
  }

  function loadPreset(index) {
    const preset = presets[index];
    if (!preset) return;
    onApplyPreset?.(preset);
  }

  return (
    <div className="modal-backdrop combat-deployment-backdrop" onClick={onClose}>
      <section className="combat-deployment-shell" onClick={(e) => e.stopPropagation()} aria-label="Preparar despliegue de Combat Chess">
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>

        <header className="combat-deployment-header">
          <div>
            <span className="army-memorial-kicker">COMBAT CHESS · MESA DE GUERRA</span>
            <div className="deployment-title-row"><h2>Preparar despliegue</h2><button type="button" className="context-help-btn" onClick={() => setShowTutorial(true)}>?</button></div>
            <p className="combat-operational-hint" title="Cada slot valida el tipo de origen. Un peón metamorfoseado sigue ocupando un slot de peón.">Arrastra, coloca y confirma.</p>
          </div>
          <div className={`deployment-readiness ${summary.ready ? 'ready' : 'incomplete'}`}>
            <strong>{summary.assignedCount}/{summary.totalSlots}</strong>
            <span>{summary.ready ? 'Formación lista' : 'Formación incompleta'}</span>
          </div>
        </header>

        <div className="combat-deployment-layout">
          <aside className="deployment-barracks deployment-reserve-panel">
            <div className="deployment-panel-heading">
              <div><span>RESERVA</span><strong>Banquillo · {summary.reserveCount}</strong></div>
              <small>{summary.fallenCount > 0 ? `${summary.fallenCount} caídas pendientes` : 'Fuera de la formación'}</small>
            </div>
            {summary.fallenCount > 0 && (
              <section className="deployment-casualties" aria-label="Bajas pendientes">
                <div className="deployment-casualties-heading">
                  <div><span>BAJAS PENDIENTES</span><b>{summary.fallenCount}</b></div>
                  <div className="deployment-casualties-xp" title="Moneda disponible para recuperar veteranos caídos">
                    <small>XP COMBATE</small><strong>{Number(roster.combatXp || 0)}</strong>
                  </div>
                </div>
                <p>Decide a quién recuperar. La XP disponible se comparte entre todas las bajas.</p>
                <div className="deployment-casualty-list">
                  {summary.fallenKeys.map((unitKey) => {
                    const origin = originTypeForRosterKey(unitKey);
                    const saved = roster.pieces?.[unitKey] || {};
                    const alias = roster.identities?.[unitKey]?.alias || 'Sin alias';
                    const level = levelForSaved(saved);
                    const progress = Math.max(0, Number(saved.strengthPoints) || 0) + Math.max(0, Number(saved.speedPoints) || 0);
                    const cost = reviveCost(origin);
                    const canRevive = progress > 0 && Number(roster.combatXp || 0) >= cost;
                    const reviveTitle = progress <= 0
                      ? 'Recluta de nivel 1: no tiene progreso que recuperar.'
                      : canRevive
                        ? `Revivir conserva la identidad y devuelve la mitad del progreso · ${cost} XP.`
                        : `Necesitas ${cost} XP de combate para revivir esta unidad.`;
                    const dossierVisible = dossierUnitKey === unitKey;
                    return (
                      <div className={`deployment-casualty-card ${selectedUnitKey === unitKey ? 'selected' : ''}`} key={unitKey}>
                        <span className="deployment-casualty-symbol" aria-hidden="true">{TYPE_SYMBOL[origin] || '♙'}</span>
                        <div className="deployment-casualty-copy">
                          <button
                            type="button"
                            className="deployment-casualty-name"
                            onMouseEnter={(event) => previewUnitDossier(unitKey, event)}
                            onMouseLeave={hideUnitDossierPreview}
                            onFocus={(event) => previewUnitDossier(unitKey, event, true)}
                            onBlur={hideUnitDossierPreview}
                            onClick={(event) => pinUnitDossier(unitKey, event)}
                            data-unit-dossier-trigger="true"
                            aria-label={`Ver ficha de unidad de ${alias}`}
                            aria-haspopup="dialog"
                            aria-expanded={dossierVisible}
                            aria-controls={dossierVisible ? 'deployment-unit-dossier-popover' : undefined}
                            title="Pasa el cursor para ver la ficha · clic para fijarla antes de decidir si revivir"
                          >
                            <span>{alias}</span><span className="deployment-casualty-name-cue" aria-hidden="true">ⓘ</span>
                          </button>
                          <small>{TYPE_NAME[origin]} · {pieceRankForLevel(level).label} · nv.{level}</small>
                        </div>
                        <div className="deployment-casualty-actions">
                          <button type="button" className="secondary-btn" disabled={!canRevive} title={reviveTitle} onClick={() => { onRevive?.(unitKey, origin); setSelectedUnitKey(unitKey); closeUnitDossier(); }}>
                            Revivir · {cost} XP
                          </button>
                          <button type="button" className="secondary-btn danger-soft" title="La identidad actual pasa al Memorial y entra un recluta nuevo de nivel 1." onClick={() => { onReplaceFallen?.(unitKey); setSelectedUnitKey(unitKey); closeUnitDossier(); }}>
                            Nuevo recluta
                          </button>
                          {!canRevive && progress > 0 && (
                            <small className="deployment-revive-shortfall">Faltan {Math.max(0, cost - Number(roster.combatXp || 0))} XP de combate para recuperar esta unidad.</small>
                          )}
                          {progress <= 0 && (
                            <small className="deployment-revive-shortfall neutral">Sin progreso invertido que recuperar: el reemplazo no pierde veteranía.</small>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {summary.fallenCount > 1 && (
                  <button type="button" className="secondary-btn deployment-replace-all" onClick={() => summary.fallenKeys.forEach((unitKey) => onReplaceFallen?.(unitKey))}>
                    Aceptar {summary.fallenCount} reclutas nuevos
                  </button>
                )}
              </section>
            )}

            <div className="deployment-presets" aria-label="Presets de escuadra">
              <span className="deployment-presets-label">ESCUADRAS</span>
              {[0, 1, 2].map((index) => {
                const preset = presets[index];
                return (
                  <div className="deployment-preset-row" key={index}>
                    <button type="button" className="secondary-btn" disabled={!preset} onClick={() => loadPreset(index)} title={preset ? `Cargar ${preset.name}` : 'Preset vacío'}>
                      {preset?.name || `Escuadra ${index + 1}`}
                    </button>
                    <button type="button" className="deployment-preset-save" onClick={() => savePreset(index)} title="Guardar la formación actual">＋</button>
                  </div>
                );
              })}
            </div>

            <div className="deployment-list-heading">
              <div><span>UNIDADES EN RESERVA</span><b>{summary.reserveCount}</b></div>
              <small>Arrastra una unidad a un slot compatible.</small>
            </div>
            <div className="deployment-filters">
              <input aria-label="Buscar unidad en reserva" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en reserva…" />
              <div className="deployment-filter-row">
                <select aria-label="Filtrar reserva por tipo" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">Todos los tipos</option>
                  <option value="p">Peones</option><option value="n">Caballos</option><option value="b">Alfiles</option><option value="r">Torres</option><option value="q">Damas</option><option value="k">Rey</option>
                </select>
                <select aria-label="Ordenar reserva" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="rank">Rango ↓</option><option value="level">Nivel ↓</option><option value="type">Tipo</option><option value="name">Nombre A–Z</option>
                </select>
              </div>
            </div>
            <div className="deployment-unit-list deployment-reserve-list" aria-label="Unidades en reserva">
              {reserveUnits.length === 0 && (
                <p className="hint-text deployment-empty-filter">
                  {summary.reserveCount === 0 ? 'No hay unidades en el banquillo.' : 'Ninguna reserva coincide con esos filtros.'}
                </p>
              )}
              {reserveUnits.map((unitKey) => (
                <UnitCard
                  key={unitKey}
                  roster={roster}
                  unitKey={unitKey}
                  deployedSlotKey={null}
                  selected={selectedUnitKey === unitKey}
                  dossierVisible={dossierUnitKey === unitKey}
                  onPreview={previewUnitDossier}
                  onPreviewEnd={hideUnitDossierPreview}
                  onPin={pinUnitDossier}
                  onDoubleClick={deployReserveUnitToFirstFreeSlot}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </aside>

          <main className="deployment-board-zone">
            <div className="deployment-board-caption">
              <span>FORMACIÓN PROPIA</span>
              <small title="Fila superior: piezas mayores. Fila inferior: ocho slots de peón.">16 slots</small>
            </div>
            <Board
              fen={fen}
              orientation="white"
              onSquareClick={handleBoardClick}
              selectedSquare={selectedSquare}
              legalTargets={validTargets}
              showCoordinates
              squareClassName={squareClassName}
              squareBadge={squareBadge}
              pieceDraggable
              onPieceDragStart={handleBoardPieceDragStart}
              onPieceDragEnd={handleDragEnd}
              onPieceMouseEnter={previewBoardUnitDossier}
              onPieceMouseLeave={hideUnitDossierPreview}
              onPieceClick={pinBoardUnitDossier}
              onPieceDoubleClick={sendBoardUnitToReserve}
              onSquareDragOver={handleSquareDragOver}
              onSquareDragLeave={handleSquareDragLeave}
              onSquareDrop={handleSquareDrop}
              pieceLabels={pieceLabels}
              pieceRankLevels={pieceRankLevels}
              pieceVeteranMarks={pieceVeteranMarks}
            />
            {!summary.ready && (
              <div className="deployment-missing-strip">
                <b>Faltan:</b> {summary.missingSlots.map((slot) => slotLabel(slot.key)).join(' · ')}
                {summary.fallenCount > 0 && <span> · {summary.fallenCount} baja{summary.fallenCount === 1 ? '' : 's'} pendiente{summary.fallenCount === 1 ? '' : 's'}: revive o reemplaza antes de completar la formación.</span>}
              </div>
            )}
          </main>

          <aside className="deployment-right-rail">
            <section className="deployment-deployed-panel">
              <div className="deployment-panel-heading">
                <div><span>DESPLEGADOS</span><strong>{summary.assignedCount}/{summary.totalSlots}</strong></div>
                <small>Formación actual</small>
              </div>
              <p className="deployment-rail-hint">Selecciona una unidad para localizarla en el tablero o arrástrala a otro slot compatible.</p>
              <div className="deployment-unit-list deployment-deployed-list" aria-label="Unidades desplegadas">
                {deployedUnits.map((unitKey) => (
                  <UnitCard
                    key={unitKey}
                    roster={roster}
                    unitKey={unitKey}
                    deployedSlotKey={reverseDeployment[unitKey] || null}
                    selected={selectedUnitKey === unitKey}
                    dossierVisible={dossierUnitKey === unitKey}
                    onPreview={previewUnitDossier}
                    onPreviewEnd={hideUnitDossierPreview}
                    onPin={pinUnitDossier}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            </section>


          </aside>
        </div>

        {dossierUnitKey && dossierAnchorRect && typeof document !== 'undefined' && createPortal(
          <UnitDossierPopover
            roster={roster}
            unitKey={dossierUnitKey}
            slotKey={reverseDeployment[dossierUnitKey] || null}
            isFallen={summary.fallenKeys.includes(dossierUnitKey)}
            anchorRect={dossierAnchorRect}
            pinned={pinnedDossierUnitKey === dossierUnitKey}
            onClose={closeUnitDossier}
            onKeepOpen={keepUnitDossierOpen}
            onLeave={hideUnitDossierPreview}
            onRename={onRename}
            onMetamorphose={onMetamorphose}
            onBuy={onBuy}
            onRemoveUnit={(unitKey) => { onRemoveUnit?.(unitKey); closeUnitDossier(); }}
          />,
          document.body,
        )}

        <footer className="combat-deployment-footer">
          <div className="deployment-auto-actions">
            <button type="button" className="secondary-btn" onClick={() => onAutoFill?.(true)}>Auto · veteranos</button>
            <button type="button" className="secondary-btn" onClick={() => onAutoFill?.(false)}>Auto · reclutas</button>
            <button type="button" className="secondary-btn" onClick={onResetDeployment}>Restablecer</button>
          </div>
          <div className="deployment-footer-copy">
            <span>Reservas: <b>{summary.reserveCount}</b></span>
            <span>XP de combate: <b>{Number(roster.combatXp || 0)}</b></span>
            {summary.fallenCount > 0 && <span>Bajas pendientes: <b>{summary.fallenCount}</b></span>}
          </div>
          <button type="button" className="primary-btn" disabled={!canConfirm} onClick={() => {
            if (!canConfirm) return;
            if (onConfirm) onConfirm();
            else onClose();
          }}>
            {requireExplicitConfirmation && summary.fallenCount > 0
              ? `Resuelve ${summary.fallenCount} baja${summary.fallenCount === 1 ? '' : 's'}`
              : summary.ready
                ? (requireExplicitConfirmation ? 'CONFIRMAR DESPLIEGUE' : 'Confirmar despliegue')
                : 'Completa los 16 puestos'}
          </button>
        </footer>
        {showTutorial && <MechanicTutorialModal tutorialId="combat-deployment" onClose={() => setShowTutorial(false)} />}
      </section>
    </div>
  );
}
