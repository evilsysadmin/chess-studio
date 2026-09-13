const PERFORMANCE_PROFILES = Object.freeze({
  full: Object.freeze({
    warmupSamples: 30,
    sampleSize: 90,
    slowFrameMs: 28,
    slowRatio: 0.25,
    p90FrameMs: 40,
    nextLod: 'lite',
  }),
  lite: Object.freeze({
    warmupSamples: 20,
    sampleSize: 60,
    slowFrameMs: 58,
    slowRatio: 0.30,
    p90FrameMs: 82,
    nextLod: '2d',
  }),
});

const SUSPENDED_FRAME_MS = 250;

function percentile90(samples) {
  if (!samples.length) return 0;
  const ordered = [...samples].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(ordered.length * 0.9) - 1);
  return ordered[index];
}

export function createHomeCastle3DPerformanceGovernor(lod) {
  const profile = PERFORMANCE_PROFILES[lod] || null;
  let previousTimestamp = null;
  let warmupSamples = 0;
  let samples = [];
  let degraded = false;

  return Object.freeze({
    observe(timestamp) {
      if (!profile || degraded || !Number.isFinite(timestamp)) return null;
      if (previousTimestamp === null) {
        previousTimestamp = timestamp;
        return null;
      }

      const frameMs = timestamp - previousTimestamp;
      previousTimestamp = timestamp;
      if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > SUSPENDED_FRAME_MS) return null;

      if (warmupSamples < profile.warmupSamples) {
        warmupSamples += 1;
        return null;
      }

      samples.push(frameMs);
      if (samples.length < profile.sampleSize) return null;

      const slowFrames = samples.filter((value) => value >= profile.slowFrameMs).length;
      const slowRatio = slowFrames / samples.length;
      const p90FrameMs = percentile90(samples);
      if (slowRatio >= profile.slowRatio || p90FrameMs >= profile.p90FrameMs) {
        degraded = true;
        return profile.nextLod;
      }

      // Keep half the healthy history so degradation requires sustained jank,
      // while still adapting if a device becomes hot or starts throttling later.
      samples = samples.slice(Math.floor(samples.length / 2));
      return null;
    },
  });
}
