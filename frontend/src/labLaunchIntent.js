const LAB_MODES = new Set(['pawnslug-godot']);
const LAB_MODE_ALIASES = new Map([
  ['pawnslug', 'pawnslug-godot'],
]);
let pendingLabMode = null;

export function requestLabLaunch(mode) {
  const normalizedMode = LAB_MODE_ALIASES.get(mode) || mode;
  pendingLabMode = LAB_MODES.has(normalizedMode) ? normalizedMode : null;
}

export function consumeLabLaunch() {
  const mode = pendingLabMode;
  pendingLabMode = null;
  return mode;
}
