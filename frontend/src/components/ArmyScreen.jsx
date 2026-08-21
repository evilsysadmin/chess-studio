import React, { useState } from 'react';
import {
  BASE_STATS,
  statsFor,
  derivedLevel,
  levelTier,
  costForNextPoint,
  reviveCost,
  CANONICAL_ROSTER_SLOTS,
  rosterSlotKey,
  STRENGTH_POINT_VALUE,
  SPEED_POINT_VALUE,
} from '../combat.js';
import { useEscapeToClose } from '../useEscapeToClose.js';
import { pieceRankForLevel } from '../combatRanks.js';
import { METAMORPHOSIS_LABELS, deploymentUnlockStatus, unlockedDeploymentTypes } from '../combatMetamorphosis.js';
import { techniquesEligibleToUnlock, unlockedTechniquesFor } from '../combatTechniques.js';
import { unitRecordForKey, unitDecorations } from '../combatUnitService.js';

const PIECE_GLYPH = Object.freeze({ k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' });

function unitAlias(roster, key) {
  return roster?.identities?.[key]?.alias || 'Sin alias';
}

function basePieceFor(slot, saved, activeType = slot.type) {
  return {
    type: activeType,
    strengthPoints: saved?.strengthPoints || 0,
    speedPoints: saved?.speedPoints || 0,
    bankedXp: saved?.bankedXp || 0,
    deploymentType: saved?.deploymentType || null,
    unlockedTechniques: Array.isArray(saved?.unlockedTechniques) ? saved.unlockedTechniques : [],
    equippedTechnique: saved?.equippedTechnique || null,
  };
}

function UnitServiceLine({ record }) {
  if (!record) return null;
  const stats = record.stats || {};
  const medals = unitDecorations(record);
  return (
    <div className="army-unit-service">
      <span>
        {(stats.battles || 0) === 0
          ? 'Servicio · sin bautismo de fuego'
          : `Servicio · ${stats.battles} batallas · ${stats.survivals || 0} supervivencias · ${stats.kills || 0} bajas${(stats.bestSurvivalStreak || 0) > 0 ? ` · mejor racha ${stats.bestSurvivalStreak}` : ''}${(stats.bossVictories || 0) > 0 ? ` · bosses ${stats.bossVictories}` : ''}`}
      </span>
      {medals.length > 0 && (
        <span className="army-unit-medals" aria-label={`${medals.length} condecoraciones individuales`}>
          {medals.map((medal) => (
            <i key={medal.id} title={`${medal.label}: ${medal.description}`}>✦ {medal.short}</i>
          ))}
        </span>
      )}
    </div>
  );
}

function formatMemorialDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-ES');
}

function Memorial({ roster }) {
  const entries = Array.isArray(roster?.memorial) ? [...roster.memorial].reverse().slice(0, 8) : [];
  if (entries.length === 0) return null;
  return (
    <section className="army-memorial" aria-label="Memorial de Caídos">
      <div className="army-memorial-heading">
        <div>
          <span className="army-memorial-kicker">EXPEDIENTE CERRADO</span>
          <h4>Memorial de Caídos</h4>
        </div>
        <b>{roster.memorial.length}</b>
      </div>
      <p className="hint-text">Identidades perdidas de forma definitiva. El reemplazo ocupa el mismo puesto, pero no hereda nombre, rango, técnicas ni historial.</p>
      <div className="army-memorial-list">
        {entries.map((entry) => {
          const stats = entry.stats || {};
          const origin = BASE_STATS[entry.originType]?.name || 'Unidad';
          const decorations = unitDecorations(entry);
          return (
            <article className="army-memorial-entry" key={entry.identityId}>
              <div>
                <strong>{entry.alias}</strong>
                <span>{entry.finalRankLabel || 'Recluta'} · {origin} · nivel {entry.finalLevel || 1}</span>
              </div>
              <span className="army-memorial-record">
                {stats.battles || 0} batallas · {stats.survivals || 0} supervivencias · {stats.kills || 0} bajas
                {entry.permanentDeathAt ? ` · ${formatMemorialDate(entry.permanentDeathAt)}` : ''}
              </span>
              {decorations.length > 0 && (
                <span className="army-unit-medals">
                  {decorations.map((medal) => <i key={medal.id} title={medal.label}>✦ {medal.short}</i>)}
                </span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function UnitRosterCard({ roster, slot, onOpen }) {
  const key = rosterSlotKey(slot);
  const alias = unitAlias(roster, key);
  const saved = roster?.pieces?.[key];
  const isKing = slot.type === 'k';
  const isDead = !isKing && saved?.alive === false;
  const unitRecord = unitRecordForKey(roster, key);
  const level = isKing ? null : 1 + (saved?.strengthPoints || 0) + (saved?.speedPoints || 0);
  const rank = isKing ? null : pieceRankForLevel(level);
  const deploymentChoices = isKing ? [slot.type] : unlockedDeploymentTypes(key, saved, unitRecord);
  const requestedType = saved?.deploymentType || slot.type;
  const activeType = deploymentChoices.includes(requestedType) ? requestedType : slot.type;
  const service = unitRecord?.stats || {};
  const medals = unitDecorations(unitRecord);

  return (
    <button
      type="button"
      className={`army-unit-tile ${isDead ? 'dead' : ''} ${isKing ? 'command' : ''}`}
      onClick={() => onOpen(key)}
      aria-label={`Abrir expediente de ${alias}`}
      title={`Abrir expediente de ${alias}`}
    >
      <span className="army-unit-tile-top">
        <span className="army-unit-glyph" aria-hidden="true">{PIECE_GLYPH[activeType] || '♟'}</span>
        <span className={`army-unit-state ${isDead ? 'dead' : activeType !== slot.type ? 'mutant' : ''}`}>
          {isKing ? 'MANDO' : isDead ? 'CAÍDO' : activeType !== slot.type ? METAMORPHOSIS_LABELS[activeType] : 'EN PIE'}
        </span>
      </span>
      <strong className="army-unit-alias" title={alias}>{alias}</strong>
      <span className="army-unit-meta">
        {isKing ? 'Rey · Mando' : `${BASE_STATS[slot.type].name} · ${rank.label} · nv.${level}`}
      </span>
      <span className="army-unit-quickstats">
        {isKing
          ? 'Identidad persistente · sin XP'
          : (service.battles || 0) > 0
            ? `${service.battles} bat. · ${service.survivals || 0} surv. · ${service.kills || 0} bajas`
            : 'Sin bautismo de fuego'}
      </span>
      {medals.length > 0 && <span className="army-unit-medal-count">✦ {medals.length}</span>}
    </button>
  );
}

function UnitDossier({ roster, slot, onBuy, onRevive, onMetamorphose, onUnlockTechnique, onEquipTechnique, onClose }) {
  if (!slot) return null;
  const key = rosterSlotKey(slot);
  const saved = roster?.pieces?.[key];
  const isKing = slot.type === 'k';
  const isDead = !isKing && saved?.alive === false;
  const unitRecord = unitRecordForKey(roster, key);
  const medals = unitDecorations(unitRecord);
  const rawLevel = isKing ? 1 : 1 + (saved?.strengthPoints || 0) + (saved?.speedPoints || 0);
  const militaryRank = isKing ? null : pieceRankForLevel(rawLevel);
  const deploymentStatuses = isKing ? [] : deploymentUnlockStatus(key, saved, unitRecord);
  const deploymentChoices = isKing ? [slot.type] : unlockedDeploymentTypes(key, saved, unitRecord);
  const requestedType = saved?.deploymentType || slot.type;
  const activeType = deploymentChoices.includes(requestedType) ? requestedType : slot.type;
  const piece = basePieceFor(slot, saved, activeType);
  const stats = statsFor(piece);
  const tier = isKing ? 'command' : levelTier(rawLevel);
  const nextLockedMetamorphosis = deploymentStatuses.find((status) => status.type !== slot.type && !status.unlocked);
  const unlockableTechniques = isKing || isDead ? [] : techniquesEligibleToUnlock(key, saved);
  const unlockedTechniques = isKing ? [] : unlockedTechniquesFor(key, saved);
  const equippedTechnique = saved?.equippedTechnique || null;
  const strCost = isKing ? null : costForNextPoint(piece.strengthPoints);
  const spdCost = isKing ? null : costForNextPoint(piece.speedPoints);
  const canRevive = isDead && (saved?.strengthPoints || 0) + (saved?.speedPoints || 0) > 0;
  const reviveType = saved?.deploymentType || slot.type;
  const revivePrice = isDead ? reviveCost(reviveType) : 0;
  const service = unitRecord?.stats || {};

  return (
    <div className="army-unit-detail-backdrop" onClick={onClose}>
      <section className="army-unit-detail" onClick={(e) => e.stopPropagation()} aria-label={`Expediente de ${unitAlias(roster, key)}`}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar expediente">×</button>
        <div className="army-unit-detail-heading">
          <span className={`army-unit-detail-glyph tier-${tier}`} aria-hidden="true">{PIECE_GLYPH[activeType] || '♟'}</span>
          <div>
            <span className="army-memorial-kicker">HOJA DE SERVICIO · {key.toUpperCase()}</span>
            <h3>{unitAlias(roster, key)}</h3>
            <p>{BASE_STATS[slot.type].name} de origen · columna {slot.file}{activeType !== slot.type ? ` · despliegue como ${METAMORPHOSIS_LABELS[activeType]}` : ''}</p>
          </div>
        </div>

        {isKing ? (
          <div className="army-command-note">
            <strong>Mando del ejército</strong>
            <span>El Rey tiene alias e identidad persistente, pero no gana XP, rango, medallas ni metamorfosis. Sigue las reglas normales de ajedrez.</span>
          </div>
        ) : (
          <>
            <div className="army-dossier-facts">
              <div><span>Rango</span><b>{militaryRank.short} · {militaryRank.label}</b></div>
              <div><span>Nivel</span><b>{rawLevel}</b></div>
              <div><span>Fuerza</span><b>{stats.strength.toFixed(1)}</b></div>
              <div><span>Velocidad</span><b>{stats.speed.toFixed(1)}</b></div>
              <div><span>XP pieza</span><b>{piece.bankedXp || 0}</b></div>
              <div><span>Estado</span><b className={isDead ? 'danger-text' : ''}>{isDead ? 'Caído' : 'En pie'}</b></div>
            </div>

            <div className="army-dossier-service">
              <strong>Expediente de combate</strong>
              <div className="army-dossier-service-grid">
                <span>{service.battles || 0}<small>batallas</small></span>
                <span>{service.survivals || 0}<small>supervivencias</small></span>
                <span>{service.kills || 0}<small>bajas</small></span>
                <span>{service.bestSurvivalStreak || 0}<small>mejor racha</small></span>
                <span>{service.bossVictories || 0}<small>bosses</small></span>
                <span>{service.revives || 0}<small>revividas</small></span>
              </div>
              {medals.length > 0 ? (
                <div className="army-dossier-medals">
                  {medals.map((medal) => (
                    <span key={medal.id} title={medal.description}>✦ <b>{medal.label}</b><small>{medal.description}</small></span>
                  ))}
                </div>
              ) : (
                <p className="hint-text">Sin condecoraciones todavía.</p>
              )}
            </div>

            {isDead ? (
              <div className="army-dossier-actions danger-zone">
                <strong>{canRevive ? 'Ventana de recuperación abierta' : 'Baja definitiva de recluta'}</strong>
                <p className="hint-text">
                  {canRevive
                    ? 'Si empiezas otra batalla sin revivir esta identidad, pasará al Memorial y el puesto recibirá un recluta nuevo.'
                    : 'No hay progreso invertido que recuperar. Al iniciar otra batalla pasará al Memorial y será reemplazado.'}
                </p>
                {canRevive && (
                  <button type="button" className="primary-btn" disabled={roster.combatXp < revivePrice} onClick={() => onRevive(key, reviveType)}>
                    Revivir {unitAlias(roster, key)} · {revivePrice} XP de combate
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="army-dossier-actions">
                  <strong>Mejoras</strong>
                  <div className="army-dossier-button-grid">
                    <button type="button" className="secondary-btn" disabled={piece.bankedXp < strCost} onClick={() => onBuy(key, 'strength')}>
                      + Fuerza ({strCost} XP) <small>→ {(stats.strength + STRENGTH_POINT_VALUE).toFixed(1)}</small>
                    </button>
                    <button type="button" className="secondary-btn" disabled={piece.bankedXp < spdCost} onClick={() => onBuy(key, 'speed')}>
                      + Velocidad ({spdCost} XP) <small>→ {(stats.speed + SPEED_POINT_VALUE).toFixed(1)}</small>
                    </button>
                  </div>
                </div>

                {(deploymentChoices.length > 1 || nextLockedMetamorphosis) && (
                  <div className="army-dossier-actions">
                    <strong>Metamorfosis de despliegue</strong>
                    {deploymentChoices.length > 1 && (
                      <div className="army-metamorphosis-actions">
                        {deploymentChoices.map((targetType) => (
                          <button
                            key={targetType}
                            type="button"
                            className={`secondary-btn metamorphosis-btn ${activeType === targetType ? 'active' : ''}`}
                            aria-pressed={activeType === targetType}
                            onClick={() => onMetamorphose?.(key, targetType)}
                          >
                            {activeType === targetType ? '✓ ' : ''}{METAMORPHOSIS_LABELS[targetType]}
                          </button>
                        ))}
                      </div>
                    )}
                    {nextLockedMetamorphosis && (
                      <p className="army-metamorphosis-status locked">
                        Siguiente · {nextLockedMetamorphosis.label}: {nextLockedMetamorphosis.rankLabel} + {nextLockedMetamorphosis.requirementLabel}. Progreso: {nextLockedMetamorphosis.progressLabel}.
                      </p>
                    )}
                  </div>
                )}

                {(unlockableTechniques.length > 0 || unlockedTechniques.length > 0) && (
                  <div className="army-dossier-actions">
                    <strong>Técnica especial · 1 uso por batalla</strong>
                    {unlockableTechniques.map((technique) => (
                      <button
                        key={technique.id}
                        type="button"
                        className="secondary-btn army-technique-unlock"
                        disabled={(piece.bankedXp || 0) < technique.unlockCost}
                        onClick={() => onUnlockTechnique?.(key, technique.id)}
                        title={technique.description}
                      >
                        Desbloquear {technique.label} ({technique.unlockCost} XP)
                      </button>
                    ))}
                    {unlockedTechniques.length > 0 && (
                      <div className="army-technique-actions">
                        <button type="button" className={`secondary-btn ${equippedTechnique == null ? 'active' : ''}`} onClick={() => onEquipTechnique?.(key, null)}>
                          {equippedTechnique == null ? '✓ ' : ''}Ninguna
                        </button>
                        {unlockedTechniques.map((technique) => (
                          <button
                            key={technique.id}
                            type="button"
                            className={`secondary-btn ${equippedTechnique === technique.id ? 'active' : ''}`}
                            onClick={() => onEquipTechnique?.(key, technique.id)}
                            title={technique.description}
                          >
                            {equippedTechnique === technique.id ? '✓ ' : ''}{technique.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export function ArmyRosterPanel({ roster, onBuy, onRevive, onMetamorphose, onUnlockTechnique, onEquipTechnique, embedded = false, showMemorial = true }) {
  const [selectedKey, setSelectedKey] = useState(null);
  useEscapeToClose(() => setSelectedKey(null), { disabled: !selectedKey });
  const selectedSlot = selectedKey ? CANONICAL_ROSTER_SLOTS.find((slot) => rosterSlotKey(slot) === selectedKey) : null;

  return (
    <section className={`army-roster-panel ${embedded ? 'embedded' : ''}`} aria-label="Orden de batalla de Combat Chess">
      <div className="army-roster-heading">
        <div>
          <span className="army-memorial-kicker">COMBAT CHESS · ORDEN DE BATALLA</span>
          <h3>Tu ejército</h3>
        </div>
        <span className="army-roster-count">16 unidades</span>
      </div>
      <p className="hint-text army-roster-intro">
        Todo el destacamento de un vistazo. Las 16 identidades tienen alias desde que nacen; 15 piezas desarrollan carrera militar y el Rey actúa como mando sin XP. Pulsa una unidad para abrir su expediente, mejorarla o preparar su despliegue.
      </p>
      <p className="hint-text army-combat-xp">
        XP de combate disponible: <b>{roster.combatXp}</b> · reservado para revivir bajas recuperables.
      </p>

      <div className="army-roster-grid" aria-label="Formación completa del ejército">
        {CANONICAL_ROSTER_SLOTS.map((slot) => (
          <UnitRosterCard key={rosterSlotKey(slot)} roster={roster} slot={slot} onOpen={setSelectedKey} />
        ))}
      </div>

      <p className="hint-text army-roster-footnote">Vista táctica en tres filas para que alias y rango se lean completos. El orden conserva primero piezas mayores y mando, después la infantería; el color del tablero puede cambiar, pero cada identidad sigue siendo la misma.</p>
      {showMemorial && <Memorial roster={roster} />}

      {selectedSlot && (
        <UnitDossier
          roster={roster}
          slot={selectedSlot}
          onBuy={onBuy}
          onRevive={onRevive}
          onMetamorphose={onMetamorphose}
          onUnlockTechnique={onUnlockTechnique}
          onEquipTechnique={onEquipTechnique}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </section>
  );
}

export default function ArmyScreen({ roster, onBuy, onRevive, onMetamorphose, onUnlockTechnique, onEquipTechnique, onClose }) {
  useEscapeToClose(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card army-roster-card" onClick={(e) => e.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <ArmyRosterPanel
          roster={roster}
          onBuy={onBuy}
          onRevive={onRevive}
          onMetamorphose={onMetamorphose}
          onUnlockTechnique={onUnlockTechnique}
          onEquipTechnique={onEquipTechnique}
        />
      </div>
    </div>
  );
}
