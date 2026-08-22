import React, { useMemo, useRef, useState } from 'react';
import Board from './Board.jsx';
import { pieceRankForLevel } from '../combatRanks.js';
import { reviveCost } from '../combat.js';
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
  isUnitCompatibleWithSlot,
  originTypeForRosterKey,
  rosterUnitKeys,
  slotLabel,
} from '../combatDeployment.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { combatArmyThreat, combatUnitThreat } from '../combatBalance.js';
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

function UnitCard({ roster, unitKey, deployedSlotKey, selected, onSelect, onDragStart, onDragEnd }) {
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
      onClick={() => onSelect(unitKey)}
      draggable={unitKey !== 'k-e'}
      onDragStart={(e) => onDragStart(unitKey, e)}
      onDragEnd={onDragEnd}
      title={deployedSlotKey ? `Desplegada en ${slotLabel(deployedSlotKey)}` : 'En reserva'}
    >
      <span className="deployment-unit-symbol" aria-hidden="true">{TYPE_SYMBOL[activeType] || '♙'}</span>
      <span className="deployment-unit-copy">
        <strong>{alias}</strong>
        <small>{rank.label} · nv.{level}</small>
        <small>{transformed ? `${TYPE_NAME[originType]} → ${TYPE_NAME[activeType]}` : TYPE_NAME[originType]}</small>
      </span>
      <span className={`deployment-unit-state ${deployedSlotKey ? 'active' : ''}`}>{deployedSlotKey ? slotLabel(deployedSlotKey) : 'BANQUILLO'}</span>
    </button>
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
  onRevive,
  onReplaceFallen,
  onClose,
}) {
  useEscapeToClose(onClose);
  const summary = useMemo(() => deploymentSummary(roster), [roster]);
  const [query, setQuery] = useState('');
  const draggingUnitRef = useRef(null);
  const inspectorRef = useRef(null);
  const [dragHoverSquare, setDragHoverSquare] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('rank');
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-deployment']?.seen);
  const [selectedUnitKey, setSelectedUnitKey] = useState(() => summary.reserveKeys[0] || summary.deployedKeys[0] || null);
  const [presets, setPresets] = useState(() => loadDeploymentPresets());
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
  const armyThreat = useMemo(() => combatArmyThreat(roster), [roster]);
  const selectedSlotKey = selectedUnitKey ? reverseDeployment[selectedUnitKey] || null : null;
  const selectedSquare = selectedSlotKey ? deploymentSquareForSlot(selectedSlotKey, 'w') : null;
  const selectedSaved = selectedUnitKey ? roster.pieces?.[selectedUnitKey] : null;
  const selectedOrigin = selectedUnitKey ? originTypeForRosterKey(selectedUnitKey) : null;
  const selectedRecord = selectedUnitKey ? unitRecordForKey(roster, selectedUnitKey) : null;
  const selectedForms = selectedUnitKey && selectedUnitKey !== 'k-e'
    ? unlockedDeploymentTypes(selectedUnitKey, selectedSaved, selectedRecord)
    : selectedOrigin ? [selectedOrigin] : [];
  const selectedActiveType = selectedUnitKey ? effectiveDeploymentType(roster, selectedUnitKey) : null;
  const selectedThreat = selectedUnitKey ? combatUnitThreat(roster, selectedUnitKey) : null;
  const selectedIsFallen = selectedUnitKey ? summary.fallenKeys.includes(selectedUnitKey) : false;
  const selectedService = selectedRecord?.stats || {};
  const selectedMedals = selectedUnitKey ? unitDecorations(selectedRecord) : [];
  const selectedTechniques = selectedUnitKey && selectedUnitKey !== 'k-e'
    ? (selectedIsFallen
      ? (Array.isArray(selectedSaved?.unlockedTechniques) ? selectedSaved.unlockedTechniques.map(techniqueById).filter(Boolean) : [])
      : unlockedTechniquesFor(selectedUnitKey, selectedSaved))
    : [];
  const selectedInvestedPoints = selectedSaved
    ? Math.max(0, Number(selectedSaved.strengthPoints) || 0) + Math.max(0, Number(selectedSaved.speedPoints) || 0)
    : 0;
  const selectedReviveCost = selectedIsFallen && selectedOrigin ? reviveCost(selectedOrigin) : 0;

  const validTargets = selectedUnitKey
    ? Object.keys(roster.deployment || {})
        .concat(summary.missingSlots.map((slot) => slot.key))
        .filter((slotKey, index, arr) => arr.indexOf(slotKey) === index)
        .filter((slotKey) => isUnitCompatibleWithSlot(roster, selectedUnitKey, slotKey))
        .map((slotKey) => ({ to: deploymentSquareForSlot(slotKey, 'w'), san: '' }))
    : [];

  const pieceLabels = {};
  for (const [slotKey, unitKey] of Object.entries(roster.deployment || {})) {
    const square = deploymentSquareForSlot(slotKey, 'w');
    if (square) pieceLabels[square] = roster.identities?.[unitKey]?.alias || 'Sin alias';
  }

  function deployToSquare(square, unitKey = selectedUnitKey) {
    if (!unitKey) return;
    const slot = deploymentSlotForSquare(square, 'w');
    if (!slot || !isUnitCompatibleWithSlot(roster, unitKey, slot.key)) return;
    onDeployUnit(slot.key, unitKey);
    setSelectedUnitKey(unitKey);
  }

  function inspectUnit(unitKey) {
    setSelectedUnitKey(unitKey);
    requestAnimationFrame(() => inspectorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }));
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
                  <span>BAJAS PENDIENTES</span>
                  <b>{summary.fallenCount}</b>
                </div>
                <p>Resuélvelas aquí antes de completar la formación.</p>
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
                    return (
                      <div className={`deployment-casualty-card ${selectedUnitKey === unitKey ? 'selected' : ''}`} key={unitKey}>
                        <span className="deployment-casualty-symbol" aria-hidden="true">{TYPE_SYMBOL[origin] || '♙'}</span>
                        <div className="deployment-casualty-copy">
                          <button
                            type="button"
                            className="deployment-casualty-name"
                            onClick={() => inspectUnit(unitKey)}
                            aria-label={`Ver expediente de ${alias}`}
                            title="Ver expediente antes de decidir si revivir"
                          >
                            {alias}
                          </button>
                          <small>{TYPE_NAME[origin]} · {pieceRankForLevel(level).label} · nv.{level}</small>
                        </div>
                        <div className="deployment-casualty-actions">
                          <button type="button" className="secondary-btn" disabled={!canRevive} title={reviveTitle} onClick={() => { onRevive?.(unitKey, origin); setSelectedUnitKey(unitKey); }}>
                            Revivir · {cost} XP
                          </button>
                          <button type="button" className="secondary-btn danger-soft" title="La identidad actual pasa al Memorial y entra un recluta nuevo de nivel 1." onClick={() => { onReplaceFallen?.(unitKey); setSelectedUnitKey(unitKey); }}>
                            Nuevo recluta
                          </button>
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
                  onSelect={setSelectedUnitKey}
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
              onSquareDragOver={handleSquareDragOver}
              onSquareDragLeave={handleSquareDragLeave}
              onSquareDrop={handleSquareDrop}
              pieceLabels={pieceLabels}
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
                    onSelect={setSelectedUnitKey}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            </section>

            <section className="deployment-inspector" ref={inspectorRef}>
              <div className="deployment-panel-heading"><div><span>UNIDAD</span><strong>Inspector</strong></div></div>
              {selectedUnitKey ? (
                <>
                  <div className="deployment-selected-unit">
                    <span className="deployment-selected-symbol" aria-hidden="true">{TYPE_SYMBOL[selectedActiveType]}</span>
                    <div>
                      <h3>{roster.identities?.[selectedUnitKey]?.alias || 'Sin alias'}</h3>
                      <p>{pieceRankForLevel(levelForSaved(selectedSaved)).label} · nv.{levelForSaved(selectedSaved)}</p>
                    </div>
                  </div>
                  {onRename && (
                    <button
                      type="button"
                      className="secondary-btn deployment-rename-btn"
                      onClick={() => {
                        const current = roster.identities?.[selectedUnitKey]?.alias || 'Sin alias';
                        const next = window.prompt('Nuevo alias de la unidad (máx. 28 caracteres)', current);
                        if (next != null) onRename(selectedUnitKey, next);
                      }}
                    >
                      Renombrar unidad
                    </button>
                  )}

                  <dl className="deployment-unit-facts">
                    <div><dt>Identidad</dt><dd>{TYPE_NAME[selectedOrigin]}</dd></div>
                    <div><dt>Forma</dt><dd>{TYPE_NAME[selectedActiveType]}</dd></div>
                    <div><dt>Estado</dt><dd className={selectedIsFallen ? 'danger-text' : ''}>{selectedIsFallen ? 'Caída · decisión pendiente' : selectedSlotKey ? `Desplegada · ${slotLabel(selectedSlotKey)}` : 'Banquillo'}</dd></div>
                    <div><dt>Servicio</dt><dd>{selectedService.battles || 0} batallas · {selectedService.kills || 0} bajas</dd></div>
                    <div><dt>Amenaza propia</dt><dd>{selectedThreat?.bonus ? `+${selectedThreat.bonus}` : '0'} CPU potencial</dd></div>
                  </dl>

                  {selectedUnitKey !== 'k-e' && (
                    <section className={`deployment-service-dossier ${selectedIsFallen ? 'fallen' : ''}`} aria-label="Expediente de servicio de la unidad">
                      <div className="deployment-service-dossier-heading">
                        <strong>{selectedIsFallen ? 'Decisión de recuperación' : 'Hoja de servicio'}</strong>
                        {selectedMedals.length > 0 && <span>✦ {selectedMedals.length} condecoración{selectedMedals.length === 1 ? '' : 'es'}</span>}
                      </div>
                      <div className="deployment-service-grid">
                        <span><b>{selectedInvestedPoints}</b><small>puntos invertidos</small></span>
                        <span><b>{selectedSaved?.bankedXp || 0}</b><small>XP de pieza</small></span>
                        <span><b>{selectedService.survivals || 0}</b><small>supervivencias</small></span>
                        <span><b>{selectedService.bestSurvivalStreak || 0}</b><small>mejor racha</small></span>
                        <span><b>{selectedService.bossVictories || 0}</b><small>bosses</small></span>
                        <span><b>{selectedService.revives || 0}</b><small>revividas</small></span>
                      </div>
                      {selectedMedals.length > 0 && (
                        <div className="deployment-service-medals">
                          {selectedMedals.map((medal) => <span key={medal.id} title={medal.description}>✦ {medal.short} · {medal.label}</span>)}
                        </div>
                      )}
                      {selectedTechniques.length > 0 && (
                        <div className="deployment-service-techniques">
                          <span>Técnicas</span>
                          <b>{selectedTechniques.map((technique) => technique.label).join(' · ')}</b>
                        </div>
                      )}
                      {selectedIsFallen && (
                        <div className="deployment-revive-decision">
                          <span>Revivir cuesta <b>{selectedReviveCost} XP de combate</b> y conserva identidad, historial, condecoraciones y técnicas.</span>
                          <span>Nuevo recluta archiva esta identidad en el Memorial y crea una unidad nv.1 sin heredar progreso.</span>
                        </div>
                      )}
                    </section>
                  )}

                  {selectedForms.length > 1 && !selectedIsFallen && (
                    <div className="deployment-form-selector">
                      <span title="La forma cambia cómo combate esta batalla; la identidad y el slot de origen no cambian.">Forma de combate</span>
                      <div>
                        {selectedForms.map((type) => (
                          <button
                            type="button"
                            key={type}
                            className={`secondary-btn ${selectedActiveType === type ? 'active' : ''}`}
                            onClick={() => onMetamorphose(selectedUnitKey, type)}
                          >
                            {TYPE_SYMBOL[type]} {TYPE_NAME[type]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedSlotKey && selectedUnitKey !== 'k-e' && (
                    <button type="button" className="secondary-btn deployment-reserve-btn" onClick={() => onRemoveUnit(selectedUnitKey)}>
                      Enviar a reserva
                    </button>
                  )}
                </>
              ) : <p className="hint-text">Selecciona una unidad de la reserva, desplegados o del tablero.</p>}
            </section>
          </aside>
        </div>

        <footer className="combat-deployment-footer">
          <div className="deployment-auto-actions">
            <button type="button" className="secondary-btn" onClick={() => onAutoFill?.(true)}>Auto · veteranos</button>
            <button type="button" className="secondary-btn" onClick={() => onAutoFill?.(false)}>Auto · reclutas</button>
            <button type="button" className="secondary-btn" onClick={onResetDeployment}>Restablecer</button>
          </div>
          <div className="deployment-footer-copy">
            <span>Reservas: <b>{summary.reserveCount}</b></span>
            <span>Amenaza desplegada: <b>{armyThreat.tier}</b>{armyThreat.bonus > 0 ? ` · +${armyThreat.bonus} CPU` : ''}</span>
          </div>
          <button type="button" className="primary-btn" disabled={!summary.ready} onClick={onClose}>
            {summary.ready ? 'Confirmar despliegue' : 'Completa los 16 puestos'}
          </button>
        </footer>
        {showTutorial && <MechanicTutorialModal tutorialId="combat-deployment" onClose={() => setShowTutorial(false)} />}
      </section>
    </div>
  );
}
