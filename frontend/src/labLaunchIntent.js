const LAB_MODES = new Set(['pawnslug']);
let pendingLabMode = null;

export function requestLabLaunch(mode) {
  pendingLabMode = LAB_MODES.has(mode) ? mode : null;
}

export function consumeLabLaunch() {
  const mode = pendingLabMode;
  pendingLabMode = null;
  return mode;
}
