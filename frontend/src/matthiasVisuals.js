import baseAvatar from './assets/matthias-scenes/base.webp';
import morningCoffee from './assets/matthias-scenes/morning-coffee.webp';
import lunchBocata from './assets/matthias-scenes/lunch-bocata.webp';
import afternoonOps from './assets/matthias-scenes/afternoon-ops.webp';
import nightCoffee from './assets/matthias-scenes/night-coffee.webp';
import lateSleep from './assets/matthias-scenes/late-sleep.webp';
import dossier from './assets/matthias-scenes/dossier.webp';
import strategyBook from './assets/matthias-scenes/strategy-book.webp';
import moodAnnoyed from './assets/matthias-scenes/mood-annoyed.webp';
import moodImpressed from './assets/matthias-scenes/mood-impressed.webp';
import moodSkeptical from './assets/matthias-scenes/mood-skeptical.webp';
import { matthiasTimeScene } from './matthiasTime.js';

// Las claves horarias son estables aunque una ilustración concreta cambie.
// Hasta reintroducir los cuatro artes dañados con un canal binario verificado,
// reutilizamos escenas válidas para que Matthias nunca desaparezca de Home.
const TIME_ASSETS = Object.freeze({
  'morning-coffee': morningCoffee,
  'lunch-bocata': lunchBocata,
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

const MOOD_ASSETS = Object.freeze({
  observant: baseAvatar,
  satisfied: baseAvatar,
  pleased: baseAvatar,
  skeptical: moodSkeptical,
  annoyed: moodAnnoyed,
  impressed: moodImpressed,
});

export const MATTHIAS_BASE_AVATAR = baseAvatar;

export function matthiasTimeVisual(hour = new Date().getHours()) {
  const scene = matthiasTimeScene(hour);
  return {
    ...scene,
    avatar: TIME_ASSETS[scene.key] || baseAvatar,
  };
}

export function matthiasMoodAvatar(mood = 'observant') {
  return MOOD_ASSETS[mood] || baseAvatar;
}

export function matthiasContextAvatar({ mood = 'observant', hour = new Date().getHours(), context = 'default' } = {}) {
  if (context === 'home' || context === 'briefing') return matthiasTimeVisual(hour).avatar;
  if (context === 'mood') return matthiasMoodAvatar(mood);
  return baseAvatar;
}
