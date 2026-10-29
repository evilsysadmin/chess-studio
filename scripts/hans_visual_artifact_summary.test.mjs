import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  renderHansVisualSummary,
  summarizeHansVisualArtifact,
} from './hans_visual_artifact_summary.mjs';

async function fixture(manifest, { deliveredPng = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'hans-espresso-evidence-'));
  await Promise.all([
    writeFile(join(dir, 'espresso.json'), JSON.stringify({
      event: 'espresso',
      expectedRoute: 'service-espresso',
      observedRoutes: ['service-espresso'],
      observedScreens: ['onscreen'],
      groundTelemetryObserved: true,
      maxGroundGap: 0,
      ...manifest,
    })),
    writeFile(join(dir, 'espresso.png'), 'viewport'),
    writeFile(join(dir, 'espresso.webm'), 'video'),
    ...(deliveredPng ? [writeFile(join(dir, 'espresso-delivered.png'), 'cup')] : []),
  ]);
  return dir;
}

test('route-only espresso stays explicitly historical, not claimed as a completed service', async () => {
  const dir = await fixture({}, { deliveredPng: false });
  try {
    const summary = await summarizeHansVisualArtifact(dir);
    assert.equal(summary.passed, 1);
    assert.equal(summary.routines[0].espressoProofClaimed, false);
    assert.match(renderHansVisualSummary(summary), /not claimed .*route-only evidence/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('espresso full service proof requires both real milestones and a delivered-cup image', async () => {
  const dir = await fixture({ deliveredCupVisible: true, returnedToServiceDoor: true });
  try {
    const summary = await summarizeHansVisualArtifact(dir);
    assert.equal(summary.passed, 1);
    assert.equal(summary.routines[0].espressoProofOk, true);
    assert.match(renderHansVisualSummary(summary), /delivered cup \+ returned to service door \+ PNG/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a partial espresso claim, even if all legacy route/video assertions pass', async () => {
  const dir = await fixture({ deliveredCupVisible: true });
  try {
    await assert.rejects(
      summarizeHansVisualArtifact(dir),
      /delivery and service-door return must both be proven/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a claimed completed service without an actual delivered-cup PNG', async () => {
  const dir = await fixture(
    { deliveredCupVisible: true, returnedToServiceDoor: true },
    { deliveredPng: false },
  );
  try {
    await assert.rejects(
      summarizeHansVisualArtifact(dir),
      /delivered-cup PNG missing or empty/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
