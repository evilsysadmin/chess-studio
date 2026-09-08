export const PAWN_SLUG_CONTROL_ACTIONS = Object.freeze([
  'moveLeft',
  'moveRight',
  'fire',
  'jump',
  'usePowerup',
  'pause',
]);

export const PAWN_SLUG_DEFAULT_KEYMAP = Object.freeze({
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  fire: 'Space',
  jump: 'ShiftLeft',
  usePowerup: 'ControlLeft',
  pause: 'Escape',
});

export const PAWN_SLUG_DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 1,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  keymap: PAWN_SLUG_DEFAULT_KEYMAP,
});

export const PAWN_SLUG_SETTINGS_STORAGE_KEY = 'chess-studio:pawn-slug:settings:v1';

const clampVolume = (value, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
};

export function normalizePawnSlugKeymap(value) {
  const input = value && typeof value === 'object' ? value : {};
  const next = { ...PAWN_SLUG_DEFAULT_KEYMAP };
  for (const action of PAWN_SLUG_CONTROL_ACTIONS) {
    const candidate = input[action];
    if (typeof candidate === 'string' && candidate.trim()) next[action] = candidate;
  }
  return next;
}

export function normalizePawnSlugSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    masterVolume: clampVolume(input.masterVolume, PAWN_SLUG_DEFAULT_SETTINGS.masterVolume),
    musicVolume: clampVolume(input.musicVolume, PAWN_SLUG_DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clampVolume(input.sfxVolume, PAWN_SLUG_DEFAULT_SETTINGS.sfxVolume),
    keymap: normalizePawnSlugKeymap(input.keymap),
  };
}
