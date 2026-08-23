// Gate de fail-fast: sólo invariantes que justifican ejecutar antes de la suite completa.
// El resto de tests sigue protegido por `npm test`; no conviertas este manifest
// en una segunda suite completa o perderá su propósito.
export const CRITICAL_FRONTEND_TESTS = Object.freeze([
  // Combat Chess: reglas, persistencia y despliegue.
  'src/combat.test.js',
  'src/combatRoster.test.js',
  'src/combatDeployment.test.js',
  'src/combatSession.test.js',
  'src/combatRegressionHardening.test.js',
  'src/combatCampaign.test.js',
  'src/combatBalance.test.js',
  'src/combatIdentity.test.js',
  'src/combatMetamorphosis.test.js',
  'src/combatTechniques.test.js',

  // Frontera de seguridad/estado del cliente.
  'src/auth.test.js',
  'src/api.test.js',
  'src/clock.test.js',
  'src/clockPersistence.test.js',
  'src/moveAvailability.test.js',
  'src/labPosition.test.js',
  'src/stateInvariants.test.js',
  'src/puzzles.test.js',
  'src/playerRating.test.js',
  'src/profileBackup.test.js',

  // Narrativa remota: siempre fuera del camino crítico y sin fugas.
  'src/narrativeProvider.test.js',
  'src/narrativeRemote.test.js',
  'src/narrativeWiring.test.js',
  'src/aiMetrics.test.js',

  // Continuidad de release sufrida en producción.
  'src/releaseContinuity.test.js',
]);
