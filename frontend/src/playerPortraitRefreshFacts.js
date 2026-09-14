import { ACHIEVEMENTS, loadUnlocked } from './achievements.js';
import { buildPlayerPortraitFacts } from './aiPlayerPortrait.js';
import { loadCleanGameRecords } from './cleanGames.js';
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
