import { memo, useEffect, useMemo, useRef, useState } from 'react';
import './HomeCastleLife.css';
import './HomeGreatHall.css';
import './HomeCastleAmbience.css';
import HomeCastleHubScene from './HomeCastleHubScene.jsx';
import { ACHIEVEMENTS, loadAchievementLedger, loadUnlocked } from '../achievements.js';
import { PROFILE_CHANGED_EVENT } from '../profileKeys.js';
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
const HOME_CASTLE_MOBILE_QUERY = '(max-width: 760px)';
const HOME_CASTLE_PRELOAD_MARGIN = '240px 0px';
const ACHIEVEMENT_STORAGE_KEYS = new Set([
  'chess-study-achievements',
  'chess-study-achievement-ledger-v2',
]);
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

function loadAchievementSnapshot() {
  const ids = [...loadUnlocked()];
  const ledger = loadAchievementLedger();
  return {
    ids,
    ledger,
    fingerprint: achievementStateFingerprint(ids, ledger),
  };
}

export function homeCastleSceneShouldStartMounted({
  compactViewport = false,
  supportsIntersectionObserver = true,
} = {}) {
  return !compactViewport || !supportsIntersectionObserver;
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

function HomeCastleLife({ achievementIds = null, achievementLedger = null, ...props }) {
  const sectionRef = useRef(null);
  // Desktop presents the castle in the first visual field and keeps the current
  // immediate mount. On the mobile first-fold contract the castle sits below
  // the primary actions, so creating a WebGL context before the user approaches
  // it is pure speculative work. Older browsers keep the safe eager behavior.
  const [castleSceneMounted, setCastleSceneMounted] = useState(() => {
    if (typeof window === 'undefined') return true;
    const compactViewport = typeof window.matchMedia === 'function'
      ? window.matchMedia(HOME_CASTLE_MOBILE_QUERY).matches
      : Number(window.innerWidth) <= 760;
    return homeCastleSceneShouldStartMounted({
      compactViewport,
      supportsIntersectionObserver: typeof window.IntersectionObserver === 'function',
    });
  });

  useEffect(() => {
    if (castleSceneMounted || typeof window === 'undefined') return undefined;
    const section = sectionRef.current;
    if (!section || typeof window.IntersectionObserver !== 'function') {
      setCastleSceneMounted(true);
      return undefined;
    }

    const observer = new window.IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry?.isIntersecting)) return;
      setCastleSceneMounted(true);
      observer.disconnect();
    }, { rootMargin: HOME_CASTLE_PRELOAD_MARGIN });
    observer.observe(section);
    return () => observer.disconnect();
  }, [castleSceneMounted]);

  // Menu rerenders for many unrelated reasons. Reading + parsing achievements in
  // the component body made every one of those renders touch profile storage.
  // Keep a coherent snapshot and refresh it only when profile/storage can
  // actually have changed; explicit caller data still wins when supplied.
  const [achievementSnapshot, setAchievementSnapshot] = useState(loadAchievementSnapshot);
  useEffect(() => {
    if (achievementIds !== null && achievementLedger !== null) return undefined;
    if (typeof window === 'undefined') return undefined;

    const refreshAchievements = () => {
      const next = loadAchievementSnapshot();
      setAchievementSnapshot((current) => (
        current.fingerprint === next.fingerprint ? current : next
      ));
    };
    const onStorage = (event) => {
      if (event?.key === null || ACHIEVEMENT_STORAGE_KEYS.has(event?.key)) refreshAchievements();
    };

    window.addEventListener(PROFILE_CHANGED_EVENT, refreshAchievements);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PROFILE_CHANGED_EVENT, refreshAchievements);
      window.removeEventListener('storage', onStorage);
    };
  }, [achievementIds, achievementLedger]);

  const resolvedAchievementIds = achievementIds ?? achievementSnapshot.ids;
  const resolvedAchievementLedger = achievementLedger ?? achievementSnapshot.ledger;
  const [persistedCastleLedger, setPersistedCastleLedger] = useState(() => loadCastleUnlockLedger());
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

  return (
    <section
      ref={sectionRef}
      className={`home-castle-life${model.rareSighting ? ' has-rare-sighting' : ''}`}
      aria-label="La estancia de Chess Studio"
      data-castle-life="real-state-v1"
      data-castle-ledger="evidence-v1"
      data-castle-scene-state={castleSceneMounted ? 'mounted' : 'deferred'}
      data-castle-ambience={model.ambience}
      data-castle-ambience-evidence={model.ambienceEvidence}
      data-castle-honours={honourObjects.length}
      data-castle-unlocks={model.unlockSummary.total}
      data-castle-unlocks-recorded={model.unlockSummary.recorded}
      data-castle-unlocks-legacy={model.unlockSummary.legacy}
    >
      {castleSceneMounted ? (
        <HomeCastleHubScene ambience={model.ambience} hasSavedGame={Boolean(props.hasSavedGame)} />
      ) : null}
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
      {model.rareSighting && (
        <span className="home-castle-life__rare" data-rare-sighting={model.rareSighting.id} aria-hidden="true">
          <span>♜</span>
        </span>
      )}
    </section>
  );
}

// Menu has several local overlays and disclosure controls that do not change
// castle inputs. Keep the expensive castle subtree asleep when those parent
// states churn; internal castle state/events still bypass memo as usual.
export default memo(HomeCastleLife);
