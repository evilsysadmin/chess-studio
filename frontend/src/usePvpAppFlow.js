import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePvpRosterPresence } from './usePvpRosterPresence.js';

async function loadPvpApi() {
  return (await import('./pvpApi.js')).pvpApi;
}

function startsInFuture(match) {
  const stamp = Date.parse(match?.startsAt || '');
  return Number.isFinite(stamp) && stamp > Date.now();
}

export function usePvpAppFlow({ view, replaceView }) {
  const [match, setMatch] = useState(null);
  const [handoffMatch, setHandoffMatch] = useState(null);
  const [handoffError, setHandoffError] = useState('');
  const terminalHandoffIdRef = useRef('');
  const handoffInProgress = handoffMatch?.status === 'starting' || handoffMatch?.status === 'active';
  const presence = usePvpRosterPresence({ enabled: view !== 'pvpGame' && !handoffInProgress });

  const enterPreparedMatch = useCallback((nextMatch) => {
    if (!nextMatch?.id) return false;
    setHandoffMatch(null);
    setHandoffError('');
    setMatch(nextMatch);
    replaceView('pvpGame');
    return true;
  }, [replaceView]);

  const enterMatch = useCallback((nextMatch) => {
    if (!nextMatch?.id) return false;
    if (nextMatch.status === 'starting' || startsInFuture(nextMatch)) {
      setHandoffMatch(nextMatch);
      setHandoffError('');
      return true;
    }
    return enterPreparedMatch(nextMatch);
  }, [enterPreparedMatch]);

  const acceptIncoming = useCallback(async (challenge) => {
    const result = await presence.acceptChallenge(challenge);
    if (result?.match) {
      setHandoffMatch(result.match);
      setHandoffError('');
    }
    return result;
  }, [presence.acceptChallenge]);

  useEffect(() => {
    const nextMatch = presence.activeMatch;
    if (!nextMatch?.id) {
      terminalHandoffIdRef.current = '';
      return;
    }
    if (nextMatch.id === terminalHandoffIdRef.current) return;
    if (nextMatch.id === match?.id || nextMatch.id === handoffMatch?.id) return;
    enterMatch(nextMatch);
  }, [enterMatch, handoffMatch?.id, match?.id, presence.activeMatch]);

  useEffect(() => {
    const matchId = handoffMatch?.id;
    if (!matchId) return undefined;
    let active = true;
    let timer = null;
    let readySent = false;
    let consecutiveFailures = 0;

    const applySnapshot = (result) => {
      if (!active || !result?.match) return false;
      const nextMatch = result.match;
      setHandoffMatch((previous) => previous?.id === matchId ? nextMatch : previous);
      consecutiveFailures = 0;
      setHandoffError('');
      if (nextMatch.status === 'starting') {
        if (nextMatch.youReady) readySent = true;
        timer = window.setTimeout(sync, 400);
      } else if (nextMatch.status === 'active' && !nextMatch.startsAt) {
        timer = window.setTimeout(sync, 400);
      } else if (nextMatch.status !== 'active') {
        terminalHandoffIdRef.current = matchId;
      }
      return true;
    };

    const sync = async () => {
      if (!active) return;
      const api = await loadPvpApi();
      try {
        const current = handoffMatch?.id === matchId ? handoffMatch : null;
        let result;
        if (!readySent && current?.status === 'starting') {
          result = await api.readyMatch(matchId);
          readySent = true;
        } else {
          result = await api.getMatch(matchId);
        }
        applySnapshot(result);
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;

        // A POST /ready can fail after the backend has already persisted the
        // readiness transition (for example if a non-critical cleanup step
        // fails afterwards). Re-read the authoritative match before showing a
        // scary error or retrying the mutation. If the server says we're ready
        // or active, continue from that fact instead of hammering /ready.
        try {
          const recovery = await api.getMatch(matchId);
          if (applySnapshot(recovery)) return;
        } catch (recoveryError) {
          if (!active || recoveryError?.name === 'AbortError') return;
        }

        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          setHandoffError(err?.message || 'No se pudo sincronizar el arranque del 1v1.');
        }
        timer = window.setTimeout(sync, consecutiveFailures >= 3 ? 1200 : 700);
      }
    };

    void sync();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [handoffMatch?.id]);

  const completeHandoff = useCallback(() => {
    if (!handoffMatch?.id || handoffMatch.status !== 'active') return false;
    return enterPreparedMatch(handoffMatch);
  }, [enterPreparedMatch, handoffMatch]);

  const cancelHandoff = useCallback(async () => {
    const matchId = handoffMatch?.id;
    if (matchId) terminalHandoffIdRef.current = matchId;
    if (matchId && handoffMatch?.status === 'starting') {
      try {
        const api = await loadPvpApi();
        await api.cancelStartingMatch(matchId);
      } catch (err) {
        setHandoffError(err?.message || 'No se pudo cancelar la entrada al 1v1.');
        return false;
      }
    }
    setHandoffMatch(null);
    setHandoffError('');
    replaceView('menu');
    return true;
  }, [handoffMatch?.id, handoffMatch?.status, replaceView]);

  const exitMatch = useCallback(() => {
    // The roster snapshot can still carry this duel as active for one render
    // after a terminal result. Suppress that stale id until the lobby refresh
    // observes activeMatch=null, otherwise leaving the debrief immediately
    // re-enters the same War Room.
    if (match?.id && match.status !== 'active' && match.status !== 'starting') {
      terminalHandoffIdRef.current = match.id;
    }
    setMatch(null);
    setHandoffMatch(null);
    replaceView('menu');
  }, [match?.id, match?.status, replaceView]);

  const menuStatus = useMemo(() => ({
    enrolled: presence.enrolled,
    rivalCount: presence.rivalCount,
    incomingCount: presence.incomingChallenge ? 1 : 0,
    activeMatch: presence.activeMatch,
    unreadMessageCount: presence.unreadMessageCount,
  }), [presence.activeMatch, presence.enrolled, presence.incomingChallenge, presence.rivalCount, presence.unreadMessageCount]);

  return {
    ...presence,
    match,
    handoffMatch,
    handoffError,
    menuStatus,
    enterMatch,
    acceptIncoming,
    completeHandoff,
    cancelHandoff,
    exitMatch,
  };
}
