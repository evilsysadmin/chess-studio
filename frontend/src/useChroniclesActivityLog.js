import { useEffect, useRef, useState } from 'react';
import {
  chroniclesActivityEvents,
  chroniclesAppendActivityLog,
} from './chronicles/chroniclesActivityLog.js';

export function useChroniclesActivityLog(state, scopeKey = null) {
  const previousStateRef = useRef(null);
  const scopeRef = useRef(scopeKey);
  const sequenceRef = useRef(0);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    const scopeChanged = scopeRef.current !== scopeKey;
    if (scopeChanged) {
      scopeRef.current = scopeKey;
      previousStateRef.current = null;
      sequenceRef.current = 0;
    }

    if (!state) {
      previousStateRef.current = null;
      setEntries([]);
      return;
    }

    const projected = chroniclesActivityEvents(previousStateRef.current, state);
    previousStateRef.current = state;
    if (!projected.length) {
      if (scopeChanged) setEntries([]);
      return;
    }

    const stamped = projected.map((entry) => ({
      ...entry,
      id: `chronicles-log-${sequenceRef.current += 1}`,
    }));
    if (scopeChanged) {
      setEntries(chroniclesAppendActivityLog([], stamped));
      return;
    }
    setEntries((current) => chroniclesAppendActivityLog(current, stamped));
  }, [scopeKey, state]);

  return entries;
}

export default useChroniclesActivityLog;
