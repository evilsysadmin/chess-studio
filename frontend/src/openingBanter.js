import { startMemoryComment } from './cpuMemory.js';
import { requestRemoteNarrative } from './narrativeRemote.js';

const OPENING_EVENT = 'GAME_OPENING_BANTER';
const MAX_OPENING_CHARS = 260;
const RECENT_RESULT_TTL_MS = 30_000;
const MAX_RECENT_RESULTS = 16;
const pendingByGame = new Map();
const recentByGame = new Map();

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanString(value, max = 96) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function compactOutcomeRow(row = {}) {
  return {
    games: Math.max(0, finiteNumber(row.games)),
    wins: Math.max(0, finiteNumber(row.wins)),
    draws: Math.max(0, finiteNumber(row.draws)),
    losses: Math.max(0, finiteNumber(row.losses)),
  };
}

function openingMode(context = {}) {
  if (context.rescue) return 'rescue';
  if (context.lab) return 'lab';
  if (context.runMode === 'cup') return 'cup';
  if (context.runMode === 'boss') return 'boss';
  if (context.runMode === 'streak') return 'streak';
  if (context.suddenDeath) return 'sudden_death';
  if (context.nemesis) return 'nemesis_training';
  if (context.ghost) return 'ghost';
  if (context.series) return 'series';
  return 'standard';
}

export function isFreshOpeningConversation(context = {}) {
  const resumedGameId = typeof context.resumed === 'string' ? context.resumed : null;
  const seriesGameId = context.series?.currentGameId || null;
  return !(context.resumed && (!seriesGameId || !resumedGameId || seriesGameId === resumedGameId));
}

export function buildOpeningBanterFacts(rivalry, context = {}) {
  const record = rivalry?.record && typeof rivalry.record === 'object' ? rivalry.record : {};
  const recent = Array.isArray(record.recentGames) ? record.recentGames : [];
  const difficulty = Number(context.difficulty);
  const humanColor = context.humanColor === 'b' ? 'black' : 'white';
  const facts = {
    game: {
      difficulty: Number.isFinite(difficulty) ? difficulty : null,
      human_color: humanColor,
      mode: openingMode(context),
      rematch: Boolean(context.rematch),
    },
  };

  const games = Math.max(0, finiteNumber(record.games));
  if (games > 0) {
    facts.rivalry = {
      games,
      wins: Math.max(0, finiteNumber(record.wins)),
      draws: Math.max(0, finiteNumber(record.draws)),
      losses: Math.max(0, finiteNumber(record.losses)),
      current_streak: finiteNumber(record.currentStreak),
    };
  }

  const last = recent[0];
  if (last) {
    facts.last_game = {
      outcome: cleanString(last.outcome, 16),
      difficulty: Number.isFinite(Number(last.difficulty)) ? Number(last.difficulty) : null,
      opening: cleanString(last.opening, 96),
      half_moves: Math.max(0, finiteNumber(last.moves)),
    };
  }

  const repeatedIncidents = Object.entries(record.incidents && typeof record.incidents === 'object' ? record.incidents : {})
    .map(([key, count]) => ({ key: cleanString(key, 60), count: Math.max(0, finiteNumber(count)) }))
    .filter((row) => row.key?.startsWith('human:') && row.count >= 2)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 3);
  if (repeatedIncidents.length) facts.repeated_incidents = repeatedIncidents;

  const openingRows = Object.entries(record.byOpening && typeof record.byOpening === 'object' ? record.byOpening : {})
    .map(([name, row]) => ({ name: cleanString(name, 96), ...compactOutcomeRow(row) }))
    .filter((row) => row.name && row.games >= 3)
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, 2);
  if (openingRows.length) facts.opening_history = openingRows;

  if (Number.isFinite(difficulty)) {
    const sameDifficulty = recent.filter((game) => Number(game?.difficulty) === difficulty);
    if (sameDifficulty.length >= 3) {
      facts.current_difficulty_recent = {
        level: difficulty,
        games: sameDifficulty.length,
        wins: sameDifficulty.filter((game) => game?.outcome === 'win').length,
        draws: sameDifficulty.filter((game) => game?.outcome === 'draw').length,
        losses: sameDifficulty.filter((game) => game?.outcome === 'loss').length,
      };
    }
  }

  const seriesGames = Array.isArray(context.series?.games) ? context.series.games : [];
  if (context.series && !context.series.winner) {
    facts.series = {
      best_of: Number.isFinite(Number(context.series.bestOf)) ? Number(context.series.bestOf) : null,
      games_played: seriesGames.length,
      human_wins: seriesGames.filter((entry) => entry?.outcome === 'win').length,
      draws: seriesGames.filter((entry) => entry?.outcome === 'draw').length,
      cpu_wins: seriesGames.filter((entry) => entry?.outcome === 'loss').length,
    };
  }

  return facts;
}

