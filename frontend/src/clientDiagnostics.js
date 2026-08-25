import { APP_RELEASE } from './release.js';

function storageReadable(name) {
  try {
    const storage = globalThis?.[name];
    if (!storage) return false;
    storage.getItem('__chess_studio_diag_probe__');
    return true;
  } catch {
    return false;
  }
}

function compactError(error) {
  const name = String(error?.name || 'Error').slice(0, 48);
  const message = String(error?.message || 'Sin detalle').replace(/\s+/g, ' ').trim().slice(0, 220);
  return `${name}: ${message}`;
}

export function buildClientDiagnostic({ error = null, view = null, canRecover = false, now = new Date() } = {}) {
  const requestId = String(error?.requestId || '').trim().slice(0, 64);
  const route = String(view || globalThis?.location?.pathname || 'desconocida').slice(0, 80);
  const online = typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? 'desconocido' : (navigator.onLine ? 'sí' : 'no');
  const lines = [
    'Chess Studio · diagnóstico cliente',
    `release: ${APP_RELEASE}`,
    `pantalla: ${route}`,
    `online: ${online}`,
    `localStorage: ${storageReadable('localStorage') ? 'ok' : 'bloqueado/no disponible'}`,
    `sessionStorage: ${storageReadable('sessionStorage') ? 'ok' : 'bloqueado/no disponible'}`,
    `partida recuperable: ${canRecover ? 'sí' : 'no'}`,
    `error: ${compactError(error)}`,
    `hora UTC: ${now.toISOString()}`,
  ];
  if (requestId) lines.splice(lines.length - 1, 0, `requestId: ${requestId}`);
  lines.push('privacidad: sin token, usuario, FEN, jugadas ni contenido de partida');
  return lines.join('\n');
}

export async function copyDiagnosticText(text) {
  if (globalThis?.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  }
  if (!globalThis?.document?.createElement) return false;
  const node = document.createElement('textarea');
  node.value = text;
  node.setAttribute('readonly', '');
  node.style.position = 'fixed';
  node.style.opacity = '0';
  document.body.appendChild(node);
  node.select();
  let copied = false;
  try { copied = Boolean(document.execCommand?.('copy')); } catch { copied = false; }
  node.remove();
  return copied;
}
