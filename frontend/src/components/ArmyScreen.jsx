import React from 'react';
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

export default function ArmyScreen({ roster, onBuy, onRevive, onMetamorphose, onUnlockTechnique, onEquipTechnique, onClose }) {
  useEscapeToClose(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card" onClick={(e) => e.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Tu ejército</h3>
        <p className="hint-text" style={{ marginBottom: '0.4rem' }}>
          El progreso guardado de tus 15 piezas (el rey no cuenta — sigue las reglas normales de ajedrez, sin
          nivel ni XP), sea cual sea el color que te toque jugar. Puedes gastar XP acá
          mismo, sin esperar a la próxima batalla.
        </p>
        <p className="hint-text army-combat-xp" style={{ marginBottom: '1rem' }}>
          XP de combate disponible: <b>{roster.combatXp}</b> · se usa para revivir piezas caídas.
        </p>

        <div className="army-list">
          {CANONICAL_ROSTER_SLOTS.filter((slot) => slot.type !== 'k').map((slot) => {
            const key = rosterSlotKey(slot);
            const saved = roster.pieces[key];
            const isDead = saved?.alive === false;
            const canRevive = isDead && (saved.strengthPoints || 0) + (saved.speedPoints || 0) > 0;
            const unitRecord = unitRecordForKey(roster, key);

            if (isDead) {
              const lastLevel = 1 + (saved.strengthPoints || 0) + (saved.speedPoints || 0);
              const activeType = saved.deploymentType || slot.type;
              const deadRank = pieceRankForLevel(lastLevel);
              const cost = reviveCost(activeType);
              return (
                <div className="army-row army-row-dead" key={key}>
                  <span className="army-aura tier-dead">✕</span>
                  <div className="army-row-info">
                    <span className="army-row-name">
                      {roster.identities?.[key]?.alias || 'Sin alias'} — {BASE_STATS[slot.type].name} <span className="army-row-file">({slot.file})</span>
                      <span className="army-piece-rank">{deadRank.short} · {deadRank.label}</span>
                    </span>
                    <span className="army-row-stats army-row-urgent">
                      {canRevive
                        ? `Baja crítica · era nivel ${lastLevel} · una única ventana para recuperarla; si partes sin hacerlo, pasa al Memorial`
                        : `Baja definitiva de recluta · nivel ${lastLevel} · sin progreso recuperable; pasará al Memorial al iniciar la siguiente batalla`}
                    </span>
                    <UnitServiceLine record={unitRecord} />
                  </div>
                  <div className="army-row-buy">
                    {canRevive ? (
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={roster.combatXp < cost}
                        onClick={() => onRevive(key, activeType)}
                      >
                        Revivir ({cost} XP)
                      </button>
                    ) : (
                      <span className="army-no-revive">Sin revivir</span>
                    )}
                  </div>
                </div>
              );
            }

            const deploymentStatuses = deploymentUnlockStatus(key, saved, unitRecord);
            const deploymentChoices = unlockedDeploymentTypes(key, saved, unitRecord);
            const requestedType = saved?.deploymentType || slot.type;
            const activeType = deploymentChoices.includes(requestedType) ? requestedType : slot.type;
            const piece = { type: activeType, ...(saved || { strengthPoints: 0, speedPoints: 0, bankedXp: 0 }) };
            piece.type = activeType;
            const stats = statsFor(piece);
            const level = derivedLevel(piece);
            const tier = levelTier(level);
            const militaryRank = pieceRankForLevel(level);
            const hasMetamorphosisChoices = deploymentChoices.length > 1;
            const nextLockedMetamorphosis = deploymentStatuses.find((status) => status.type !== slot.type && !status.unlocked);
            const unlockableTechniques = techniquesEligibleToUnlock(key, saved);
            const unlockedTechniques = unlockedTechniquesFor(key, saved);
            const equippedTechnique = saved?.equippedTechnique || null;
            const strCost = costForNextPoint(piece.strengthPoints);
            const spdCost = costForNextPoint(piece.speedPoints);

            return (
              <div className="army-row" key={key}>
                <span className={`army-aura tier-${tier}`}>{level}</span>
                <div className="army-row-info">
                  <span className="army-row-name">
                    {roster.identities?.[key]?.alias || 'Sin alias'} — {BASE_STATS[slot.type].name} <span className="army-row-file">({slot.file})</span>
                    <span className="army-piece-rank">{militaryRank.short} · {militaryRank.label}</span>
                  </span>
                  <span className="army-row-stats">
                    Fuerza {stats.strength.toFixed(1)} · Velocidad {stats.speed.toFixed(1)} · XP {piece.bankedXp}
                  </span>
                  <UnitServiceLine record={unitRecord} />
                  {activeType !== slot.type && (
                    <span className="army-metamorphosis-status">Próximo despliegue: {METAMORPHOSIS_LABELS[activeType]}. La identidad y clase de origen no cambian.</span>
                  )}
                  {hasMetamorphosisChoices && (
                    <span className="army-metamorphosis-status ready">{militaryRank.label}: el servicio de esta unidad ya habilita formas alternativas. Elige el despliegue antes de combatir.</span>
                  )}
                  {slot.type === 'p' && nextLockedMetamorphosis && level >= 6 && (
                    <span className="army-metamorphosis-status locked">
                      Siguiente forma · {nextLockedMetamorphosis.label}: requiere {nextLockedMetamorphosis.rankLabel} + {nextLockedMetamorphosis.requirementLabel}.
                      {' '}Progreso: {nextLockedMetamorphosis.progressLabel}.
                    </span>
                  )}
                  {(unlockableTechniques.length > 0 || unlockedTechniques.length > 0) && (
                    <div className="army-technique-block">
                      <span className="army-technique-title">Técnica especial · 1 uso por batalla</span>
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
                        <>
                          <span className="army-technique-description">
                            {equippedTechnique
                              ? `Equipada para la próxima batalla: ${unlockedTechniques.find((t) => t.id === equippedTechnique)?.label || equippedTechnique}.`
                              : 'Sin técnica equipada para la próxima batalla.'}
                          </span>
                          <div className="army-technique-actions">
                            <button
                              type="button"
                              className={`secondary-btn ${equippedTechnique == null ? 'active' : ''}`}
                              aria-pressed={equippedTechnique == null}
                              onClick={() => onEquipTechnique?.(key, null)}
                            >
                              {equippedTechnique == null ? '✓ ' : ''}Ninguna
                            </button>
                            {unlockedTechniques.map((technique) => (
                              <button
                                key={technique.id}
                                type="button"
                                className={`secondary-btn ${equippedTechnique === technique.id ? 'active' : ''}`}
                                aria-pressed={equippedTechnique === technique.id}
                                onClick={() => onEquipTechnique?.(key, technique.id)}
                                title={technique.description}
                              >
                                {equippedTechnique === technique.id ? '✓ ' : ''}{technique.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="army-row-buy">
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={piece.bankedXp < strCost}
                    onClick={() => onBuy(key, 'strength')}
                    title="Comprar un punto de fuerza"
                  >
                    <span>+F ({strCost})</span>
                    <span className="buy-preview">→ {(stats.strength + STRENGTH_POINT_VALUE).toFixed(1)}</span>
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={piece.bankedXp < spdCost}
                    onClick={() => onBuy(key, 'speed')}
                    title="Comprar un punto de velocidad"
                  >
                    <span>+V ({spdCost})</span>
                    <span className="buy-preview">→ {(stats.speed + SPEED_POINT_VALUE).toFixed(1)}</span>
                  </button>
                  {hasMetamorphosisChoices && onMetamorphose && (
                    <div className="army-metamorphosis-actions">
                      {deploymentChoices.map((targetType) => (
                        <button
                          key={targetType}
                          type="button"
                          className={`secondary-btn metamorphosis-btn ${activeType === targetType ? 'active' : ''}`}
                          aria-pressed={activeType === targetType}
                          onClick={() => onMetamorphose(key, targetType)}
                        >
                          {activeType === targetType ? '✓ ' : ''}{METAMORPHOSIS_LABELS[targetType]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Memorial roster={roster} />
      </div>
    </div>
  );
}
