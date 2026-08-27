import { historyMoverColor } from './historyTimeline.js';

// careerVisuals.js — visualizaciones derivadas exclusivamente de datos ya
// registrados en el historial/autopsias. No inventa evaluaciones ausentes.

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['1','2','3','4','5','6','7','8'];
const BOARD_SQUARES = RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}`));

function humanMover(record, index) {
  const mover = historyMoverColor(index, record?.initialFen);
  return mover === (record?.humanColor === 'b' ? 'b' : 'w');
}

function emptyCounts() {
  return Object.fromEntries(BOARD_SQUARES.map((sq) => [sq, 0]));
}

export function buildCareerHeatmaps(history = []) {
  const activity = emptyCounts();
  const losses = emptyCounts();
  const captures = emptyCounts();
  let humanMoves = 0;
  let humanLosses = 0;
  let humanCaptures = 0;

  for (const record of Array.isArray(history) ? history : []) {
    const moves = Array.isArray(record?.moves) ? record.moves : [];
    moves.forEach((move, index) => {
      const to = String(move?.to || '').toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(activity, to)) return;
      if (humanMover(record, index)) {
        activity[to] += 1;
        humanMoves += 1;
        if (move?.captured || move?.capturedPiece) {
          captures[to] += 1;
          humanCaptures += 1;
        }
      } else if (move?.captured || move?.capturedPiece) {
        // Una captura del rival ocurre en la casilla donde estaba la pieza
        // humana capturada: ese destino es una baja real del jugador.
        losses[to] += 1;
        humanLosses += 1;
      }
    });
  }

  return {
    activity,
    losses,
    captures,
    totals: { humanMoves, humanLosses, humanCaptures },
    maxima: {
      activity: Math.max(0, ...Object.values(activity)),
      losses: Math.max(0, ...Object.values(losses)),
      captures: Math.max(0, ...Object.values(captures)),
    },
  };
}

function analyzedRows(archive = {}) {
  return Object.values(archive || {}).filter(Boolean);
}

function avg(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.round(valid.reduce((sum, n) => sum + n, 0) / valid.length) : null;
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

function castleRate(history = []) {
  let games = 0;
  let castled = 0;
  for (const record of history || []) {
    const moves = record?.moves || [];
    if (!moves.length) continue;
    games += 1;
    const didCastle = moves.some((move, index) => humanMover(record, index) && /^O-O/.test(String(move?.san || '')));
    if (didCastle) castled += 1;
  }
  return pct(castled, games);
}

function conversionRates(archive = {}) {
  const rows = analyzedRows(archive);
  const winning = rows.filter((row) => Number(row?.peakPerspectiveEval) >= 300 && row?.outcome);
  const converted = winning.filter((row) => row.outcome === 'win').length;
  const defending = rows.filter((row) => Number(row?.troughPerspectiveEval) <= -300 && row?.outcome);
  const saved = defending.filter((row) => ['win','draw'].includes(row.outcome)).length;
  return {
    conversion: pct(converted, winning.length),
    resilience: pct(saved, defending.length),
    winningSamples: winning.length,
    defensiveSamples: defending.length,
  };
}

export function deriveRpgProfile(history = [], archive = {}, career = {}) {
  const rows = analyzedRows(archive);
  const accuracy = avg(rows.map((row) => Number(row?.accuracy)));
  const conversion = conversionRates(archive);
  const pressureMoves = Number(career?.pressure?.moves || 0);
  const pressureIncidents = Number(career?.pressure?.incidents || 0);
  const pressureIncidentRate = pct(pressureIncidents, pressureMoves);
  const discipline = pressureIncidentRate === null ? null : Math.max(0, 100 - pressureIncidentRate);
  const kingSafety = castleRate(history);

  const attributes = [
    { id: 'precision', label: 'Precisión', value: accuracy, sample: rows.filter((r) => Number.isFinite(Number(r?.accuracy))).length, explanation: 'Accuracy media de autopsias archivadas.' },
    { id: 'conversion', label: 'Conversión', value: conversion.conversion, sample: conversion.winningSamples, explanation: 'Ventajas de +3.0 o más que terminaste convirtiendo en victoria.' },
    { id: 'resilience', label: 'Resistencia', value: conversion.resilience, sample: conversion.defensiveSamples, explanation: 'Posiciones de −3.0 o peor que lograste salvar con victoria o tablas.' },
    { id: 'discipline', label: 'Pulso', value: discipline, sample: pressureMoves, explanation: '100 menos tu porcentaje de incidentes graves medidos bajo presión de reloj.' },
    { id: 'kingSafety', label: 'Refugio del rey', value: kingSafety, sample: (history || []).filter((r) => (r?.moves || []).length).length, explanation: 'Porcentaje de partidas registradas en las que llegaste a enrocar.' },
  ];

  const measurable = attributes.filter((a) => Number.isFinite(a.value) && a.sample > 0);
  const leader = [...measurable].sort((a,b) => b.value - a.value)[0] || null;
  const games = (history || []).length;
  let title = 'Recluta estadístico';
  if (games >= 5 && leader) {
    title = {
      precision: 'Cirujano del tablero',
      conversion: 'Verdugo de ventajas',
      resilience: 'Superviviente profesional',
      discipline: 'Pulso de hielo',
      kingSafety: 'Arquitecto de refugios',
    }[leader.id] || 'Veterano medible';
  }

  return { title, games, attributes, leaderId: leader?.id || null };
}

export function summarizeRpgProfile(profile = {}) {
  const measured = (Array.isArray(profile?.attributes) ? profile.attributes : []).filter((attribute) => Number.isFinite(attribute?.value) && Number(attribute?.sample) > 0);
  const leader = measured.find((attribute) => attribute.id === profile?.leaderId) || [...measured].sort((a, b) => b.value - a.value)[0] || null;
  const lowest = measured.length > 1 ? [...measured].filter((attribute) => attribute.id !== leader?.id).sort((a, b) => a.value - b.value)[0] || null : null;
  return {
    title: profile?.title || 'Recluta estadístico',
    games: Math.max(0, Number(profile?.games) || 0),
    measuredCount: measured.length,
    leader,
    lowest,
  };
}

export function lastDailyCells(solvedDates = [], days = 28, now = new Date()) {
  const solved = new Set(Array.isArray(solvedDates) ? solvedDates : []);
  const out = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    out.push({ key, solved: solved.has(key), today: offset === 0, day: d.getDate(), weekday: d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '') });
  }
  return out;
}
