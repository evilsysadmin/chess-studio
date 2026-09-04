// Capas frontend DISJUNTAS. Cada fichero Vitest debe pertenecer exactamente a
// una capa: smoke (fail-fast), unit (lógica/comportamiento) o contract
// (fronteras de integración probadas por comportamiento; los pocos STATIC CONTRACT
// que inspeccionan artefactos quedan declarados explícitamente y limitados por audit).
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
  'src/components/MatthiasCanonicalAsset.test.js',
  'src/presenceLifecycle.test.js',
  'src/narrativeRemote.test.js',
  'src/releaseUpdate.test.js',
]);
