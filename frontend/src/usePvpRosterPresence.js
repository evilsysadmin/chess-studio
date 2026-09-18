import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUsername } from './auth.js';
import { loadPvpEnrollment, savePvpEnrollment } from './pvpEnrollment.js';

const EMPTY_LOBBY = Object.freeze({ roster: [], challenges: [], activeMatch: null, pollAfterMs: 3000 });
const ROSTER_HEARTBEAT_MS = 15000;
const HIDDEN_HEARTBEAT_CHECK_MS = 12000;

async function loadPvpApi() {
  return (await import('./pvpApi.js')).pvpApi;
}

export function pvpPollPlan({ visibilityState = 'visible', pollAfterMs = EMPTY_LOBBY.pollAfterMs } = {}) {
  if (visibilityState === 'hidden') {
    return { heartbeatOnly: true, delay: HIDDEN_HEARTBEAT_CHECK_MS };
  }
  const requestedDelay = Number(pollAfterMs);
  return {
    heartbeatOnly: false,
    delay: Number.isFinite(requestedDelay) && requestedDelay > 0
      ? Math.max(2000, requestedDelay)
      : EMPTY_LOBBY.pollAfterMs,
  };
}

function mergeSelfIntoRoster(lobby, member) {
  if (!member) return lobby;
  const roster = [...(lobby?.roster || [])].filter((row) => row.username !== member.username);
  roster.push({ ...member, isSelf: true });
  return { ...EMPTY_LOBBY, ...(lobby || {}), roster };
}

export function incomingPvpChallenge(lobby) {
  return (lobby?.challenges || []).find((row) => row?.direction === 'incoming' && row?.status === 'pending') || null;
}

export function pvpRivalCount(lobby) {
  return (lobby?.roster || []).filter((row) => !row?.isSelf).length;
}

export function usePvpRosterPresence({ enabled = true } = {}) {
  const username = getUsername();
  const [enrolled, setEnrolled] = useState(() => loadPvpEnrollment(username));
  const [lobby, setLobby] = useState(EMPTY_LOBBY);
  const [error, setError] = useState('');
  const heartbeatAtRef = useRef(0);

  const heartbeatOnly = useCallback(async ({ signal } = {}) => {
    if (!enrolled) return null;
    const due = Date.now() - heartbeatAtRef.current >= ROSTER_HEARTBEAT_MS;
    if (!due) return null;
    try {
      const pvpApi = await loadPvpApi();
      const joined = await pvpApi.joinRoster({ signal });
      heartbeatAtRef.current = Date.now();
      setError('');
      return joined;
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'No se pudo mantener tu disponibilidad 1v1.');
      return null;
    }
  }, [enrolled]);

  const refresh = useCallback(async ({ signal, heartbeat = true } = {}) => {
    if (!enrolled) return null;
    try {
      const pvpApi = await loadPvpApi();
      let next = { ...EMPTY_LOBBY, ...(await pvpApi.getLobby({ signal }) || {}) };
      const due = Date.now() - heartbeatAtRef.current >= ROSTER_HEARTBEAT_MS;
      if (!next.activeMatch && heartbeat && due) {
        const joined = await pvpApi.joinRoster({ signal });
        heartbeatAtRef.current = Date.now();
        next = mergeSelfIntoRoster(next, joined?.member);
      }
      setLobby(next);
      setError('');
      return next;
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'No se pudo actualizar tu disponibilidad 1v1.');
      return null;
    }
  }, [enrolled]);

  useEffect(() => {
    if (!enabled || !enrolled) {
      if (!enrolled) setLobby(EMPTY_LOBBY);
      return undefined;
    }

    let active = true;
    let timer = null;
    let controller = null;
    let cycle = 0;

    const schedule = (delay) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      if (!active) return;
      const ownCycle = ++cycle;
      controller?.abort();
      controller = new AbortController();
      const plan = pvpPollPlan({ visibilityState: document.visibilityState });

      if (plan.heartbeatOnly) {
        await heartbeatOnly({ signal: controller.signal });
      } else {
        const next = await refresh({ signal: controller.signal, heartbeat: true });
        if (ownCycle === cycle && active) {
          const nextPlan = pvpPollPlan({
            visibilityState: document.visibilityState,
            pollAfterMs: next?.pollAfterMs,
          });
          schedule(nextPlan.heartbeatOnly ? nextPlan.delay : nextPlan.delay);
        }
        return;
      }

      if (ownCycle !== cycle || !active) return;
      const nextPlan = pvpPollPlan({ visibilityState: document.visibilityState });
      schedule(nextPlan.heartbeatOnly ? nextPlan.delay : 0);
    };

    const onVisibility = () => {
      if (!active) return;
      cycle += 1;
      controller?.abort();
      const plan = pvpPollPlan({ visibilityState: document.visibilityState });
      schedule(plan.heartbeatOnly ? plan.delay : 0);
    };

    void poll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      cycle += 1;
      controller?.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, enrolled, heartbeatOnly, refresh]);

  const enroll = useCallback(async () => {
    try {
      const pvpApi = await loadPvpApi();
      const joined = await pvpApi.joinRoster();
      savePvpEnrollment(username, true);
      heartbeatAtRef.current = Date.now();
      setEnrolled(true);
      const next = { ...EMPTY_LOBBY, ...(await pvpApi.getLobby() || {}) };
      setLobby(mergeSelfIntoRoster(next, joined?.member));
      setError('');
      return joined;
    } catch (err) {
      setError(err?.message || 'No se pudo entrar al roster 1v1.');
      throw err;
    }
  }, [username]);

  const leave = useCallback(async () => {
    try {
      const pvpApi = await loadPvpApi();
      await pvpApi.leaveRoster();
    } finally {
      savePvpEnrollment(username, false);
      heartbeatAtRef.current = 0;
      setEnrolled(false);
      setLobby(EMPTY_LOBBY);
    }
  }, [username]);

  const challenge = useCallback(async (opponent) => {
    if (!opponent) return null;
    const pvpApi = await loadPvpApi();
    const result = await pvpApi.challenge(opponent);
    setError('');
    return result;
  }, []);

  const acceptChallenge = useCallback(async (challenge) => {
    const challengeId = typeof challenge === 'string' ? challenge : challenge?.id;
    if (!challengeId) return null;
    const pvpApi = await loadPvpApi();
    const result = await pvpApi.acceptChallenge(challengeId);
    setError('');
    return result;
  }, []);

  const declineChallenge = useCallback(async (challenge) => {
    const challengeId = typeof challenge === 'string' ? challenge : challenge?.id;
    if (!challengeId) return null;
    const pvpApi = await loadPvpApi();
    const result = await pvpApi.declineChallenge(challengeId);
    setLobby((current) => ({
      ...current,
      challenges: (current.challenges || []).filter((row) => row.id !== challengeId),
    }));
    setError('');
    return result;
  }, []);

  const incomingChallenge = useMemo(() => incomingPvpChallenge(lobby), [lobby]);
  const rivalCount = useMemo(() => pvpRivalCount(lobby), [lobby]);

  return {
    enrolled,
    lobby,
    incomingChallenge,
    rivalCount,
    activeMatch: lobby.activeMatch || null,
    error,
    refresh,
    enroll,
    leave,
    challenge,
    acceptChallenge,
    declineChallenge,
  };
}
