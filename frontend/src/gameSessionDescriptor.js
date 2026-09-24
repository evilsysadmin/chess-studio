// gameSessionDescriptor.js — políticas declarativas de la sesión estándar.
export const GAME_SESSION_KIND = Object.freeze({ STANDARD: 'standard', TOURNAMENT: 'tournament' });

function standardRecordMode({ learningMode, gameContext }) {
  if (gameContext?.rescue) return 'rescue';
  if (gameContext?.lab) return 'lab';
  return learningMode ? 'practice' : 'casual';
}

export function buildGameSessionDescriptor({
  kind = GAME_SESSION_KIND.STANDARD,
  learningMode = false,
  gameContext = {},
  timeControl = null,
  seriesState = null,
  activeContract = null,
  runState = null,
  tournamentLevel = 1,
  points = 0,
  postGameFeedbackEnabled = true,
} = {}) {
  const tournament = kind === GAME_SESSION_KIND.TOURNAMENT;
  const trainingPosition = Boolean(gameContext?.lab || gameContext?.rescue || gameContext?.suddenDeath);
  const standardMode = learningMode ? 'practice' : 'casual';
  return Object.freeze({
    kind: tournament ? GAME_SESSION_KIND.TOURNAMENT : GAME_SESSION_KIND.STANDARD,
    hintMode: tournament ? 'paid' : learningMode ? 'free' : 'off',
    ratingPreviewEnabled: tournament || (!learningMode && !trainingPosition),
    shareMode: tournament ? 'tournament' : standardMode,
    crimeMode: tournament ? 'tournament' : standardRecordMode({ learningMode, gameContext }),
    timeControl: tournament ? null : timeControl,
    seriesState: tournament ? null : seriesState,
    activeContract: tournament ? null : activeContract,
    runState: tournament ? null : runState,
    memoryContext: tournament ? {} : gameContext,
    tournamentLevel: tournament ? tournamentLevel : 1,
    points: tournament ? points : 0,
    postGameFeedbackEnabled: Boolean(postGameFeedbackEnabled),
  });
}
