import baseAvatar from './assets/matthias-scenes/base.webp';
import morningCoffee from './assets/matthias-scenes/morning-coffee.webp';
import lunchBocata from './assets/matthias-scenes/lunch-bocata.webp';
import afternoonOps from './assets/matthias-scenes/afternoon-ops.webp';
import nightCoffee from './assets/matthias-scenes/night-coffee.webp';
import lateSleep from './assets/matthias-scenes/late-sleep.webp';
import moodPleased from './assets/matthias-scenes/mood-pleased.webp';
import moodAnnoyed from './assets/matthias-scenes/mood-annoyed.webp';
import moodImpressed from './assets/matthias-scenes/mood-impressed.webp';
import moodSatisfied from './assets/matthias-scenes/mood-satisfied.webp';
import moodSkeptical from './assets/matthias-scenes/mood-skeptical.webp';
import { matthiasTimeScene } from './matthiasTime.js';

const TIME_ASSETS = Object.freeze({
  'morning-coffee': morningCoffee,
  'lunch-bocata': lunchBocata,
  'afternoon-ops': afternoonOps,
  'night-coffee': nightCoffee,
  'late-sleep': lateSleep,
});

const MOOD_ASSETS = Object.freeze({
  observant: baseAvatar,
  satisfied: moodSatisfied,
  pleased: moodPleased,
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
