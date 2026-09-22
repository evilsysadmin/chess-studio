import baseAvatar from './assets/matthias-scenes/base.webp';
import morningCoffee from './assets/matthias-scenes/morning-coffee.webp';
import lunchBocata from './assets/matthias-scenes/lunch-bocata.webp';
import afternoonOps from './assets/matthias-scenes/afternoon-ops.webp';
import nightCoffee from './assets/matthias-scenes/night-coffee.webp';
import lateSleep from './assets/matthias-scenes/late-sleep.webp';
import dossier from './assets/matthias-scenes/dossier.webp';
import strategyBook from './assets/matthias-scenes/strategy-book.webp';
import moodAnnoyed from './assets/matthias-scenes/mood-annoyed.webp';
import { matthiasTimeScene } from './matthiasTime.js';

// Las claves horarias son estables aunque una ilustración concreta cambie.
// Hasta reintroducir los artes dañados con un canal binario verificado,
// reutilizamos escenas válidas para que Matthias nunca desaparezca de Home.
const TIME_ASSETS = Object.freeze({
  'morning-coffee': morningCoffee,
  'lunch-bocata': lunchBocata,
  // campaign-dinner.webp contiene corrupción raster visible en la mitad inferior.
  // Conservamos la escena/label de cena, pero usamos temporalmente el render
  // limpio de comida hasta que exista un asset de cena verificado.
  'lunch-campaign-dinner': lunchBocata,
  'afternoon-ops': afternoonOps,
  'night-coffee': nightCoffee,
  'late-sleep': lateSleep,
  'breakfast-news': morningCoffee,
  'chess-inception': afternoonOps,
  dossier,
  'beer-break': nightCoffee,
  'strategy-book': strategyBook,
  'chess-weekly': strategyBook,
});

// Canon visual: Matthias puede estar satisfecho, impresionado o escéptico en
// lógica/texto, pero su cara nunca se vuelve alegre. Sigue siendo el peón
// militar ceñudo de los artes originales; annoyed sólo intensifica el gesto.
const MOOD_ASSETS = Object.freeze({
  observant: baseAvatar,
  satisfied: baseAvatar,
  pleased: baseAvatar,
  skeptical: baseAvatar,
  annoyed: moodAnnoyed,
  impressed: baseAvatar,
});

const AMBIENT_SCENES = Object.freeze({
  base: { key: 'base', avatar: baseAvatar, label: 'Vigilando el desastre' },
  coffee: { key: 'coffee', avatar: morningCoffee, label: 'Café de campaña' },
  lunch: { key: 'lunch', avatar: lunchBocata, label: 'Repostando' },
  ops: { key: 'ops', avatar: afternoonOps, label: 'Tomando notas' },
  night: { key: 'night', avatar: nightCoffee, label: 'Café nocturno' },
  sleep: { key: 'sleep', avatar: lateSleep, label: 'Cabeceando con disciplina' },
  dossier: { key: 'dossier', avatar: dossier, label: 'Revisando el expediente' },
  reading: { key: 'reading', avatar: strategyBook, label: 'Leyendo estrategia' },
});

const HOME_ZONE_PATTERNS = Object.freeze([
  ['rest', /sleep/],
  ['library', /reading|strategy-book|chess-weekly/],
  ['desk', /dossier|ops|chess-inception/],
  ['table', /coffee|breakfast|lunch|dinner|beer/],
]);

function localDaySignature(now = new Date()) {
  const year = Number(now?.getFullYear?.());
  const month = Number(now?.getMonth?.());
  const day = Number(now?.getDate?.());
  if (![year, month, day].every(Number.isFinite)) return null;
  return (year * 372) + ((month + 1) * 31) + day;
}

function rotateScenes(scenes, offset) {
  if (!Array.isArray(scenes) || scenes.length < 2) return scenes;
  const shift = ((Number(offset) || 0) % scenes.length + scenes.length) % scenes.length;
  if (!shift) return scenes;
  return [...scenes.slice(shift), ...scenes.slice(0, shift)];
}

export const MATTHIAS_BASE_AVATAR = baseAvatar;

