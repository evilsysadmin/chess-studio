import { APP_RELEASE } from './release.js';
import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { STORAGE_SCHEMA_KEY, STORAGE_SCHEMA_VERSION } from './storageMigrations.js';

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

function sanitizeStackUrl(raw) {
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(raw || '').split(/[?#]/, 1)[0];
  }
}

function compactStack(error) {
  const stack = String(error?.stack || '').trim();
  if (!stack) return '';
  return stack
    .split(/\r?\n/)
    .slice(1, 5)
    .map((line) => String(line)
      .replace(/https?:\/\/[^\s)]+/g, sanitizeStackUrl)
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .join(' | ')
    .slice(0, 700);
}

export function clientCapabilitySummary(runtime = globalThis) {
  const nav = runtime?.navigator;
  return {
    webgl2: typeof runtime?.WebGL2RenderingContext !== 'undefined',
    worker: typeof runtime?.Worker !== 'undefined',
    audio: typeof runtime?.AudioContext !== 'undefined' || typeof runtime?.webkitAudioContext !== 'undefined',
    serviceWorker: Boolean(nav && 'serviceWorker' in nav),
  };
}

function storageSchemaSummary() {
  const raw = getStorageItem(STORAGE_LOCAL, STORAGE_SCHEMA_KEY);
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  const current = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  return `${current}/${STORAGE_SCHEMA_VERSION}`;
}

function yesNo(value) {
  return value ? 'sí' : 'no';
}

export function buildClientDiagnostic({ error = null, view = null, canRecover = false, now = new Date(), runtime = globalThis } = {}) {
  const requestId = String(error?.requestId || '').trim().slice(0, 64);
  const route = String(view || runtime?.location?.pathname || 'desconocida').slice(0, 80);
  const nav = runtime?.navigator;
  const online = !nav || typeof nav.onLine !== 'boolean' ? 'desconocido' : (nav.onLine ? 'sí' : 'no');
  const stack = compactStack(error);
  const capabilities = clientCapabilitySummary(runtime);
  const lines = [
    'Chess Studio · diagnóstico cliente',
    `release: ${APP_RELEASE}`,
    `storage schema: ${storageSchemaSummary()}`,
    `pantalla: ${route}`,
    `online: ${online}`,
    `capacidades: WebGL2 ${yesNo(capabilities.webgl2)} · Worker ${yesNo(capabilities.worker)} · AudioContext ${yesNo(capabilities.audio)} · ServiceWorker ${yesNo(capabilities.serviceWorker)}`,
    `localStorage: ${storageReadable('localStorage') ? 'ok' : 'bloqueado/no disponible'}`,
    `sessionStorage: ${storageReadable('sessionStorage') ? 'ok' : 'bloqueado/no disponible'}`,
    `partida recuperable: ${canRecover ? 'sí' : 'no'}`,
    `error: ${compactError(error)}`,
    `hora UTC: ${now.toISOString()}`,
  ];
  if (stack) lines.splice(lines.length - 1, 0, `stack: ${stack}`);
  if (requestId) lines.splice(lines.length - 1, 0, `requestId: ${requestId}`);
  lines.push('privacidad: sin token, usuario, FEN, jugadas ni contenido de partida; sin user-agent completo ni datos de hardware');
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
