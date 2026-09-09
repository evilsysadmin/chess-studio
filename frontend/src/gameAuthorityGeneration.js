let gameAuthorityGeneration = 0;

export function currentGameAuthorityGeneration() {
  return gameAuthorityGeneration;
}

export function markGameMutationConfirmed() {
  gameAuthorityGeneration += 1;
  return gameAuthorityGeneration;
}
