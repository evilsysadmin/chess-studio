import { identifyOpening } from './openings.js';

const OUTCOME = { win: 'Victoria', loss: 'Derrota', draw: 'Tablas' };

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function sans(record) {
  return (record?.moves || []).map((m) => typeof m === 'string' ? m : m?.san).filter(Boolean);
}

export function normalizeShareRecord(record, extras = {}) {
  const moves = sans(record);
  return {
    v: 2,
    outcome: record?.outcome || 'draw',
    difficulty: Number(record?.difficulty || 0),
    humanColor: record?.humanColor === 'b' ? 'b' : 'w',
    date: record?.date || new Date().toISOString(),
    mode: record?.mode || 'casual',
    moves,
    opening: record?.opening || identifyOpening(moves) || null,
    timeControl: record?.timeControl || extras.timeControl || null,
    series: record?.series || extras.series || null,
    incident: record?.incident || extras.incident || null,
  };
}

export function encodeShareRecord(record, extras = {}) {
  return base64UrlEncode(JSON.stringify(normalizeShareRecord(record, extras)));
}

export function decodeShareRecord(encoded) {
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded));
    if (![1,2].includes(parsed?.v) || !Array.isArray(parsed.moves)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function shareRecordFromHash(hash = window.location.hash) {
  const match = String(hash || '').match(/^#share=([A-Za-z0-9_-]+)$/);
  return match ? decodeShareRecord(match[1]) : null;
}

export function buildShareUrl(record, extras = {}) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#share=${encodeShareRecord(record, extras)}`;
}

export function buildShareText(record, extras = {}) {
  const data = normalizeShareRecord(record, extras);
  const result = OUTCOME[data.outcome] || data.outcome;
  const color = data.humanColor === 'w' ? 'blancas' : 'negras';
  const lines = [
    `♟ ${result} contra la CPU · nivel ${data.difficulty}`,
    `${data.moves.length} jugadas · jugué con ${color}`,
  ];
  if (data.opening) lines.push(`Apertura: ${data.opening}`);
  if (data.timeControl?.label) lines.push(`Ritmo: ${data.timeControl.label}`);
  if (data.series) lines.push(`Serie: Tú ${data.series.humanWins} · CPU ${data.series.cpuWins}${data.series.draws ? ` · tablas ${data.series.draws}` : ''}`);
  if (data.incident) lines.push(`☠ Cámara del crimen · jugada ${data.incident.moveNumber}: ${data.incident.played} en vez de ${data.incident.suggested} · −${data.incident.loss} cp`);
  lines.push(data.incident ? 'Aquí fue donde todo se fue administrativamente al demonio.' : data.outcome === 'win'
    ? 'Se aceptan felicitaciones y teorías sobre la humillación de la máquina.'
    : data.outcome === 'loss'
      ? 'Adjunto documentación del siniestro para fines educativos y/o funerarios.'
      : 'Nadie ganó. Nadie aprendió humildad. Seguimos.');
  return lines.join('\n');
}