export function localOpeningBanter(rivalry, context = {}) {
  if (!isFreshOpeningConversation(context)) return null;
  const contextual = startMemoryComment(rivalry, context);
  if (contextual) return contextual;

  const difficulty = Number(context.difficulty);
  if (context.humanColor === 'w') {
    return Number.isFinite(difficulty)
      ? `Llevas blancas contra mi nivel ${difficulty}. Incluso te he concedido la primera excusa; aprovéchala.`
      : 'Llevas blancas. Empiezas tú, así que la primera decisión cuestionable también te pertenece.';
  }
  return Number.isFinite(difficulty)
    ? `Nivel ${difficulty} y yo con blancas. Qué detalle tan considerado dejarme empezar el interrogatorio.`
    : 'Yo llevo blancas. Qué detalle tan considerado dejarme empezar el interrogatorio.';
}

export function normalizeOpeningBanter(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const sentences = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [clean];
  const compact = sentences.slice(0, 2).map((sentence) => sentence.trim()).join(' ').trim();
  if (compact.length <= MAX_OPENING_CHARS) return compact;

  const head = compact.slice(0, MAX_OPENING_CHARS + 1);
  let sentenceEnd = -1;
  for (let index = Math.floor(MAX_OPENING_CHARS * 0.55); index < MAX_OPENING_CHARS; index += 1) {
    if ('.!?…'.includes(head[index])) sentenceEnd = index;
  }
  if (sentenceEnd > 0) return head.slice(0, sentenceEnd + 1).trim();
  const wordEnd = head.slice(0, MAX_OPENING_CHARS - 1).lastIndexOf(' ');
  return `${head.slice(0, wordEnd > 0 ? wordEnd : MAX_OPENING_CHARS - 1).trim()}…`;
}

function rememberRecent(key, text) {
  recentByGame.delete(key);
  recentByGame.set(key, { text, at: Date.now() });
  while (recentByGame.size > MAX_RECENT_RESULTS) {
    const oldest = recentByGame.keys().next().value;
    recentByGame.delete(oldest);
  }
}

function recentResult(key) {
  const cached = recentByGame.get(key);
  if (!cached) return undefined;
  if (Date.now() - cached.at > RECENT_RESULT_TTL_MS) {
    recentByGame.delete(key);
    return undefined;
  }
  return cached.text;
}

export function requestOpeningBanter({
  gameId,
  rivalry,
  context = {},
  token,
  request = requestRemoteNarrative,
} = {}) {
  if (!gameId || !isFreshOpeningConversation(context)) return Promise.resolve(null);
  const key = String(gameId);
  const cached = recentResult(key);
  if (cached !== undefined) return Promise.resolve(cached);
  if (pendingByGame.has(key)) return pendingByGame.get(key);

  const fallback = localOpeningBanter(rivalry, context);
  const dossier = {
    eventType: 'game_opening_banter',
    requestKind: 'default',
    facts: buildOpeningBanterFacts(rivalry, context),
  };
  const pending = Promise.resolve()
    .then(() => request(dossier, { token, timeoutMs: 4500 }))
    .then((text) => normalizeOpeningBanter(text) || fallback)
    .catch(() => fallback)
    .then((text) => {
      rememberRecent(key, text);
      return text;
    })
    .finally(() => pendingByGame.delete(key));

  pendingByGame.set(key, pending);
  return pending;
}

export function hasOpeningBanterMessage(messages) {
  return Array.isArray(messages) && messages.some((message) => message?.event === OPENING_EVENT);
}

export { OPENING_EVENT };
