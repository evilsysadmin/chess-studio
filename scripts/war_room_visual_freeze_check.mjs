import fs from 'node:fs';
import path from 'node:path';

const artifactDir = path.resolve('.artifacts/app-visual');
const requestedVariants = String(process.env.APP_VISUAL_WARROOM_VARIANTS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const profiles = [
  {
    slug: 'war-room-android-390x844',
    label: 'Android portrait 390×844',
    minBoardWidthFill: 0.88,
    minBoardViewportFill: 0.34,
  },
  {
    slug: 'war-room-android-landscape-844x390',
    label: 'Android landscape 844×390',
    minBoardWidthFill: 0.66,
    minBoardViewportFill: 0.68,
  },
  {
    slug: 'war-room-desktop-1440x900',
    label: 'Desktop 1440×900',
    minBoardWidthFill: 0.74,
    minBoardViewportFill: 0.82,
  },
];

const failures = [];
const rows = [];

function fail(label, message) {
  failures.push(`${label}: ${message}`);
}

for (const profile of profiles) {
  const candidateSlugs = [
    profile.slug,
    ...requestedVariants.map((variant) => profile.slug.replace(/^war-room-/, `war-room-${variant}-`)),
  ];
  const healthPath = candidateSlugs
    .map((slug) => path.join(artifactDir, `${slug}-health.json`))
    .find((candidate) => fs.existsSync(candidate));

  if (!healthPath) {
    const expected = candidateSlugs
      .map((slug) => path.relative(process.cwd(), path.join(artifactDir, `${slug}-health.json`)))
      .join(' or ');
    fail(profile.label, `missing canonical health artifact ${expected}`);
    continue;
  }

  const payload = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
  const health = payload?.capture || {};
  const boardWidthFill = Number(health.boardWidthFill || 0);
  const boardViewportFill = Number(health.boardViewportFill || 0);
  const overflowX = Number(health.horizontalOverflowPx || 0);
  const overflowY = Number(health.verticalOverflowPx || 0);
  const legacyDeck = health.legacyCommandDeck?.display;

  rows.push({
    label: profile.label,
    boardWidthFill,
    boardViewportFill,
    overflowX,
    overflowY,
    legacyDeck,
  });

  if (overflowX > 1) fail(profile.label, `horizontal overflow regressed to ${overflowX}px`);
  if (overflowY > 1) fail(profile.label, `vertical overflow regressed to ${overflowY}px`);
  if (legacyDeck !== 'none') fail(profile.label, `legacy command deck is visible (${legacyDeck || 'missing'})`);
  if (boardWidthFill < profile.minBoardWidthFill) {
    fail(profile.label, `board width share ${boardWidthFill.toFixed(3)} < ${profile.minBoardWidthFill.toFixed(2)}`);
  }
  if (boardViewportFill < profile.minBoardViewportFill) {
    fail(profile.label, `board viewport-height share ${boardViewportFill.toFixed(3)} < ${profile.minBoardViewportFill.toFixed(2)}`);
  }
}

console.log('War Room visual freeze baseline');
for (const row of rows) {
  console.log(
    `- ${row.label}: board ${(row.boardWidthFill * 100).toFixed(1)}% wide, `
      + `${(row.boardViewportFill * 100).toFixed(1)}% viewport high, `
      + `overflow ${row.overflowX}/${row.overflowY}px, legacy deck ${row.legacyDeck}`,
  );
}

if (failures.length) {
  console.error('\nWar Room visual freeze contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('\nIf a composition change is intentional, review the canonical PNGs first and update this baseline in the same PR with rationale.');
  process.exit(1);
}

console.log('War Room visual freeze contract: OK');
