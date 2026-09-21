export const LEGACY_LOGIN_MIN_PASSWORD_LENGTH = 6;
export const NEW_PASSWORD_MIN_LENGTH = 12;

export function minPasswordLengthForAuthMode(mode) {
  return mode === 'login' ? LEGACY_LOGIN_MIN_PASSWORD_LENGTH : NEW_PASSWORD_MIN_LENGTH;
}
