import { useEffect } from 'react';
import { loadCachedPlayerPortrait, playerPortraitGenerationKey, saveCachedPlayerPortrait } from './aiPlayerPortrait.js';
import { getToken, getUsername } from './auth.js';
import { requestRemoteNarrative } from './narrativeRemote.js';

export function usePlayerPortraitRefresh(insights) {
  const generationKey = playerPortraitGenerationKey(insights);
  const identityScope = getUsername();
  const token = getToken();

  useEffect(() => {
    if (Number(insights?.totalGames || 0) < 3) return undefined;
    if (!identityScope || !token) return undefined;
    if (loadCachedPlayerPortrait(generationKey, identityScope)) return undefined;

    const controller = new AbortController();
    void import('./playerPortraitRefreshFacts.js')
      .then(({ buildPlayerPortraitRefreshFacts }) => {
        if (controller.signal.aborted) return null;
        const facts = buildPlayerPortraitRefreshFacts(insights);
        if (!facts) return null;
        return requestRemoteNarrative({
          eventType: 'player_portrait',
          requestKind: 'portrait_auto',
          tone: 'friendly_sarcastic',
          facts,
        }, { token, timeoutMs: 7000, signal: controller.signal });
      })
      .then((text) => {
        if (controller.signal.aborted || !text) return;
        saveCachedPlayerPortrait(generationKey, text, identityScope);
      })
      .catch(() => {});
    return () => controller.abort(new DOMException('Portrait refresh superseded', 'AbortError'));
  }, [generationKey, identityScope, token]);
}
