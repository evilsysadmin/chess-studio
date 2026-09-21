import { describe, expect, it } from 'vitest';
import {
  LEGACY_LOGIN_MIN_PASSWORD_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  minPasswordLengthForAuthMode,
} from './passwordPolicy.js';

describe('passwordPolicy', () => {
  it('keeps legacy login compatible while raising new-password minimum', () => {
    expect(LEGACY_LOGIN_MIN_PASSWORD_LENGTH).toBe(6);
    expect(NEW_PASSWORD_MIN_LENGTH).toBe(12);
    expect(minPasswordLengthForAuthMode('login')).toBe(6);
    expect(minPasswordLengthForAuthMode('register')).toBe(12);
    expect(minPasswordLengthForAuthMode('reset')).toBe(12);
  });
});
