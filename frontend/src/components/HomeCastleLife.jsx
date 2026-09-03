import './HomeCastleLife.css';
import { ACHIEVEMENTS, loadAchievementLedger, loadUnlocked } from '../achievements.js';

const MAX_OBJECTS = 3;
const RARE_SIGHTING_THRESHOLD = 0.025;
// El castillo sólo muestra hechos ya acreditados. No reconstruimos proezas a
// partir de intuiciones ni inventamos decoración por tiempo de uso.

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

const HONOUR_RELICS = Object.freeze([
  { achievementId: 'rating_master', id: 'master-crown', label: 'Corona del Maestro', glyph: '♚', tone: 'brass', prestige: 100 },
  { achievementId: 'rivalry_hard_75', id: 'giantslayer-helm', label: 'Yelmo del Tumbagigantes', glyph: '♞', tone: 'steel', prestige: 94 },
  { achievementId: 'tournament_level_10', id: 'imperial-cup', label: 'Copa imperial', glyph: '♛', tone: 'brass', prestige: 90 },
  { achievementId: 'combat_flawless', id: 'flawless-standard', label: 'Estandarte intacto', glyph: '⚑', tone: 'ember', prestige: 88 },
  { achievementId: 'feat_pawn_queen', id: 'golden-pawn', label: 'Peón de oro', glyph: '♟', tone: 'brass', prestige: 86 },
  { achievementId: 'rating_advanced', id: 'officer-blade', label: 'Espada de oficial', glyph: '⚔︎', tone: 'steel', prestige: 84 },
  { achievementId: 'combat_gold_piece', id: 'veteran-reliquary', label: 'Relicario del veterano', glyph: '♜', tone: 'ember', prestige: 80 },
  { achievementId: 'feat_skewer', id: 'royal-halberd', label: 'Alabarda real', glyph: '†', tone: 'steel', prestige: 78 },
  { achievementId: 'rivalry_streak_3', id: 'three-in-row-plaque', label: 'Placa de tres al hilo', glyph: 'III', tone: 'steel', prestige: 74 },
  { achievementId: 'feat_mate', id: 'fallen-king', label: 'Rey derribado', glyph: '♚', tone: 'brass', prestige: 72 },
  { achievementId: 'feat_promotion', id: 'promotion-crown', label: 'Corona de ascenso', glyph: '♕', tone: 'brass', prestige: 68 },
  { achievementId: 'tournament_level_5', id: 'officer-cup', label: 'Copa de oficial', glyph: '♛', tone: 'brass', prestige: 64 },
  { achievementId: 'daily_clean_full_3', id: 'clean-seal', label: 'Sello impecable', glyph: '✦', tone: 'parchment', prestige: 60 },
  { achievementId: 'puzzles_50', id: 'tactics-volume', label: 'Tratado de táctica', glyph: '▤', tone: 'parchment', prestige: 58 },
  { achievementId: 'rating_intermediate', id: 'academy-blade', label: 'Hoja de academia', glyph: '⚔︎', tone: 'steel', prestige: 56 },
]);

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function achievementIdSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

function honourObjects(achievementIds, achievementLedger) {
  const unlocked = achievementIdSet(achievementIds);
  return HONOUR_RELICS
    .filter((relic) => unlocked.has(relic.achievementId))
    .map((relic) => {
      const achievement = ACHIEVEMENT_BY_ID.get(relic.achievementId);
      const record = achievementLedger?.records?.[relic.achievementId] || null;
      return {
        ...relic,
        detail: achievement?.description || 'Mérito acreditado en tu historial.',
        kind: 'honour',
        evidence: record?.legacy ? 'legacy' : record ? 'recorded' : 'unlock',
      };
    })
    .sort((a, b) => b.prestige - a.prestige || a.id.localeCompare(b.id));
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

  const honours = honourObjects(achievementIds, achievementLedger);
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
  };
}

export default function HomeCastleLife({ achievementIds = null, achievementLedger = null, ...props }) {
  const resolvedAchievementIds = achievementIds ?? [...loadUnlocked()];
  const resolvedAchievementLedger = achievementLedger ?? loadAchievementLedger();
  const model = buildHomeCastleLifeModel({
    ...props,
    achievementIds: resolvedAchievementIds,
    achievementLedger: resolvedAchievementLedger,
  });
  // Estado transitorio (partida pausada) y vacío no son "trofeos". Ya tienen
  // UI funcional propia; repetirlos aquí convertiría el castillo en dashboard.
  const visibleObjects = model.objects.filter((object) => object.kind === 'progress' || object.kind === 'honour');

  return (
    <section
      className={`home-castle-life${model.rareSighting ? ' has-rare-sighting' : ''}`}
      aria-label="La estancia de Chess Studio"
      data-castle-life="real-state-v1"
      data-castle-honours={visibleObjects.filter((object) => object.kind === 'honour').length}
    >
      <div className="home-castle-life__decor" aria-label="Objetos desbloqueados del castillo">
        {visibleObjects.map((object, index) => (
          <span
            className={`home-castle-object tone-${object.tone} kind-${object.kind} castle-slot-${index}`}
            data-castle-object={object.id}
            data-castle-kind={object.kind}
            data-castle-prestige={object.prestige}
            data-castle-evidence={object.evidence || 'state'}
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
