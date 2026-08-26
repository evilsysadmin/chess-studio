// Capas frontend DISJUNTAS. Cada fichero Vitest debe pertenecer exactamente a
// una capa: smoke (fail-fast), unit (lógica/comportamiento) o contract
// (wiring/source estático que aún no compensa subir a navegador real).
export const FRONTEND_SMOKE_TESTS = Object.freeze([
  'src/api.test.js',
  'src/auth.test.js',
  'src/combat.test.js',
  'src/combatCampaign.test.js',
  'src/combatDeployment.test.js',
  'src/combatRoster.test.js',
  'src/combatSession.test.js',
  'src/playerRating.test.js',
  'src/puzzles.test.js',
]);

export const FRONTEND_CONTRACT_TESTS = Object.freeze([
  'src/frontendArchitectureContract.test.js',
  'src/foregroundPresenceContract.test.js',
  'src/narrativeWiring.test.js',
]);
