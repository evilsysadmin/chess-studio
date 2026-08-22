import React, { useMemo, useState } from 'react';
import Board from './Board.jsx';
import { pieceRankForLevel } from '../combatRanks.js';
import { unlockedDeploymentTypes } from '../combatMetamorphosis.js';
import { unitRecordForKey } from '../combatUnitService.js';
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

function UnitCard({ roster, unitKey, deployedSlotKey, selected, onSelect, onDragStart }) {
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
      title={deployedSlotKey ? `Desplegada en ${slotLabel(deployedSlotKey)}` : 'En reserva'}
    >
      <span className="deployment-unit-symbol" aria-hidden="true">{TYPE_SYMBOL[activeType] || '♙'}</span>
      <span className="deployment-unit-copy">
        <strong>{alias}</strong>
        <small>{rank.label} · nv.{level}</small>
        <small>{transformed ? `${TYPE_NAME[originType]} → ${TYPE_NAME[activeType]}` : TYPE_NAME[originType]}</small>
      </span>
      <span className={`deployment-unit-state ${deployedSlotKey ? 'active' : ''}`}>{deployedSlotKey ? 'TABLERO' : 'RESERVA'}</span>
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
  onClose,
}) {
  useEscapeToClose(onClose);
  const summary = useMemo(() => deploymentSummary(roster), [roster]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('rank');
  const [showTutorial, setShowTutorial] = useState(() => !loadMechanicTutorialProgress()?.['combat-deployment']?.seen);
  const [selectedUnitKey, setSelectedUnitKey] = useState(() => summary.reserveKeys[0] || summary.deployedKeys[0] || null);
  const [presets, setPresets] = useState(() => loadDeploymentPresets());
  const fen = useMemo(() => deploymentFen(roster), [roster]);
  const reverseDeployment = useMemo(
    () => Object.fromEntries(Object.entries(roster.deployment || {}).map(([slotKey, unitKey]) => [unitKey, slotKey])),
    [roster.deployment],
  );
  const units = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    return sortedUnitKeys(roster, sortBy).filter((unitKey) => {
      const origin = originTypeForRosterKey(unitKey);
      const alias = String(roster.identities?.[unitKey]?.alias || '').toLocaleLowerCase('es');
      const deployed = Boolean(reverseDeployment[unitKey]);
      if (needle && !alias.includes(needle) && !unitKey.toLocaleLowerCase('es').includes(needle)) return false;
      if (typeFilter !== 'all' && origin !== typeFilter) return false;
      if (statusFilter === 'deployed' && !deployed) return false;
      if (statusFilter === 'reserve' && deployed) return false;
      return true;
    });
  }, [roster, reverseDeployment, query, typeFilter, statusFilter, sortBy]);
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
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_MIME, unitKey);
    event.dataTransfer.setData('text/plain', unitKey);
    setSelectedUnitKey(unitKey);
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
    const unitKey = selectedUnitKey;
    const slot = deploymentSlotForSquare(square, 'w');
    if (unitKey && slot && isUnitCompatibleWithSlot(roster, unitKey, slot.key)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleSquareDrop(square, event) {
    event.preventDefault();
    const unitKey = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain') || selectedUnitKey;
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
            <p className="hint-text">Arrastra una unidad al tablero o selecciónala y toca una casilla válida. Cada puesto admite un único tipo de origen: un peón metamorfoseado sigue ocupando puesto de peón.</p>
          </div>
          <div className={`deployment-readiness ${summary.ready ? 'ready' : 'incomplete'}`}>
            <strong>{summary.assignedCount}/{summary.totalSlots}</strong>
            <span>{summary.ready ? 'Formación lista' : 'Formación incompleta'}</span>
          </div>
        </header>

        <div className="combat-deployment-layout">
          <aside className="deployment-barracks">
            <div className="deployment-panel-heading">
              <div><span>BARRACÓN</span><strong>{summary.totalRoster} unidades</strong></div>
              <small>{summary.reserveCount} en reserva</small>
            </div>
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
            <div className="deployment-filters">
              <input aria-label="Buscar unidad" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar alias…" />
              <div className="deployment-filter-row">
                <select aria-label="Filtrar por tipo" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">Todos los tipos</option>
                  <option value="p">Peones</option><option value="n">Caballos</option><option value="b">Alfiles</option><option value="r">Torres</option><option value="q">Damas</option><option value="k">Rey</option>
                </select>
                <select aria-label="Filtrar por estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Todo el roster</option><option value="deployed">Desplegados</option><option value="reserve">Reservas</option>
                </select>
              </div>
              <select aria-label="Ordenar unidades" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="rank">Rango ↓</option><option value="level">Nivel ↓</option><option value="type">Tipo</option><option value="name">Nombre A–Z</option>
              </select>
            </div>
            <div className="deployment-unit-list">
              {units.length === 0 && <p className="hint-text deployment-empty-filter">Ninguna unidad coincide con esos filtros.</p>}
              {units.map((unitKey) => (
                <UnitCard
                  key={unitKey}
                  roster={roster}
                  unitKey={unitKey}
                  deployedSlotKey={reverseDeployment[unitKey] || null}
                  selected={selectedUnitKey === unitKey}
                  onSelect={setSelectedUnitKey}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </aside>

          <main className="deployment-board-zone">
            <div className="deployment-board-caption">
              <span>FORMACIÓN PROPIA</span>
              <small>La fila superior representa tus piezas mayores; debajo, los ocho puestos de peón.</small>
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
              onSquareDragOver={handleSquareDragOver}
              onSquareDrop={handleSquareDrop}
              pieceLabels={pieceLabels}
            />
            {!summary.ready && (
              <div className="deployment-missing-strip">
                <b>Faltan:</b> {summary.missingSlots.map((slot) => slotLabel(slot.key)).join(' · ')}
              </div>
            )}
          </main>

          <aside className="deployment-inspector">
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
                  <div><dt>Estado</dt><dd>{selectedSlotKey ? `Desplegada · ${slotLabel(selectedSlotKey)}` : 'Reserva'}</dd></div>
                  <div><dt>Servicio</dt><dd>{selectedRecord?.stats?.battles || 0} batallas · {selectedRecord?.stats?.kills || 0} bajas</dd></div>
                  <div><dt>Amenaza propia</dt><dd>{selectedThreat?.bonus ? `+${selectedThreat.bonus}` : '0'} CPU potencial</dd></div>
                </dl>

                {selectedForms.length > 1 && (
                  <div className="deployment-form-selector">
                    <span>Forma para esta batalla</span>
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
                    <small>La identidad no cambia: un peón que combate como caballo sigue siendo peón, ocupa un puesto de peón y conserva su expediente.</small>
                  </div>
                )}

                {selectedSlotKey && selectedUnitKey !== 'k-e' && (
                  <button type="button" className="secondary-btn deployment-reserve-btn" onClick={() => onRemoveUnit(selectedUnitKey)}>
                    Enviar a reserva
                  </button>
                )}
              </>
            ) : <p className="hint-text">Selecciona una unidad del barracón o del tablero.</p>}
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
