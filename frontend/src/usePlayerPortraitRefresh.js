import { useEffect } from 'react';
import { ACHIEVEMENTS, loadUnlocked } from './achievements.js';
import { buildPlayerPortraitFacts, loadCachedPlayerPortrait, playerPortraitGenerationKey, saveCachedPlayerPortrait } from './aiPlayerPortrait.js';
import { getToken, getUsername } from './auth.js';
import { loadCleanGameRecords } from './cleanGames.js';
import { requestRemoteNarrative } from './narrativeRemote.js';
import { loadPersonalPuzzles } from './personalPuzzles.js';
import { buildPlayerModel } from './playerModel.js';
import { loadPuzzlesSolved } from './puzzleStats.js';
import { loadRivalry } from './rivalry.js';

export function buildPlayerPortraitRefreshFacts(insights, {
  rivalry = loadRivalry(),
  personalPuzzles = loadPersonalPuzzles(),
  cleanGameRecords = loadCleanGameRecords(),
  achievementsUnlocked = loadUnlocked().size,
  achievementsTotal = ACHIEVEMENTS.length,
  puzzlesSolved = loadPuzzlesSolved(),
} = {}) {
  const puzzles = Array.isArray(personalPuzzles) ? personalPuzzles.filter(Boolean) : [];
  const records = cleanGameRecords && typeof cleanGameRecords === 'object' && !Array.isArray(cleanGameRecords)
    ? cleanGameRecords
    : {};
  const playerModel = buildPlayerModel({
    insights,
    personalPuzzles: puzzles,
    cleanGameRecords: records,
    timeControlStats: rivalry?.record?.byTimeControl,
  });

  return buildPlayerPortraitFacts(
    insights,
    rivalry,
    {
      achievementsUnlocked,
      achievementsTotal,
      puzzlesSolved,
      personalPuzzles: puzzles.length,
    },
    null,
    playerModel,
  );
}

export function usePlayerPortraitRefresh(insights) {
  useEffect(() => {
    if (Number(insights?.totalGames || 0) < 3) return undefined;
    const identityScope = getUsername();
    const token = getToken();
    if (!identityScope || !token) return undefined;
    const generationKey = playerPortraitGenerationKey(insights);
    if (loadCachedPlayerPortrait(generationKey, identityScope)) return undefined;
    const facts = buildPlayerPortraitRefreshFacts(insights);
    if (!facts) return undefined;

    const controller = new AbortController();
    void requestRemoteNarrative({
      eventType: 'player_portrait',
      requestKind: 'portrait_auto',
      tone: 'friendly_sarcastic',
      facts,
    }, { token, timeoutMs: 7000, signal: controller.signal })
      .then((text) => {
        if (controller.signal.aborted || !text) return;
        saveCachedPlayerPortrait(generationKey, text, identityScope);
      })
      .catch(() => {});
    return () => controller.abort(new DOMException('Portrait refresh superseded', 'AbortError'));
  }, [insights]);
}
