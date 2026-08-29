import baseAvatar from './assets/matthias-scenes/base.webp';
import morningCoffee from './assets/matthias-scenes/morning-coffee.webp';
import lunchBocata from './assets/matthias-scenes/lunch-bocata.webp';
import afternoonOps from './assets/matthias-scenes/afternoon-ops.webp';
import nightCoffee from './assets/matthias-scenes/night-coffee.webp';
import lateSleep from './assets/matthias-scenes/late-sleep.webp';
import breakfastNews from './assets/matthias-scenes/breakfast-news.webp';
import chessInception from './assets/matthias-scenes/chess-inception.webp';
import dossier from './assets/matthias-scenes/dossier.webp';
import beerBreak from './assets/matthias-scenes/beer-break.webp';
import strategyBook from './assets/matthias-scenes/strategy-book.webp';
import chessWeekly from './assets/matthias-scenes/chess-weekly.webp';
import moodAnnoyed from './assets/matthias-scenes/mood-annoyed.webp';
import moodImpressed from './assets/matthias-scenes/mood-impressed.webp';
import moodSkeptical from './assets/matthias-scenes/mood-skeptical.webp';
import { matthiasTimeScene } from './matthiasTime.js';

const TIME_ASSETS = Object.freeze({
  'morning-coffee': morningCoffee,
  'lunch-bocata': lunchBocata,
  'afternoon-ops': afternoonOps,
  'night-coffee': nightCoffee,
  'late-sleep': lateSleep,
  'breakfast-news': breakfastNews,
  'chess-inception': chessInception,
  dossier,
  'beer-break': beerBreak,
  'strategy-book': strategyBook,
  'chess-weekly': chessWeekly,
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
