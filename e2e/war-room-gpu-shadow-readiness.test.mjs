import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expectedWarRoomGpuShadowWarmup } from './war-room-gpu-shadow-readiness.mjs';

test('physical desktop waits for real deferred shadow caster warmup', () => {
  assert.equal(expectedWarRoomGpuShadowWarmup('hardware', false), 'ready-budgeted');
});
test('software and touch profiles explicitly require disabled-lite', () => {
  assert.equal(expectedWarRoomGpuShadowWarmup('hardware', true), 'disabled-lite');
  assert.equal(expectedWarRoomGpuShadowWarmup('software', false), 'disabled-lite');
  assert.equal(expectedWarRoomGpuShadowWarmup('software', true), 'disabled-lite');
});
test('fail closed on missing or ambiguous benchmark provenance', () => {
  assert.throws(() => expectedWarRoomGpuShadowWarmup('unknown', false), TypeError);
  assert.throws(() => expectedWarRoomGpuShadowWarmup('hardware'), TypeError);
  assert.throws(() => expectedWarRoomGpuShadowWarmup('hardware', 'true'), TypeError);
});
