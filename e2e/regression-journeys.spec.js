import './regression-journeys-core.js';

if (process.env.PLAYWRIGHT_FULL_SWEEP !== '1') {
  await import('./learning-golden-path.spec.js');
  await import('./learning-second-observation.spec.js');
}
