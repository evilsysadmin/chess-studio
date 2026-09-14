import { useEffect, useState } from 'react';
import { getToken } from './auth.js';
import { requestRemoteNarrative } from './narrativeRemote.js';

export function useRemoteNarrativeDossier(dossier, {
  timeoutMs = 8000,
  abortMessage = 'Remote narrative superseded',
} = {}) {
  const [text, setText] = useState(null);
  const [loading, setLoading] = useState(false);
  const factsKey = JSON.stringify(dossier?.facts || {});

  useEffect(() => {
    const token = getToken();
    if (!token || !dossier) {
      setText(null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    void requestRemoteNarrative(dossier, { token, timeoutMs, signal: controller.signal })
      .then((nextText) => {
        if (!controller.signal.aborted) setText(nextText || null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setText(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort(new DOMException(abortMessage, 'AbortError'));
  }, [factsKey, timeoutMs, abortMessage]);

  return { text, loading };
}
