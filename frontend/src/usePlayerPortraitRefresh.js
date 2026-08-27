import { useEffect } from 'react';
import { buildPlayerPortraitFacts, loadCachedPlayerPortrait, playerPortraitGenerationKey, saveCachedPlayerPortrait } from './aiPlayerPortrait.js';
import { getToken, getUsername } from './auth.js';
import { loadRivalry } from './rivalry.js';
import { requestRemoteNarrative } from './narrativeRemote.js';

export function usePlayerPortraitRefresh(insights) {
  useEffect(() => {
    if (Number(insights?.totalGames || 0) < 3) return undefined;
    const identityScope = getUsername();
    const token = getToken();
    if (!identityScope || !token) return undefined;
    const generationKey = playerPortraitGenerationKey(insights);
    if (loadCachedPlayerPortrait(generationKey, identityScope)) return undefined;
    const facts = buildPlayerPortraitFacts(insights, loadRivalry());
    if (!facts) return undefined;

    let active = true;
    void requestRemoteNarrative({
      eventType: 'player_portrait',
      requestKind: 'portrait_auto',
      tone: 'friendly_sarcastic',
      facts,
    }, { token, timeoutMs: 7000 })
      .then((text) => {
        if (!active || !text) return;
        saveCachedPlayerPortrait(generationKey, text, identityScope);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [insights]);
}
