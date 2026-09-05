import baseAvatar from './assets/matthias-scenes/base.webp';
import morningCoffee from './assets/matthias-scenes/morning-coffee.webp';
import lunchBocata from './assets/matthias-scenes/lunch-bocata.webp';
import campaignDinner from './assets/matthias-scenes/campaign-dinner.webp';
import afternoonOps from './assets/matthias-scenes/afternoon-ops.webp';
import nightCoffee from './assets/matthias-scenes/night-coffee.webp';
import lateSleep from './assets/matthias-scenes/late-sleep.webp';
import dossier from './assets/matthias-scenes/dossier.webp';
import strategyBook from './assets/matthias-scenes/strategy-book.webp';
import moodAnnoyed from './assets/matthias-scenes/mood-annoyed.webp';
import { matthiasTimeScene } from './matthiasTime.js';

// Las claves horarias son estables aunque una ilustración concreta cambie.
// Hasta reintroducir los cuatro artes dañados con un canal binario verificado,
// reutilizamos escenas válidas para que Matthias nunca desaparezca de Home.
const TIME_ASSETS = Object.freeze({
  'morning-coffee': morningCoffee,
  'lunch-bocata': lunchBocata,
  'lunch-campaign-dinner': campaignDinner,
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

export const MATTHIAS_BASE_AVATAR = baseAvatar;

export function matthiasTimeVisual(hour = new Date().getHours()) {
  const scene = matthiasTimeScene(hour);
  return {
    ...scene,
    avatar: TIME_ASSETS[scene.key] || baseAvatar,
  };
}

export function matthiasAmbientVisuals(hour = new Date().getHours()) {
  const h = Number.isFinite(Number(hour)) ? Number(hour) : 12;
  const timed = matthiasTimeVisual(h);
  let extras;
  if (h >= 5 && h < 11) extras = [AMBIENT_SCENES.coffee, AMBIENT_SCENES.reading, AMBIENT_SCENES.dossier];
  else if (h >= 11 && h < 15) extras = [AMBIENT_SCENES.lunch, AMBIENT_SCENES.dossier, AMBIENT_SCENES.reading];
  else if (h >= 15 && h < 20) extras = [AMBIENT_SCENES.ops, AMBIENT_SCENES.dossier, AMBIENT_SCENES.reading];
  else if (h >= 20 || h < 1) extras = [AMBIENT_SCENES.night, AMBIENT_SCENES.reading, AMBIENT_SCENES.dossier];
  else extras = [AMBIENT_SCENES.sleep, AMBIENT_SCENES.reading, AMBIENT_SCENES.base];

  const first = { key: `time-${timed.key}`, avatar: timed.avatar, label: timed.label || timed.fallbackStatus || 'En observación' };
  const seen = new Set();
  return [first, ...extras].filter((scene) => {
    if (!scene?.avatar || seen.has(scene.avatar)) return false;
    seen.add(scene.avatar);
    return true;
  });
}

export function matthiasMoodAvatar(mood = 'observant') {
  return MOOD_ASSETS[mood] || baseAvatar;
}

export function matthiasContextAvatar({ mood = 'observant', hour = new Date().getHours(), context = 'default' } = {}) {
  if (context === 'home' || context === 'briefing') return matthiasTimeVisual(hour).avatar;
  if (context === 'mood') return matthiasMoodAvatar(mood);
  return baseAvatar;
}
