import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePvpRosterPresence } from './usePvpRosterPresence.js';
import {
  exitWarRoomBrowserFullscreen,
  requestWarRoomLandscapeOnEntry,
  unlockWarRoomOrientation,
} from './components/useWarRoomImmersive.js';
import { mergeNewerMatch } from './pvpGameModel.js';

/**
 * The browser only rotates (fullscreen + orientation lock) inside a user
 * gesture. The War Room rotates on the «Empezar partida» tap; a challenger
 * enters the Duel Room later, from the countdown, with no gesture left. So the
 * challenger's rotation is taken on the «Retar» tap and kept while that
 * challenge is pending. It is released, like a CPU game that failed to start,
 * when the challenge ends without a duel.
 *
 * Returns what to do with an armed rotation for the current lobby snapshot:
 * - 'duel': a duel is starting; the Duel Room landscape flow owns it now;
 * - 'seen': the challenge is visible and still pending;
 * - 'wait': the snapshot does not show the challenge yet (refresh lag);
 * - 'release': it was declined, cancelled or expired.
 */
export function pvpEntryRotationDecision({ pending, lobby, activeMatch, handoffMatch, match }) {
  if (!pending?.challengeId) return 'release';
  if (activeMatch?.id || handoffMatch?.id || match?.id) return 'duel';
  const row = (lobby?.challenges || []).find((item) => item?.id === pending.challengeId);
  if (row?.status === 'pending') return 'seen';
  if (row || pending.seen) return 'release';
  return 'wait';
}

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
    void requestWarRoomLandscapeOnEntry();
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

  const pendingRotationRef = useRef(null);
  const releaseEntryRotation = useCallback(() => {
    pendingRotationRef.current = null;
    void exitWarRoomBrowserFullscreen();
    unlockWarRoomOrientation();
  }, []);

  const acceptIncoming = useCallback(async (challenge) => {
    const rotation = requestWarRoomLandscapeOnEntry();
    let result;
    try {
      result = await presence.acceptChallenge(challenge);
    } catch (err) {
      if (await rotation) releaseEntryRotation();
      throw err;
    }
    if (result?.match) {
      setHandoffMatch(result.match);
      setHandoffError('');
    } else if (await rotation) {
      releaseEntryRotation();
    }
    return result;
  }, [presence.acceptChallenge, releaseEntryRotation]);

  const challengeWithEntryRotation = useCallback(async (opponent) => {
    if (!opponent) return null;
    // Rotate now, inside the «Retar» tap: by the time the rival accepts and
    // the countdown opens the Duel Room, the browser no longer allows it.
    const rotation = requestWarRoomLandscapeOnEntry();
    let result;
    try {
      result = await presence.challenge(opponent);
    } catch (err) {
      if (await rotation) releaseEntryRotation();
      throw err;
    }
    if (await rotation) {
      const challengeId = result?.challenge?.id;
      if (challengeId) pendingRotationRef.current = { challengeId, seen: false };
      else releaseEntryRotation();
    }
    return result;
  }, [presence.challenge, releaseEntryRotation]);

  useEffect(() => {
    const pending = pendingRotationRef.current;
    if (!pending) return;
    const decision = pvpEntryRotationDecision({
      pending,
      lobby: presence.lobby,
      activeMatch: presence.activeMatch,
      handoffMatch,
      match,
    });
    if (decision === 'duel') pendingRotationRef.current = null;
    else if (decision === 'seen') pending.seen = true;
    else if (decision === 'release') releaseEntryRotation();
  }, [handoffMatch, match, presence.activeMatch, presence.lobby, releaseEntryRotation]);

  useEffect(() => {
    const nextMatch = presence.activeMatch;
    // A terminal match id is a local tombstone against stale lobby projections.
    // Keep it across transient activeMatch=null snapshots: clearing it here lets
    // the next delayed snapshot resurrect the just-finished duel.
    if (!nextMatch?.id) return;
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

  const updateMatch = useCallback((nextMatch) => {
    if (!nextMatch?.id) return false;
    if (nextMatch.status !== 'active' && nextMatch.status !== 'starting') {
      terminalHandoffIdRef.current = nextMatch.id;
    }
    setMatch((current) => mergeNewerMatch(current, nextMatch));
    return true;
  }, []);

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

  const exitMatch = useCallback((latestMatch = null) => {
    // The roster snapshot can still carry this duel as active for one render
    // after a terminal result. Prefer the child's latest authoritative snapshot
    // over the parent's render-lagged copy so a just-finished duel cannot be
    // resurrected as a fresh handoff while the lobby refresh catches up.
    const terminalCandidate = latestMatch?.id ? latestMatch : match;
    if (
      terminalCandidate?.id
      && terminalCandidate.status !== 'active'
      && terminalCandidate.status !== 'starting'
    ) {
      terminalHandoffIdRef.current = terminalCandidate.id;
    }
    setMatch(null);
    setHandoffMatch(null);
    replaceView('menu');
  }, [match, replaceView]);

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
    challenge: challengeWithEntryRotation,
    acceptIncoming,
    completeHandoff,
    cancelHandoff,
    updateMatch,
    exitMatch,
  };
}
