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

    const sync = async () => {
      if (!active) return;
      try {
        const api = await loadPvpApi();
        const current = handoffMatch?.id === matchId ? handoffMatch : null;
        let result;
        if (!readySent && current?.status === 'starting') {
          result = await api.readyMatch(matchId);
          readySent = true;
        } else {
          result = await api.getMatch(matchId);
        }
        if (!active || !result?.match) return;
        setHandoffMatch((previous) => previous?.id === matchId ? result.match : previous);
        setHandoffError('');
        if (result.match.status === 'starting' || (result.match.status === 'active' && !result.match.startsAt)) {
          timer = window.setTimeout(sync, 400);
        } else if (result.match.status !== 'active') {
          terminalHandoffIdRef.current = matchId;
        }
      } catch (err) {
        if (!active || err?.name === 'AbortError') return;
        setHandoffError(err?.message || 'No se pudo sincronizar el arranque del 1v1.');
        timer = window.setTimeout(sync, 900);
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

  const cancelHandoff = useCallback(() => {
    if (handoffMatch?.id) terminalHandoffIdRef.current = handoffMatch.id;
    setHandoffMatch(null);
    setHandoffError('');
    replaceView('menu');
  }, [handoffMatch?.id, replaceView]);

  const exitMatch = useCallback(() => {
    setMatch(null);
    setHandoffMatch(null);
    replaceView('menu');
  }, [replaceView]);

  const menuStatus = useMemo(() => ({
    enrolled: presence.enrolled,
    rivalCount: presence.rivalCount,
    incomingCount: presence.incomingChallenge ? 1 : 0,
    activeMatch: presence.activeMatch,
  }), [presence.activeMatch, presence.enrolled, presence.incomingChallenge, presence.rivalCount]);

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
