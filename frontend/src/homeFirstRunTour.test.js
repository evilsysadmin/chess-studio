import { beforeEach, describe, expect, it } from 'vitest';
import {
  HOME_FIRST_RUN_TOUR_KEY,
  HOME_FIRST_RUN_TOUR_STEPS,
  HOME_FIRST_RUN_TOUR_VERSION,
  homeFirstRunTourSeen,
  markHomeFirstRunTourSeen,
  shouldOfferHomeFirstRunTour,
} from './homeFirstRunTour.js';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('chess-study-auth-username', 'tour-test');
});

describe('Home first-run tour', () => {
  it('uses a versioned profile flag independent from Matthias onboarding', () => {
    localStorage.setItem('matthias.onboarded', '2');
    expect(homeFirstRunTourSeen()).toBe(false);
    expect(markHomeFirstRunTourSeen()).toBe(true);
    expect(localStorage.getItem(HOME_FIRST_RUN_TOUR_KEY)).toBe(HOME_FIRST_RUN_TOUR_VERSION);
    expect(homeFirstRunTourSeen()).toBe(true);
  });

  it('never blocks a saved game or another higher-priority overlay', () => {
    expect(shouldOfferHomeFirstRunTour({ seen: false })).toBe(true);
    expect(shouldOfferHomeFirstRunTour({ seen: false, hasSavedGame: true })).toBe(false);
    expect(shouldOfferHomeFirstRunTour({ seen: false, blocked: true })).toBe(false);
    expect(shouldOfferHomeFirstRunTour({ seen: true })).toBe(false);
  });

  it('keeps Matthias as the narrator across the compact Home tour', () => {
    expect(HOME_FIRST_RUN_TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(HOME_FIRST_RUN_TOUR_STEPS[0].id).toBe('matthias');
    expect(HOME_FIRST_RUN_TOUR_STEPS.some((step) => step.target === 'play')).toBe(true);
    expect(HOME_FIRST_RUN_TOUR_STEPS.some((step) => step.target === 'train')).toBe(true);
    expect(HOME_FIRST_RUN_TOUR_STEPS.some((step) => step.target === 'dungeon')).toBe(true);
  });
});
