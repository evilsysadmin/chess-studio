import { describe, expect, it } from 'vitest';
import { FOOTBALL_MANAGER_CLUBS, getFootballManagerClub } from './footballManagerClubs.js';

describe('Chess Football manager starter clubs', () => {
  it('offers exactly six distinct, stable fictional choices', () => {
    expect(FOOTBALL_MANAGER_CLUBS).toHaveLength(6);
    expect(new Set(FOOTBALL_MANAGER_CLUBS.map((club) => club.id)).size).toBe(6);
    expect(new Set(FOOTBALL_MANAGER_CLUBS.map((club) => club.shortName)).size).toBe(6);
    expect(FOOTBALL_MANAGER_CLUBS.every((club) => club.level >= 1 && club.level <= 5)).toBe(true);
    expect(FOOTBALL_MANAGER_CLUBS.every((club) => club.name && club.style && club.objective)).toBe(true);
    expect(FOOTBALL_MANAGER_CLUBS.map((club) => club.id).slice(0, 2)).toEqual(['fc-matthias', 'real-enroque']);
  });

  it('never invents or mutates a selected club', () => {
    const selected = getFootballManagerClub('fc-matthias');
    expect(selected?.name).toBe('FC Matthias');
    expect(Object.isFrozen(FOOTBALL_MANAGER_CLUBS)).toBe(true);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(getFootballManagerClub('invalid')).toBeNull();
    expect(getFootballManagerClub(undefined)).toBeNull();
  });
});
