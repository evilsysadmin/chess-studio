import { useCallback, useMemo, useState } from 'react';
import { usePvpRosterPresence } from './usePvpRosterPresence.js';

export function usePvpAppFlow({ view, replaceView }) {
  const [match, setMatch] = useState(null);
  const presence = usePvpRosterPresence({ enabled: view !== 'pvpGame' });

  const enterMatch = useCallback((nextMatch) => {
    if (!nextMatch?.id) return false;
    setMatch(nextMatch);
    replaceView('pvpGame');
    return true;
  }, [replaceView]);

  const acceptIncoming = useCallback(async (challenge) => {
    const result = await presence.acceptChallenge(challenge);
    if (result?.match) enterMatch(result.match);
    return result;
  }, [enterMatch, presence]);

  const exitMatch = useCallback(() => {
    setMatch(null);
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
    menuStatus,
    enterMatch,
    acceptIncoming,
    exitMatch,
  };
}
