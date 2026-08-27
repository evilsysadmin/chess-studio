import { withRequestId } from './requestId.js';
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_MIN_PLY_GAP = 2;
const DEFAULT_MIN_INTERVAL_MS = 2500;
const DEFAULT_MAX_OUTPUT_CHARS = 420;
const PLAYER_PORTRAIT_MAX_OUTPUT_CHARS = 900;
const RICH_ANALYSIS_MAX_OUTPUT_CHARS = 900;
const PERSONAL_PUZZLE_BATCH_MAX_OUTPUT_CHARS = 3200;
const RICH_ANALYSIS_EVENTS = new Set(['post_game_autopsy', 'combat_briefing', 'combat_debrief', 'observability_summary', 'training_plan', 'personal_puzzle_batch']);

function apiBase() {
  const raw = String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
  return raw;
}

export function createNarrativeCooldownGate({
  minPlyGap = DEFAULT_MIN_PLY_GAP,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  now = () => Date.now(),
} = {}) {
  let lastAcceptedPly = null;
  let lastAcceptedAt = Number.NEGATIVE_INFINITY;

  return {
    allow(dossier) {
      const currentAt = Number(now());
      const rawPly = dossier?.ply ?? dossier?.facts?.ply;
      const ply = Number(rawPly);
      const hasPly = Number.isFinite(ply);

      if (currentAt - lastAcceptedAt < Math.max(0, minIntervalMs)) return false;
      if (hasPly && lastAcceptedPly != null && ply - lastAcceptedPly < Math.max(0, minPlyGap)) return false;

      lastAcceptedAt = currentAt;
      if (hasPly) lastAcceptedPly = ply;
      return true;
    },
    reset() {
      lastAcceptedPly = null;
      lastAcceptedAt = Number.NEGATIVE_INFINITY;
    },
  };
}

function maxOutputCharsFor(dossier) {
  if (dossier?.eventType === 'personal_puzzle_batch') return PERSONAL_PUZZLE_BATCH_MAX_OUTPUT_CHARS;
  if (dossier?.eventType === 'player_portrait') return PLAYER_PORTRAIT_MAX_OUTPUT_CHARS;
  if (RICH_ANALYSIS_EVENTS.has(dossier?.eventType)) return RICH_ANALYSIS_MAX_OUTPUT_CHARS;
  return DEFAULT_MAX_OUTPUT_CHARS;
}

export async function requestRemoteNarrative(
  dossier,
  {
    token,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    cooldownGate = null,
  } = {},
) {
  if (!token || !dossier || typeof dossier !== 'object') return null;
  if (cooldownGate && typeof cooldownGate.allow === 'function' && !cooldownGate.allow(dossier)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    const response = await fetchImpl(`${apiBase()}/narrative`, {
      method: 'POST',
      headers: withRequestId({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
      signal: controller.signal,
      body: JSON.stringify({
        eventType: String(dossier.eventType || 'generic').slice(0, 48),
        requestKind: String(dossier.requestKind || 'default').slice(0, 32),
        facts: dossier.facts && typeof dossier.facts === 'object' ? dossier.facts : {},
        tone: String(dossier.tone || 'friendly_sarcastic').slice(0, 32),
        locale: 'es-ES',
      }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    // El frontend ya tiene un fallback procedural más rico y contextual.
    // Si FastAPI informa provider=local (kill switch, breaker, CF caído...),
    // tratamos el remoto como no disponible para conservar ese relato local
    // en vez de sustituirlo por el fallback genérico del transporte backend.
    if (body?.provider !== 'cloudflare') return null;
    return typeof body?.text === 'string' && body.text.trim()
      ? body.text.trim().slice(0, maxOutputCharsFor(dossier))
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire-and-forget adapter for the actual move pipeline.
 * Call this only after the move/result has already been committed locally.
 * Provider latency/failure can therefore never block board, clock or persistence.
 */
export function requestRemoteNarrativeDetached(dossier, {
  onText,
  onUnavailable,
  cooldownGate = null,
  ...options
} = {}) {
  // A cooldown rejection means "stay silent", not "remote unavailable".
  // Do not route it through onUnavailable or the local fallback would bypass
  // the very cooldown that is meant to keep commentary sparse.
  if (cooldownGate && typeof cooldownGate.allow === 'function' && !cooldownGate.allow(dossier)) {
    return () => {};
  }

  let active = true;
  void requestRemoteNarrative(dossier, options).then((text) => {
    if (!active) return;
    if (text && typeof onText === 'function') {
      onText(text);
      return;
    }
    if (typeof onUnavailable === 'function') onUnavailable();
  });
  return () => { active = false; };
}
