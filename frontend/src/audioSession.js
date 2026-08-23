export const LEGACY_AMBIENT_THEME_KEY = 'chess-study-ambient-theme';
export const AMBIENT_THEME_SESSION_KEY = 'chess-study-ambient-theme-session';
export const FRESH_AMBIENT_THEME_MARKER = '__fresh__';

export function markAmbientThemeSessionFresh() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AMBIENT_THEME_SESSION_KEY, FRESH_AMBIENT_THEME_MARKER);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_AMBIENT_THEME_KEY);
}

export function clearAmbientThemeSessionStorage() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(AMBIENT_THEME_SESSION_KEY);
}
