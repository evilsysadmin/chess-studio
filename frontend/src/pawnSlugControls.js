import { STORAGE_LOCAL, getStorageItem, setStorageItem } from './safeStorage.js';

export const PAWN_SLUG_CONTROL_ACTIONS = Object.freeze([
  'moveLeft',
  'moveRight',
  'crouch',
  'fire',
  'jump',
  'usePowerup',
  'pause',
]);

export const PAWN_SLUG_ENGINE_ACTION_BY_CONTROL = Object.freeze({
  moveLeft: 'left',
  moveRight: 'right',
  crouch: 'crouch',
  fire: 'fire',
  jump: 'jump',
  usePowerup: 'grenade',
  pause: 'pause',
});

export const PAWN_SLUG_CONTROL_LABELS = Object.freeze({
  moveLeft: 'Mover izquierda',
  moveRight: 'Mover derecha',
  crouch: 'Agacharse',
  fire: 'Disparar',
  jump: 'Saltar',
  usePowerup: 'Usar power-up',
  pause: 'Pausa / Settings',
});

export const PAWN_SLUG_DEFAULT_KEYMAP = Object.freeze({
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  crouch: 'ArrowDown',
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

const KEY_LABELS = Object.freeze({
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'ESPACIO',
  ShiftLeft: 'SHIFT IZQ',
  ShiftRight: 'SHIFT DER',
  ControlLeft: 'CTRL IZQ',
  ControlRight: 'CTRL DER',
  Escape: 'ESC',
  Enter: 'ENTER',
  Tab: 'TAB',
  Backspace: 'BACKSPACE',
});

const clampVolume = (value, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
};

const normalizedCode = (value) => (typeof value === 'string' ? value.trim() : '');

export function normalizePawnSlugKeymap(value) {
  const input = value && typeof value === 'object' ? value : {};
  const proposed = Object.fromEntries(PAWN_SLUG_CONTROL_ACTIONS.map((action) => {
    const candidate = normalizedCode(input[action]);
    return [action, candidate || PAWN_SLUG_DEFAULT_KEYMAP[action]];
  }));
  const counts = new Map();
  for (const code of Object.values(proposed)) counts.set(code, (counts.get(code) || 0) + 1);

  return Object.fromEntries(PAWN_SLUG_CONTROL_ACTIONS.map((action) => {
    const candidate = proposed[action];
    return [
      action,
      counts.get(candidate) === 1 ? candidate : PAWN_SLUG_DEFAULT_KEYMAP[action],
    ];
  }));
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

export function loadPawnSlugSettings() {
  const raw = getStorageItem(STORAGE_LOCAL, PAWN_SLUG_SETTINGS_STORAGE_KEY);
  if (!raw) return normalizePawnSlugSettings(PAWN_SLUG_DEFAULT_SETTINGS);
  try {
    return normalizePawnSlugSettings(JSON.parse(raw));
  } catch {
    return normalizePawnSlugSettings(PAWN_SLUG_DEFAULT_SETTINGS);
  }
}

export function savePawnSlugSettings(value) {
  const settings = normalizePawnSlugSettings(value);
  setStorageItem(STORAGE_LOCAL, PAWN_SLUG_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return settings;
}

export function pawnSlugControlActionForCode(keymap, code) {
  const normalized = normalizePawnSlugKeymap(keymap);
  const target = normalizedCode(code);
  if (!target) return null;
  return PAWN_SLUG_CONTROL_ACTIONS.find((action) => normalized[action] === target) || null;
}

export function pawnSlugEngineAction(controlAction) {
  return PAWN_SLUG_ENGINE_ACTION_BY_CONTROL[controlAction] || null;
}

export function remapPawnSlugKey(keymap, action, code) {
  if (!PAWN_SLUG_CONTROL_ACTIONS.includes(action)) {
    return { ok: false, keymap: normalizePawnSlugKeymap(keymap), conflictAction: null };
  }
  const target = normalizedCode(code);
  if (!target) {
    return { ok: false, keymap: normalizePawnSlugKeymap(keymap), conflictAction: null };
  }
  const current = normalizePawnSlugKeymap(keymap);
  const conflictAction = PAWN_SLUG_CONTROL_ACTIONS.find(
    (candidate) => candidate !== action && current[candidate] === target,
  ) || null;
  if (conflictAction) return { ok: false, keymap: current, conflictAction };
  return { ok: true, keymap: { ...current, [action]: target }, conflictAction: null };
}

export function pawnSlugKeyLabel(code) {
  const normalized = normalizedCode(code);
  if (!normalized) return '—';
  if (KEY_LABELS[normalized]) return KEY_LABELS[normalized];
  if (/^Key[A-Z]$/.test(normalized)) return normalized.slice(3);
  if (/^Digit[0-9]$/.test(normalized)) return normalized.slice(5);
  if (/^Numpad[0-9]$/.test(normalized)) return `NUM ${normalized.slice(6)}`;
  return normalized.replace(/(Left|Right)$/, ' $1').toUpperCase();
}
