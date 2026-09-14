#!/usr/bin/env node
import { appendFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VISIBLE_SCREENS = new Set(['onscreen', 'edge', 'offscreen']);
const MAX_GROUND_GAP = 0.02;

async function nonEmptyFile(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

export async function summarizeHansVisualArtifact(inputDir) {
  const dir = resolve(inputDir);
  const names = await readdir(dir);
  const manifestNames = names
    .filter((name) => name.endsWith('.json') && name !== 'summary.json')
    .sort();

  if (!manifestNames.length) {
    throw new Error(`No Hans routine manifests found in ${dir}`);
  }

  const routines = [];
  const failures = [];

  for (const manifestName of manifestNames) {
    const manifest = JSON.parse(await readFile(join(dir, manifestName), 'utf8'));
    const event = String(manifest.event || manifestName.replace(/\.json$/u, ''));
    const expectedRoute = String(manifest.expectedRoute || '');
    const observedRoutes = stringArray(manifest.observedRoutes);
    const observedScreens = stringArray(manifest.observedScreens);
    const png = await nonEmptyFile(join(dir, `${event}.png`));
    const webm = await nonEmptyFile(join(dir, `${event}.webm`));
    const routeOk = !expectedRoute || observedRoutes.includes(expectedRoute);
    const screenOk = observedScreens.some((screen) => VISIBLE_SCREENS.has(screen));
    const groundingObserved = manifest.groundTelemetryObserved === true;
    const maxGroundGap = Number.isFinite(manifest.maxGroundGap) ? manifest.maxGroundGap : null;
    const groundingOk = !groundingObserved || (maxGroundGap !== null && maxGroundGap <= MAX_GROUND_GAP);

    if (!routeOk) failures.push(`${event}: expected route ${expectedRoute || '<none>'} not observed`);
    if (!screenOk) failures.push(`${event}: no visible screen state observed`);
    if (!groundingOk) failures.push(`${event}: max grounding gap ${maxGroundGap} exceeds ${MAX_GROUND_GAP}`);
    if (!png) failures.push(`${event}: PNG capture missing or empty`);
    if (!webm) failures.push(`${event}: WebM capture missing or empty`);

    routines.push({
      event,
      expectedRoute,
      observedRoutes,
      observedScreens,
      groundingObserved,
      maxGroundGap,
      png,
      webm,
      ok: routeOk && screenOk && groundingOk && png && webm,
    });
  }

  const summary = {
    schema: 1,
    routineCount: routines.length,
    passed: routines.filter((routine) => routine.ok).length,
    failed: routines.filter((routine) => !routine.ok).length,
    routines,
  };

  await writeFile(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (failures.length) {
    throw new Error(`Hans visual artifact validation failed:\n- ${failures.join('\n- ')}`);
  }

  return summary;
}

export function renderHansVisualSummary(summary) {
  const lines = [
    '## Hans routine visual artifact',
    '',
    '| Routine | Route | Screen | Grounding | PNG | WebM |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const routine of summary.routines) {
    const route = routine.expectedRoute || routine.observedRoutes.join(', ') || '—';
    const screen = routine.observedScreens.join(', ') || '—';
    const grounding = routine.groundingObserved
      ? `≤ ${routine.maxGroundGap}`
      : 'not published';
    lines.push(`| ${routine.event} | ${route} | ${screen} | ${grounding} | ${routine.png ? '✓' : '✗'} | ${routine.webm ? '✓' : '✗'} |`);
  }

  lines.push('', `Validated ${summary.passed}/${summary.routineCount} Hans routine captures.`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const dir = process.argv[2] || '.artifacts/app-visual/hans-routines';
  const summary = await summarizeHansVisualArtifact(dir);
  const markdown = renderHansVisualSummary(summary);
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8');
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
