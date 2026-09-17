import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pvpApi } from './pvpApi.js';
import { loadPvpEnrollment, loadPvpMatchSession, savePvpEnrollment } from './pvpEnrollment.js';

const EMPTY_LOBBY = Object.freeze({ roster: [], challenges: [], activeMatch: null, pollAfterMs: 3000 });
const PVP_BACKGROUND_POLL_MS = 12000;

function mergeSelfMember(lobby, member) {
  if (!member?.username) return lobby;
  const roster = [member, ...(lobby.roster || []).filter((row) => !row.isSelf && row.username !== member.username)];
  return { ...lobby, roster };
}

export function usePvpPresence() {
  const [lobby, setLobby] = useState(EMPTY_LOBBY);
  const [enrolled, setEnrolled] = useState(() => loadPvpEnrollment());
  const [loading, setLoading] = useState(() => enrolled || Boolean(loadPvpMatchSession()));
  const [ready, setReady] = useState(() => !enrolled && !loadPvpMatchSession());
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const enrolledRef = useRef(enrolled);
  enrolledRef.current = enrolled;

  const refresh = useCallback(async ({ quiet = true, heartbeat = false, signal } = {}) => {
    if (!quiet) setLoading(true);
    try {
      let next = { ...EMPTY_LOBBY, ...(await pvpApi.getLobby({ signal }) || {}) };
      if (heartbeat && enrolledRef.current && !next.activeMatch) {
        const joined = await pvpApi.joinRoster({ signal });
        if (joined?.member) next = mergeSelfMember(next, joined.member);
      }
      setLobby(next);
      setError('');
      setReady(true);
      return next;
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'No se pudo actualizar la disponibilidad 1 vs 1.');
        setReady(true);
      }
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const shouldPoll = enrolled || Boolean(loadPvpMatchSession());
    if (!shouldPoll) {
      setReady(true);
      setLoading(false);
      return undefined;
    }
    let active = true;
    let timer = null;
    let controller = new AbortController();

    const schedule = (delay = PVP_BACKGROUND_POLL_MS) => {
      if (!active) return;
      timer = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      if (!active) return;
      if (document.visibilityState === 'hidden') {
        schedule();
        return;
      }
      controller.abort();
      controller = new AbortController();
      const next = await refresh({ quiet: true, heartbeat: enrolledRef.current, signal: controller.signal });
      if (!active) return;
      if (enrolledRef.current || next?.activeMatch) schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer !== null) window.clearTimeout(timer);
      void poll();
    };

    void poll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enrolled, refresh]);

  const run = useCallback(async (key, action, { refreshAfter = true } = {}) => {
    if (busyKey) return null;
    setBusyKey(key);
    setError('');
    try {
      const result = await action();
      if (refreshAfter) await refresh({ quiet: true, heartbeat: enrolledRef.current });
      return result;
    } catch (err) {
      setError(err?.message || 'La orden 1 vs 1 no pudo completarse.');
      return null;
    } finally {
      setBusyKey('');
    }
  }, [busyKey, refresh]);

  const enroll = useCallback(async () => {
    const result = await run('join', () => pvpApi.joinRoster(), { refreshAfter: false });
    if (!result?.member) return null;
    savePvpEnrollment(true);
    setEnrolled(true);
    setLobby((current) => mergeSelfMember(current, result.member));
    return result;
  }, [run]);

  const leave = useCallback(async () => {
    if (lobby.activeMatch) return null;
    const result = await run('leave', () => pvpApi.leaveRoster(), { refreshAfter: false });
    if (result === null) return null;
    savePvpEnrollment(false);
    setEnrolled(false);
    setLobby((current) => ({ ...current, roster: (current.roster || []).filter((row) => !row.isSelf) }));
    return result;
  }, [lobby.activeMatch, run]);

  const challenge = useCallback((username) => run(`challenge:${username}`, () => pvpApi.challenge(username)), [run]);
  const declineChallenge = useCallback((challengeId) => run(`decline:${challengeId}`, () => pvpApi.declineChallenge(challengeId)), [run]);
  const acceptChallenge = useCallback(async (challengeId) => {
    const result = await run(`accept:${challengeId}`, () => pvpApi.acceptChallenge(challengeId), { refreshAfter: false });
    if (result?.match) {
      setLobby((current) => ({
        ...current,
        activeMatch: result.match,
        roster: (current.roster || []).filter((row) => !row.isSelf),
        challenges: (current.challenges || []).filter((row) => row.id !== challengeId),
      }));
    }
    return result;
  }, [run]);

  const roster = useMemo(() => [...(lobby.roster || [])].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return (Number(b.rating) || 0) - (Number(a.rating) || 0) || String(a.username).localeCompare(String(b.username));
  }), [lobby.roster]);
  const self = useMemo(() => roster.find((row) => row.isSelf) || null, [roster]);
  const incoming = useMemo(() => (lobby.challenges || []).filter((row) => row.direction === 'incoming' && row.status === 'pending'), [lobby.challenges]);
  const outgoing = useMemo(() => (lobby.challenges || []).filter((row) => row.direction === 'outgoing' && row.status === 'pending'), [lobby.challenges]);
  const rivalCount = Math.max(0, roster.length - (self ? 1 : 0));

  return {
    lobby,
    roster,
    self,
    incoming,
    outgoing,
    incomingChallenge: incoming[0] || null,
    rivalCount,
    enrolled,
    loading,
    ready,
    busyKey,
    error,
    refresh,
    enroll,
    leave,
    challenge,
    acceptChallenge,
    declineChallenge,
  };
}
