import { useEffect, useMemo, useState } from 'react';
import './HomeCastleLife.css';
import './HomeGreatHall.css';
import './HomeCastleAmbience.css';
import HomeGreatHallScene from './HomeGreatHallScene.jsx';
import CastleHallsModal from './CastleHallsModal.jsx';
import { ACHIEVEMENTS, loadAchievementLedger, loadUnlocked } from '../achievements.js';
import { buildCastleHallGallery, castleHallSummary } from '../castleHall.js';
import {
  castleHonourObjects,
  castleLedgerFingerprint,
  castleUnlockSummary,
  emptyCastleUnlockLedger,
  loadCastleUnlockLedger,
  persistCastleUnlockLedger,
  reconcileCastleUnlocks,
} from '../castleProgression.js';

const MAX_OBJECTS = 3;
const RARE_SIGHTING_THRESHOLD = 0.025;
const HIGH_HONOUR_PRESTIGE = 80;
const ACHIEVEMENT_DESCRIPTIONS = Object.freeze(Object.fromEntries(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement.description]),
));

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function achievementIdSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

function achievementStateFingerprint(ids, ledger) {
  const unlocked = [...achievementIdSet(ids)].sort();
  const rows = unlocked.map((id) => {
    const record = ledger?.records?.[id] || null;
    return [id, record?.legacy === true, record?.recordedAt || null, record?.source || null];
  });
  return JSON.stringify(rows);
}

function castleAmbience({ honours, stateObjects, hasSavedGame }) {
  const strongestHonour = honours[0] || null;
  if (strongestHonour && asNumber(strongestHonour.prestige) >= HIGH_HONOUR_PRESTIGE) {
    return { id: 'honour', evidence: strongestHonour.id };
  }

  const campaign = stateObjects.find((object) => object.id === 'combat-map');
  if (campaign) return { id: 'campaign', evidence: campaign.id };

  const active = stateObjects.find((object) => object.kind === 'progress');
  if (active) return { id: 'active', evidence: active.id };
  if (strongestHonour) return { id: 'active', evidence: strongestHonour.id };
  if (hasSavedGame) return { id: 'active', evidence: 'saved-game' };
  return { id: 'quiet', evidence: 'none' };
}

export function buildHomeCastleLifeModel({
  hasSavedGame = false,
  combatProgress = {},
  tournamentLevel = 1,
  tournamentProgress = 0,
  today = {},
  rivalry = {},
  achievementIds = [],
  achievementLedger = null,
  castleLedger = null,
  rareRoll = 1,
} = {}) {
  const objects = [];
  const credits = asNumber(combatProgress?.credits);
  const combatNext = asNumber(combatProgress?.nextProgress);
  const combatRank = String(combatProgress?.rank?.label || 'Recluta');
  const streak = asNumber(today?.streak);
  const dailySolved = asNumber(today?.dailySolvedCount);
  const humanWins = asNumber(rivalry?.record?.wins);

  if (hasSavedGame) {
    objects.push({
      id: 'saved-game',
      glyph: '♜',
      label: 'Tablero en pausa',
      detail: 'Hay una partida real esperando tu regreso.',
      tone: 'parchment',
      kind: 'state',
      prestige: 0,
    });
  }

  if (credits > 0 || combatNext > 0 || combatRank !== 'Recluta') {
    objects.push({
      id: 'combat-map',
      glyph: '⚔︎',
      label: 'Mapa de campaña',
      detail: `${combatRank} · ${credits} créditos operativos`,
      tone: 'ember',
      kind: 'progress',
      prestige: 24,
    });
  }

  if (streak > 0 || dailySolved > 0) {
    objects.push({
      id: 'daily-seal',
      glyph: '✦',
      label: 'Sello del día',
      detail: dailySolved > 0 ? `${dailySolved}/3 desafíos resueltos · racha ${streak}` : `Racha activa · ${streak}`,
      tone: 'brass',
      kind: 'progress',
      prestige: 16,
    });
  }

  if (asNumber(tournamentLevel) > 1 || asNumber(tournamentProgress) > 0) {
    objects.push({
      id: 'tournament-cup',
      glyph: '♛',
      label: 'Copa de torneo',
      detail: `Nivel ${asNumber(tournamentLevel)} · ${asNumber(tournamentProgress)} XP en curso`,
      tone: 'brass',
      kind: 'progress',
      prestige: 26,
    });
  }

  if (humanWins > 0) {
    objects.push({
      id: 'rivalry-plaque',
      glyph: '♟',
      label: 'Placa de rivalidad',
      detail: `${humanWins} ${humanWins === 1 ? 'victoria' : 'victorias'} demostradas sobre Matthias`,
      tone: 'steel',
      kind: 'progress',
      prestige: 30,
    });
  }

  if (objects.length === 0) {
    objects.push({
      id: 'quiet-desk',
      glyph: '·',
      label: 'Mesa despejada',
      detail: 'Nada urgente. El tablero sigue siendo el centro de la sala.',
      tone: 'quiet',
      kind: 'empty',
      prestige: 0,
    });
  }

  // Compatibility path for tests and old callers: if a persisted castle
  // ledger has not been supplied yet, derive the exact same factual unlocks
  // from the achievement ledger without writing during model construction.
  const resolvedCastleLedger = castleLedger || reconcileCastleUnlocks(
    emptyCastleUnlockLedger(), achievementIds, achievementLedger,
  );
  const honours = castleHonourObjects(resolvedCastleLedger, ACHIEVEMENT_DESCRIPTIONS);
  const ambience = castleAmbience({ honours, stateObjects: objects, hasSavedGame });
  const orderedObjects = honours.length > 0 ? [...honours, ...objects] : objects;
  const roll = Number(rareRoll);
  const rareSighting = Number.isFinite(roll) && roll >= 0 && roll < RARE_SIGHTING_THRESHOLD
    ? {
        id: 'armour-glance',
        label: 'Una armadura acaba de girar unos grados hacia el tablero. Probablemente nada.',
      }
    : null;

  return {
    objects: orderedObjects.slice(0, MAX_OBJECTS),
    rareSighting,
    ambience: ambience.id,
    ambienceEvidence: ambience.evidence,
    unlockSummary: castleUnlockSummary(resolvedCastleLedger),
  };
}

