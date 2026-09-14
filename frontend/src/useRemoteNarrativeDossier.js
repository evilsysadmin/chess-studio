import { useEffect, useState } from 'react';
import { getToken } from './auth.js';
import { requestRemoteNarrative } from './narrativeRemote.js';

export function remoteNarrativeDossierKey(dossier) {
  if (!dossier || typeof dossier !== 'object') return 'null';
  return JSON.stringify({
    eventType: dossier.eventType ?? null,
    requestKind: dossier.requestKind ?? null,
    tone: dossier.tone ?? null,
    facts: dossier.facts && typeof dossier.facts === 'object' ? dossier.facts : {},
  });
}

export function useRemoteNarrativeDossier(dossier, {
  timeoutMs = 8000,
  abortMessage = 'Remote narrative superseded',
} = {}) {
  const [text, setText] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestKey = remoteNarrativeDossierKey(dossier);

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
  }, [requestKey, timeoutMs, abortMessage]);

  return { text, loading };
}