export function matthiasTimeVisual(hour = new Date().getHours()) {
  const scene = matthiasTimeScene(hour);
  return {
    ...scene,
    avatar: TIME_ASSETS[scene.key] || baseAvatar,
  };
}

export function matthiasAmbientVisual(key = 'base') {
  return AMBIENT_SCENES[key] || AMBIENT_SCENES.base;
}

export function matthiasAmbientVisuals(hour = new Date().getHours(), now = new Date()) {
  const h = Number.isFinite(Number(hour)) ? Number(hour) : 12;
  const timed = matthiasTimeVisual(h);
  const first = {
    key: `time-${timed.key}`,
    avatar: timed.avatar,
    label: timed.label || timed.fallbackStatus || 'En observación',
  };

  // Overnight is not an ambient carousel. From midnight until reveille Matthias
  // is canonically asleep and stays asleep; Home must not wake him to read,
  // audit dossiers or drink coffee like a sleepwalker.
  if (h >= 0 && h < 6) return [first];

  let extras;
  if (h >= 5 && h < 11) extras = [AMBIENT_SCENES.coffee, AMBIENT_SCENES.reading, AMBIENT_SCENES.dossier];
  else if (h >= 11 && h < 15) extras = [AMBIENT_SCENES.lunch, AMBIENT_SCENES.dossier, AMBIENT_SCENES.reading];
  else if (h >= 15 && h < 20) extras = [AMBIENT_SCENES.ops, AMBIENT_SCENES.dossier, AMBIENT_SCENES.reading];
  else if (h >= 20 || h < 1) extras = [AMBIENT_SCENES.night, AMBIENT_SCENES.reading, AMBIENT_SCENES.dossier];
  else extras = [AMBIENT_SCENES.sleep, AMBIENT_SCENES.reading, AMBIENT_SCENES.base];

  // Deduplicamos antes de variar el día. De lo contrario, una rotación cuyo
  // primer extra comparte avatar con la escena horaria puede desaparecer después
  // del giro y dejar exactamente el mismo orden visible que el día anterior.
  const seen = new Set(first.avatar ? [first.avatar] : []);
  const visibleExtras = extras.filter((scene) => {
    if (!scene?.avatar || seen.has(scene.avatar)) return false;
    seen.add(scene.avatar);
    return true;
  });

  // La escena horaria exacta siempre manda. Sólo variamos el reparto que el
  // jugador realmente verá: mismo día + F5 => misma rutina; al cambiar de día
  // cambia el orden si existen al menos dos escenas secundarias visibles.
  const daySignature = localDaySignature(now);
  const orderedExtras = daySignature === null
    ? visibleExtras
    : rotateScenes(visibleExtras, daySignature);

  return [first, ...orderedExtras];
}

// Una rutina viva no cambia de escena como un carrusel cada N segundos exactos.
// Los tiempos siguen siendo deterministas (sin RNG ni estado extra), pero cada
// actividad permanece en pantalla lo suficiente para que parezca una acción y
// no una diapositiva. Las siestas duran más; café/comida son más breves.
export function matthiasRoutineDwellMs(scene = 'base') {
  const key = String(typeof scene === 'string' ? scene : scene?.key || 'base').toLowerCase();
  if (/sleep/.test(key)) return 64_000;
  if (/reading|strategy-book|chess-weekly/.test(key)) return 48_000;
  if (/dossier/.test(key)) return 44_000;
  if (/ops|inception/.test(key)) return 42_000;
  if (/coffee|breakfast|lunch|dinner|beer|night/.test(key)) return 38_000;
  return 34_000;
}

export function matthiasHomeZone(sceneKey = 'base') {
  const key = String(sceneKey || 'base').toLowerCase();
  return HOME_ZONE_PATTERNS.find(([, pattern]) => pattern.test(key))?.[0] || 'watch';
}

export function matthiasMoodAvatar(mood = 'observant') {
  return MOOD_ASSETS[mood] || baseAvatar;
}

 = {}) {
  if (context === 'home' || context === 'briefing') return matthiasTimeVisual(hour).avatar;
  if (context === 'mood') return matthiasMoodAvatar(mood);
  return baseAvatar;
}