export default function HomeCastleLife({ achievementIds = null, achievementLedger = null, hallGallery = null, onReviewCastleGame = null, ...props }) {
  const resolvedAchievementIds = achievementIds ?? [...loadUnlocked()];
  const resolvedAchievementLedger = achievementLedger ?? loadAchievementLedger();
  const [persistedCastleLedger, setPersistedCastleLedger] = useState(() => loadCastleUnlockLedger());
  const [showCastleHalls, setShowCastleHalls] = useState(false);
  const resolvedHallGallery = useMemo(() => hallGallery || buildCastleHallGallery(), [hallGallery]);
  const hallSummary = castleHallSummary(resolvedHallGallery);
  const achievementFingerprint = achievementStateFingerprint(resolvedAchievementIds, resolvedAchievementLedger);
  const persistedFingerprint = castleLedgerFingerprint(persistedCastleLedger);
  const reconciledCastleLedger = useMemo(
    () => reconcileCastleUnlocks(persistedCastleLedger, resolvedAchievementIds, resolvedAchievementLedger),
    // The compact fingerprints intentionally avoid object-identity churn from
    // callers that reconstruct Set/ledger wrappers on every Home render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [achievementFingerprint, persistedFingerprint],
  );
  const reconciledFingerprint = castleLedgerFingerprint(reconciledCastleLedger);

  useEffect(() => {
    if (reconciledFingerprint === persistedFingerprint) return;
    if (persistCastleUnlockLedger(reconciledCastleLedger)) {
      setPersistedCastleLedger(reconciledCastleLedger);
    }
  }, [reconciledCastleLedger, reconciledFingerprint, persistedFingerprint]);

  const model = buildHomeCastleLifeModel({
    ...props,
    achievementIds: resolvedAchievementIds,
    achievementLedger: resolvedAchievementLedger,
    castleLedger: reconciledCastleLedger,
  });
  // Estado transitorio (partida pausada) y vacío no son "trofeos". Ya tienen
  // UI funcional propia; repetirlos aquí convertiría el castillo en dashboard.
  const visibleObjects = model.objects.filter((object) => object.kind === 'progress' || object.kind === 'honour');
  const honourObjects = visibleObjects.filter((object) => object.kind === 'honour');
  const hasHallEvidence = hallSummary.fame > 0 || hallSummary.shame > 0;

  return <>
    <section
      className={`home-castle-life${model.rareSighting ? ' has-rare-sighting' : ''}`}
      aria-label="La estancia de Chess Studio"
      data-castle-life="real-state-v1"
      data-castle-ledger="evidence-v1"
      data-castle-ambience={model.ambience}
      data-castle-ambience-evidence={model.ambienceEvidence}
      data-castle-honours={honourObjects.length}
      data-castle-unlocks={model.unlockSummary.total}
      data-castle-unlocks-recorded={model.unlockSummary.recorded}
      data-castle-unlocks-legacy={model.unlockSummary.legacy}
      data-castle-fame={hallSummary.fame}
      data-castle-shame={hallSummary.shame}
    >
      <HomeGreatHallScene ambience={model.ambience} />
      <div className="home-castle-life__decor" aria-label="Objetos desbloqueados del castillo">
        {visibleObjects.map((object, index) => (
          <span
            className={`home-castle-object tone-${object.tone} kind-${object.kind} castle-slot-${index}`}
            data-castle-object={object.id}
            data-castle-kind={object.kind}
            data-castle-prestige={object.prestige}
            data-castle-rarity={object.rarity || 'state'}
            data-castle-evidence={object.evidence || 'state'}
            data-castle-earned-at={object.earnedAt || ''}
            key={object.id}
            role="img"
            tabIndex={0}
            aria-label={`${object.label}. ${object.detail}`}
          >
            <i className="home-castle-object__hanger" aria-hidden="true" />
            <b className="home-castle-object__glyph" aria-hidden="true">{object.glyph}</b>
            <span className="home-castle-object__tooltip" aria-hidden="true">
              <strong>{object.label}</strong>
              <small>{object.detail}</small>
            </span>
          </span>
        ))}
      </div>

      {hasHallEvidence && (
        <button
          type="button"
          className="home-castle-halls-door"
          onClick={() => setShowCastleHalls(true)}
          data-castle-halls="evidence-v1"
          aria-label={`Abrir galerías del castillo. ${hallSummary.fame} de gloria y ${hallSummary.shame} de vergüenza.`}
        >
          <span aria-hidden="true">♜</span>
          <i aria-hidden="true" />
          <small aria-hidden="true">ARCHIVO</small>
        </button>
      )}

      {model.rareSighting && (
        <span className="home-castle-life__rare" data-rare-sighting={model.rareSighting.id} aria-hidden="true">
          <span>♜</span>
        </span>
      )}
    </section>

    {showCastleHalls && (
      <CastleHallsModal
        gallery={resolvedHallGallery}
        onClose={() => setShowCastleHalls(false)}
        onReviewGame={onReviewCastleGame ? (gameId) => { setShowCastleHalls(false); onReviewCastleGame(gameId); } : null}
      />
    )}
  </>;
}
