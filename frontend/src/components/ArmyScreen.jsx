import { useEffect, useState } from 'react';
import {
  BASE_STATS,
  statsFor,
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
import { veteranLegacy } from '../combatVeteranLegacy.js';
import { deploymentSummary } from '../combatDeployment.js';
import MechanicTutorialHelp from './MechanicTutorialHelp.jsx';
import { equipmentBonus, equipmentById } from '../combatEconomy.js';

const PIECE_GLYPH = Object.freeze({ k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' });

function unitAlias(roster, key) {
  return roster?.identities?.[key]?.alias || 'Sin alias';
}

function basePieceFor(slot, saved, activeType = slot.type) {
  const gear = equipmentBonus(saved?.equipmentId);
  return {
    type: activeType,
    strengthPoints: (saved?.strengthPoints || 0) + gear.strength,
    speedPoints: (saved?.speedPoints || 0) + gear.speed,
    bankedXp: saved?.bankedXp || 0,
    deploymentType: saved?.deploymentType || null,
    unlockedTechniques: Array.isArray(saved?.unlockedTechniques) ? saved.unlockedTechniques : [],
    equippedTechnique: saved?.equippedTechnique || null,
  };
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

function UnitRosterCard({ roster, slot, onOpen, deployedSlotKey = null }) {
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
        {isKing ? 'Rey · Mando' : <>
          <span>{BASE_STATS[slot.type].name}</span>
          <span className={`combat-rank-tag rank-${rank.id}`}>{rank.short} · {rank.label}</span>
          <span>nv.{level}</span>
        </>}
      </span>
      <span className="army-unit-quickstats">
        {isKing
          ? 'Identidad persistente · sin XP'
          : (service.battles || 0) > 0
            ? `${service.battles} bat. · ${service.survivals || 0} surv. · ${service.kills || 0} bajas`
            : 'Sin bautismo de fuego'}
      </span>
      <span className={`army-unit-deploy-badge ${deployedSlotKey ? 'deployed' : 'reserve'}`}>{isDead ? 'FUERA' : deployedSlotKey ? 'DESPLEGADO' : 'RESERVA'}</span>
      {medals.length > 0 && <span className="army-unit-medal-count">✦ {medals.length}</span>}
    </button>
  );
}

function ReserveRosterCard({ roster, unitKey, onOpen, deployedSlotKey = null }) {
  const originType = String(unitKey || '').split('-')[0] || 'p';
  const alias = unitAlias(roster, unitKey);
  const saved = roster?.pieces?.[unitKey];
  const isDead = saved?.alive === false;
  const unitRecord = unitRecordForKey(roster, unitKey);
  const level = 1 + (saved?.strengthPoints || 0) + (saved?.speedPoints || 0);
  const rank = pieceRankForLevel(level);
  const deploymentChoices = unlockedDeploymentTypes(unitKey, saved, unitRecord);
  const requestedType = saved?.deploymentType || originType;
  const activeType = deploymentChoices.includes(requestedType) ? requestedType : originType;
  const service = unitRecord?.stats || {};
  const medals = unitDecorations(unitRecord);

  return (
    <button
      type="button"
      className={`army-unit-tile army-reserve-unit ${isDead ? 'dead' : ''}`}
      onClick={() => onOpen(unitKey)}
      aria-label={`Abrir expediente de ${alias}`}
      title={`Abrir expediente de ${alias}`}
    >
      <span className="army-unit-tile-top">
        <span className="army-unit-glyph" aria-hidden="true">{PIECE_GLYPH[activeType] || '♟'}</span>
        <span className={`army-unit-state ${isDead ? 'dead' : activeType !== originType ? 'mutant' : ''}`}>
          {isDead ? 'CAÍDO' : activeType !== originType ? METAMORPHOSIS_LABELS[activeType] : 'RESERVA'}
        </span>
      </span>
      <strong className="army-unit-alias" title={alias}>{alias}</strong>
      <span className="army-unit-meta"><span>{BASE_STATS[originType]?.name || 'Unidad'}</span><span className={`combat-rank-tag rank-${rank.id}`}>{rank.short} · {rank.label}</span><span>nv.{level}</span></span>
      <span className="army-unit-quickstats">
        {(service.battles || 0) > 0
          ? `${service.battles} bat. · ${service.survivals || 0} surv. · ${service.kills || 0} bajas`
          : 'Sin bautismo de fuego'}
      </span>
      <span className={`army-unit-deploy-badge ${deployedSlotKey ? 'deployed' : 'reserve'}`}>{isDead ? 'FUERA' : deployedSlotKey ? 'DESPLEGADO' : 'RESERVA'}</span>
      {medals.length > 0 && <span className="army-unit-medal-count">✦ {medals.length}</span>}
    </button>
  );
}

function UnitDossier({ roster, slot, unitKey, onBuy, onRevive, onRename, onMetamorphose, onUnlockTechnique, onEquipTechnique, onRequestBio, onClose }) {
  const key = unitKey || (slot ? rosterSlotKey(slot) : null);
  if (!key) return null;
  const originType = slot?.type || String(key).split('-')[0] || 'p';
  const originFile = slot?.file || null;
  const saved = roster?.pieces?.[key];
  const isKing = originType === 'k';
  const isDead = !isKing && saved?.alive === false;
  const unitRecord = unitRecordForKey(roster, key);
  const medals = unitDecorations(unitRecord);
  const rawLevel = isKing ? 1 : 1 + (saved?.strengthPoints || 0) + (saved?.speedPoints || 0);
  const militaryRank = isKing ? null : pieceRankForLevel(rawLevel);
  const deploymentStatuses = isKing ? [] : deploymentUnlockStatus(key, saved, unitRecord);
  const deploymentChoices = isKing ? [originType] : unlockedDeploymentTypes(key, saved, unitRecord);
  const requestedType = saved?.deploymentType || originType;
  const activeType = deploymentChoices.includes(requestedType) ? requestedType : originType;
  const piece = basePieceFor({ type: originType }, saved, activeType);
  const stats = statsFor(piece);
  const tier = isKing ? 'command' : levelTier(rawLevel);
  const nextLockedMetamorphosis = deploymentStatuses.find((status) => status.type !== originType && !status.unlocked);
  const unlockableTechniques = isKing || isDead ? [] : techniquesEligibleToUnlock(key, saved);
  const unlockedTechniques = isKing ? [] : unlockedTechniquesFor(key, saved);
  const equippedTechnique = saved?.equippedTechnique || null;
  const strCost = isKing ? null : costForNextPoint(saved?.strengthPoints || 0);
  const spdCost = isKing ? null : costForNextPoint(saved?.speedPoints || 0);
  const canRevive = isDead && (saved?.strengthPoints || 0) + (saved?.speedPoints || 0) > 0;
  const reviveType = saved?.deploymentType || originType;
  const revivePrice = isDead ? reviveCost(reviveType) : 0;
  const service = unitRecord?.stats || {};
  const legacy = isKing ? null : veteranLegacy(unitRecord);
  const identity = roster?.identities?.[key] || {};
  const equipment = equipmentById(saved?.equipmentId);

  useEffect(() => {
    if (identity.bioStatus === 'unrequested') onRequestBio?.(key);
  }, [identity.bioStatus, key, onRequestBio]);

  return (
    <div className="army-unit-detail-backdrop" onClick={onClose}>
      <section className="army-unit-detail" onClick={(e) => e.stopPropagation()} aria-label={`Expediente de ${unitAlias(roster, key)}`}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar expediente">×</button>
        <div className="army-unit-detail-heading">
          <span className={`army-unit-detail-glyph tier-${tier}`} aria-hidden="true">{PIECE_GLYPH[activeType] || '♟'}</span>
          <div>
            <span className="army-memorial-kicker">HOJA DE SERVICIO · {key.toUpperCase()}</span>
            <h3>{unitAlias(roster, key)}</h3>
            {onRename && (
              <button
                type="button"
                className="army-rename-button"
                onClick={() => {
                  const current = unitAlias(roster, key);
                  const next = window.prompt('Nuevo alias de la unidad (máx. 28 caracteres)', current);
                  if (next != null) onRename(key, next);
                }}
              >
                Renombrar unidad
              </button>
            )}
            <p>{BASE_STATS[originType]?.name || 'Unidad'} de origen{originFile ? ` · columna ${originFile}` : ' · plaza de reserva'}{activeType !== originType ? ` · combate como ${METAMORPHOSIS_LABELS[activeType]}` : ''}</p>
          </div>
        </div>

        {isKing ? (
          <div className="army-command-note">
            <strong>Mando del ejército</strong>
            <span title="El Rey conserva identidad, pero no gana XP, rango, medallas ni metamorfosis.">Mando · sin progresión individual.</span>
          </div>
        ) : (
          <>
            <div className="army-unit-legacy">
              <span className="army-memorial-kicker">LEGADO</span>
              <strong>{legacy.title}</strong>
              <p>{legacy.reason}</p>
              {legacy.latestDecoration && (
                <small>Última condecoración · ✦ {legacy.latestDecoration.label}</small>
              )}
            </div>

            <div className="army-dossier-facts">
              <div><span>Rango</span><b>{militaryRank.short} · {militaryRank.label}</b></div>
              <div><span>Nivel</span><b>{rawLevel}</b></div>
              <div><span>Fuerza</span><b>{stats.strength.toFixed(1)}</b></div>
              <div><span>Velocidad</span><b>{stats.speed.toFixed(1)}</b></div>
              <div><span>XP pieza</span><b>{piece.bankedXp || 0}</b></div>
              <div><span>Estado</span><b className={isDead ? 'danger-text' : ''}>{isDead ? 'Caído' : 'En pie'}</b></div>
            </div>

            <div className={`army-unit-equipment ${equipment ? 'equipped' : 'empty'}`}>
              <div><span className="army-memorial-kicker">OBJETO EQUIPADO · 1 HUECO</span><strong>{equipment ? `${equipment.icon} ${equipment.label}` : 'Sin objeto'}</strong></div>
              <small>{equipment ? `${equipment.description} Bonus aplicado sólo mientras lo lleva esta unidad.` : 'Compra y asigna armas o utilidades desde el Mercado.'}</small>
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
                  <button type="button" className="primary-btn" disabled={roster.credits < revivePrice} onClick={() => onRevive(key, reviveType)}>
                    Revivir {unitAlias(roster, key)} · {revivePrice} créditos
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
                    <div className="combat-heading-row">
                      <strong>Metamorfosis de despliegue</strong>
                      <MechanicTutorialHelp tutorialId="combat-metamorphosis" label="Tutorial de metamorfosis" />
                    </div>
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

        <div className="army-unit-bio" aria-live="polite">
          <span className="army-memorial-kicker">BIO · ARCHIVO DE CAMPAÑA</span>
          {identity.bioStatus === 'ready' && identity.bio
            ? <p>{identity.bio}</p>
            : <p className="hint-text">Workers AI está redactando un expediente único para esta identidad. Se guardará aquí cuando esté listo.</p>}
        </div>
      </section>
    </div>
  );
}

export function ArmyRosterPanel({ roster, onBuy, onRevive, onRename, onMetamorphose, onUnlockTechnique, onEquipTechnique, onRequestBio, embedded = false, showMemorial = true }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const deploy = deploymentSummary(roster);
  useEscapeToClose(() => setSelectedKey(null), { disabled: !selectedKey });
  const selectedSlot = selectedKey ? CANONICAL_ROSTER_SLOTS.find((slot) => rosterSlotKey(slot) === selectedKey) : null;
  const canonicalKeys = new Set(CANONICAL_ROSTER_SLOTS.map(rosterSlotKey));
  const reverseDeployment = Object.fromEntries(Object.entries(roster?.deployment || {}).map(([slotKey, unitKey]) => [unitKey, slotKey]));
  const reserveKeys = Object.keys(roster?.identities || {})
    .filter((key) => !canonicalKeys.has(key))
    .sort((a, b) => {
      const aSaved = roster?.pieces?.[a] || {};
      const bSaved = roster?.pieces?.[b] || {};
      const aAlive = aSaved.alive !== false;
      const bAlive = bSaved.alive !== false;
      if (aAlive !== bAlive) return aAlive ? -1 : 1;
      const aLevel = 1 + (aSaved.strengthPoints || 0) + (aSaved.speedPoints || 0);
      const bLevel = 1 + (bSaved.strengthPoints || 0) + (bSaved.speedPoints || 0);
      const rankDiff = pieceRankForLevel(bLevel).minLevel - pieceRankForLevel(aLevel).minLevel;
      if (rankDiff) return rankDiff;
      return unitAlias(roster, a).localeCompare(unitAlias(roster, b));
    });
  const deployedCount = Object.values(roster?.deployment || {}).filter(Boolean).length;
  const fallenCount = Object.values(roster?.pieces || {}).filter((piece) => piece?.alive === false).length;

  return (
    <section className={`army-roster-panel ${embedded ? 'embedded' : ''}`} aria-label="Orden de batalla de Combat Chess">
      <div className="army-roster-heading">
        <div>
          <span className="army-memorial-kicker">COMBAT CHESS · ORDEN DE BATALLA</span>
          <h3>Tu ejército</h3>
        </div>
        <span className="army-roster-count">{deploy.totalRoster} unidades · {deploy.reserveCount} reservas</span>
      </div>
      <p className="combat-operational-hint army-roster-intro" title="El barracón puede superar 16 unidades. Solo 16 slots canónicos entran en batalla; las reservas mantienen identidad, rango e historial.">16 desplegados · reservas persistentes.</p>
      <p className="hint-text army-combat-xp">
        Créditos disponibles: <b>{roster.credits || 0}</b> · revives, contratos y equipo. La XP pertenece a cada unidad.
      </p>

      <div className="army-command-strip" aria-label="Estado del barracón">
        <span><b>{deploy.totalRoster}</b><small>roster</small></span>
        <span><b>{deployedCount}</b><small>desplegados</small></span>
        <span><b>{deploy.reserveCount}</b><small>reservas</small></span>
        <span className={fallenCount ? 'danger-text' : ''}><b>{fallenCount}</b><small>caídos</small></span>
      </div>

      <div className="army-roster-grid" aria-label="Formación completa del ejército">
        {CANONICAL_ROSTER_SLOTS.map((slot) => (
          <UnitRosterCard key={rosterSlotKey(slot)} roster={roster} slot={slot} onOpen={setSelectedKey} deployedSlotKey={reverseDeployment[rosterSlotKey(slot)] || null} />
        ))}
      </div>

      {reserveKeys.length > 0 && (
        <section className="army-reserve-section" aria-label="Reservas del barracón">
          <div className="army-reserve-heading">
            <span className="army-memorial-kicker">BARRACÓN · REFUERZOS</span>
            <b>{reserveKeys.length}</b>
          </div>
          <div className="army-reserve-grid">
            {reserveKeys.map((unitKey) => (
              <ReserveRosterCard key={unitKey} roster={roster} unitKey={unitKey} onOpen={setSelectedKey} deployedSlotKey={reverseDeployment[unitKey] || null} />
            ))}
          </div>
        </section>
      )}

      {showMemorial && <Memorial roster={roster} />}

      {selectedKey && (
        <UnitDossier
          roster={roster}
          slot={selectedSlot}
          unitKey={selectedKey}
          onBuy={onBuy}
          onRevive={onRevive}
          onRename={onRename}
          onMetamorphose={onMetamorphose}
          onUnlockTechnique={onUnlockTechnique}
          onEquipTechnique={onEquipTechnique}
          onRequestBio={onRequestBio}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </section>
  );
}

export default function ArmyScreen({ roster, onBuy, onRevive, onRename, onMetamorphose, onUnlockTechnique, onEquipTechnique, onClose }) {
  useEscapeToClose(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="army-card army-roster-card" onClick={(e) => e.stopPropagation()}>
        <button className="piece-info-close" onClick={onClose} aria-label="Cerrar">×</button>
        <ArmyRosterPanel
          roster={roster}
          onBuy={onBuy}
          onRevive={onRevive}
          onRename={onRename}
          onMetamorphose={onMetamorphose}
          onUnlockTechnique={onUnlockTechnique}
          onEquipTechnique={onEquipTechnique}
        />
      </div>
    </div>
  );
}
