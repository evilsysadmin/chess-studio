let gameAuthorityGeneration = 0;
const activeGameMutationTokens = new Set();

export function currentGameAuthorityGeneration() {
  return gameAuthorityGeneration;
}

export function hasActiveGameMutation() {
  return activeGameMutationTokens.size > 0;
}

export function markGameMutationStarted() {
  const token = Symbol('game-authority-mutation');
  activeGameMutationTokens.add(token);
  gameAuthorityGeneration += 1;
  return token;
}

export function markGameMutationFinished(token) {
  if (!token) return false;
  return activeGameMutationTokens.delete(token);
}
