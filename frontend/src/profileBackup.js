// profileBackup.js — Exporta/importa TODO tu progreso persistente, y lo
// sincroniza con el backend (un único perfil en Mongo, sin cuentas — eres
// el único usuario, así que no hace falta login). Todo esto vivía SOLO en
// localStorage del navegador: si lo limpiabas, cambiabas de dispositivo, o
// pisabas la carpeta del proyecto con un zip nuevo, se perdía sin aviso.
//
// A propósito NO incluye los punteros de "partida activa" (el id de la
// partida guardada en el backend, o si estás en "Partida de práctica"): esos
// apuntan a un estado del servidor que puede no existir más al importar en
// otro navegador/dispositivo.

import { api } from './api.js';

const EXPORTABLE_KEYS = [
  'chess-study-tournament',
  'chess-study-game-history',
  'chess-study-combat-history',
  'chess-study-combat-roster',
  'chess-study-player-rating',
  'chess-study-rating-history',
  'chess-study-achievements',
  'chess-study-puzzles-solved',
  'chess-study-puzzle-streak',
  'chess-study-puzzle-best-streak',
  'chess-study-muted',
  'chess-study-worst-move-cache',
  'chess-study-selected-title',
  'chess-study-selected-skin',
  'chess-study-roguelike-run',
  'chess-study-roguelike-best-floor',
];

export function exportProfile() {
  const data = {};
  for (const key of EXPORTABLE_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return {
    app: 'estudio-de-ajedrez',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function downloadProfile() {
  const profile = exportProfile();
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estudio-ajedrez-perfil-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Sobreescribe el progreso actual con lo que venga en el archivo/objeto.
// Acepta tanto un string JSON (como el que produce `downloadProfile`) como
// un objeto ya parseado (como el que devuelve el backend). Devuelve cuántas
// claves se restauraron. Tira un error con mensaje legible si no tiene la
// forma esperada — quien llama lo puede mostrar tal cual.
export function importProfile(rawTextOrObject) {
  let parsed;
  if (typeof rawTextOrObject === 'string') {
    try {
      parsed = JSON.parse(rawTextOrObject);
    } catch (e) {
      throw new Error('El archivo no es un JSON válido.');
    }
  } else {
    parsed = rawTextOrObject;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.data !== 'object') {
    throw new Error('El archivo no tiene el formato esperado de un backup de esta app.');
  }

  let restored = 0;
  for (const key of EXPORTABLE_KEYS) {
    if (typeof parsed.data[key] === 'string') {
      localStorage.setItem(key, parsed.data[key]);
      restored += 1;
    }
  }
  return restored;
}

// Baja el perfil guardado en el backend (Mongo) y pisa el localStorage
// local — se llama una sola vez, al arrancar la app, ANTES de que se lea
// cualquier otro estado de localStorage. Si no hay backend disponible, o
// todavía no se guardó nada ahí, no rompe nada: seguimos con lo que haya
// localmente. Devuelve true si de verdad restauró algo.
export async function pullProfileFromServer() {
  try {
    const remote = await api.getProfile();
    if (remote && remote.data && Object.keys(remote.data).length > 0) {
      importProfile(remote);
      return true;
    }
  } catch (e) {
    // sin backend disponible -> seguimos con lo que haya en localStorage
  }
  return false;
}

// Sube el progreso actual al backend. Se llama de fondo en momentos clave
// (cambios de pantalla) — si falla, no es grave, se reintenta en el
// próximo evento; no bloquea ni avisa nada al usuario.
export async function pushProfileToServer() {
  try {
    await api.saveProfile(exportProfile());
  } catch (e) {
    // sin backend disponible -> el progreso sigue local, se reintenta después
  }
}
