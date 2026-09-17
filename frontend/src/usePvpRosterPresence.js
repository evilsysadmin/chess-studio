import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUsername } from './auth.js';
import { pvpApi } from './pvpApi.js';
import { loadPvpEnrollment, savePvpEnrollment } from './pvpEnrollment.js';

const EMPTY_LOBBY = Object.freeze({ roster: [], challenges: [], activeMatch: null, pollAfterMs: 3000 });
const ROSTER_HEARTBEAT_MS = 15000;
const HIDDEN_POLL_MS = 12000;

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

  const refresh = useCallback(async ({ signal, heartbeat = true } = {}) => {
    if (!enrolled) return null;
    try {
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
    let controller = new AbortController();

    const poll = async () => {
      if (!active) return;
      controller.abort();
      controller = new AbortController();
      const next = await refresh({ signal: controller.signal, heartbeat: true });
      if (!active) return;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const delay = hidden ? HIDDEN_POLL_MS : Math.max(2000, Number(next?.pollAfterMs || 3000));
      timer = window.setTimeout(poll, delay);
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !active) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(poll, 0);
    };

    void poll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, enrolled, refresh]);

  const enroll = useCallback(async () => {
    try {
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
      await pvpApi.leaveRoster();
    } finally {
      savePvpEnrollment(username, false);
      heartbeatAtRef.current = 0;
      setEnrolled(false);
      setLobby(EMPTY_LOBBY);
    }
  }, [username]);

  const acceptChallenge = useCallback(async (challenge) => {
    const challengeId = typeof challenge === 'string' ? challenge : challenge?.id;
    if (!challengeId) return null;
    const result = await pvpApi.acceptChallenge(challengeId);
    setError('');
    return result;
  }, []);

  const declineChallenge = useCallback(async (challenge) => {
    const challengeId = typeof challenge === 'string' ? challenge : challenge?.id;
    if (!challengeId) return null;
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
    acceptChallenge,
    declineChallenge,
  };
}
