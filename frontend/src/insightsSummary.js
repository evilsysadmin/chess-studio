import { historyMoverColor } from './historyTimeline.js';
import { isStatisticalHistoryRecord } from './gameHistory.js';
// insightsSummary.js — Estadísticas agregadas ("así juegas"), calculadas al
// instante a partir de lo que ya está guardado (historial de partidas, de
// combate, evolución de rating) — SIN volver a analizar cada partida
// contra el motor. Eso es a propósito: re-analizar aunque sea las últimas
// 10 partidas significaría decenas de llamadas al backend, con esta
// pantalla tardando varios segundos en abrir en vez de sentirse instantánea.
// Por la misma razón, esto NO incluye "tu error más repetido" — esa sí
// necesitaría el análisis jugada por jugada. Queda como posible mejora
// futura, no como omisión silenciosa.

import { identifyOpening } from './openings.js';

function winStats(games) {
  if (games.length === 0) return null;
  const wins = games.filter((g) => g.outcome === 'win').length;
  const draws = games.filter((g) => g.outcome === 'draw').length;
  const losses = games.length - wins - draws;
  return { wins, draws, losses, total: games.length, winPct: Math.round((wins / games.length) * 100) };
}

function favoriteOpening(games) {
  const counts = {};
  for (const g of games) {
    const sans = (g.moves || g.log || []).map((m) => m.san);
    const opening = identifyOpening(sans);
    if (opening) counts[opening] = (counts[opening] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? { name: entries[0][0], count: entries[0][1] } : null;
}

function openingDossier(games) {
  const stats = {};
  for (const g of games) {
    const sans = (g.moves || []).map((m) => m.san);
    const opening = identifyOpening(sans);
    if (!opening) continue;
    if (!stats[opening]) stats[opening] = { name: opening, games: 0, wins: 0, draws: 0, losses: 0, white: 0, black: 0 };
    const row = stats[opening];
    row.games += 1;
    if (g.outcome === 'win') row.wins += 1;
    else if (g.outcome === 'draw') row.draws += 1;
    else row.losses += 1;
    if (g.humanColor === 'w') row.white += 1;
    else if (g.humanColor === 'b') row.black += 1;
  }
  return Object.values(stats)
    .map((row) => ({ ...row, winPct: Math.round((row.wins / row.games) * 100) }))
    .sort((a, b) => b.games - a.games || b.winPct - a.winPct)
    .slice(0, 8);
}

function colorPreference(games) {
  const white = games.filter((g) => g.humanColor === 'w').length;
  const black = games.filter((g) => g.humanColor === 'b').length;
  return { white, black };
}

// Racha de victorias más larga, en orden cronológico real (mezclando todos
// los modos por fecha) — una racha "de verdad" cruza modos, no se corta
// porque una victoria fue en Torneo y la siguiente en Combate.
function longestWinStreak(games) {
  const sorted = [...games].sort((a, b) => new Date(a.date) - new Date(b.date));
  let longest = 0;
  let current = 0;
  for (const g of sorted) {
    if (g.outcome === 'win') {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function ratingTrend(history) {
  if (!history || history.length === 0) return null;
  const ratings = history.map((p) => p.rating);
  const first = ratings[0];
  const last = ratings[ratings.length - 1];
  return {
    min: Math.min(...ratings),
    max: Math.max(...ratings),
    first,
    last,
    delta: last - first,
  };
}

// Capturas hechas por el humano — no cuenta las de la CPU. Para las
// partidas normales/torneo/práctica hay que derivar de qué color fue cada
// jugada por la paridad del índice (no viene guardado explícito); en
// Combate el registro ya trae `by` directo.
function humanCaptures(gameHistory, combatHistory) {
  let count = 0;
  for (const g of gameHistory) {
    (g.moves || []).forEach((m, i) => {
      const mover = historyMoverColor(i, g.initialFen);
      if (mover === g.humanColor && m.captured) count += 1;
    });
  }
  for (const g of combatHistory) {
    (g.log || []).forEach((m) => {
      if (m.by === 'human' && m.captured) count += 1;
    });
  }
  return count;
}

export function computeInsights(gameHistory, combatHistory, ratingHistory) {
  const taggedGameHistory = gameHistory.filter(isStatisticalHistoryRecord).filter((g) => !['lab', 'rescue'].includes(g.mode)).map((g) => ({ ...g, category: g.mode || 'tournament' }));
  const taggedCombatHistory = combatHistory.map((g) => ({ ...g, category: 'combat' }));
  const allGames = [...taggedGameHistory, ...taggedCombatHistory];

  const byMode = {};
  for (const category of ['tournament', 'practice', 'casual', 'combat']) {
    const games = allGames.filter((g) => g.category === category);
    if (games.length > 0) byMode[category] = winStats(games);
  }

  return {
    totalGames: allGames.length,
    overall: winStats(allGames),
    byMode,
    favoriteOpening: favoriteOpening(allGames),
    openingDossier: openingDossier(taggedGameHistory),
    colorPreference: colorPreference(allGames),
    longestWinStreak: longestWinStreak(allGames),
    ratingTrend: ratingTrend(ratingHistory),
    humanCaptures: humanCaptures(gameHistory.filter(isStatisticalHistoryRecord), combatHistory),
  };
}

