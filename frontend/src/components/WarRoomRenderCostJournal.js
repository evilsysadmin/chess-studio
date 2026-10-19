// Opt-in journal of *real* Three.js renderer.render() calls. Three resets
// renderer.info.render at each draw; sample it synchronously after that draw,
// never with an unrelated requestAnimationFrame or a first-ready snapshot.
// This diagnostic is not created during normal play.
export const WAR_ROOM_RENDER_COST_CAPACITY = 512;

export function createWarRoomRenderCostJournal(capacity = WAR_ROOM_RENDER_COST_CAPACITY) {
  if (!Number.isSafeInteger(capacity) || capacity < 2 || capacity > 4096) {
    throw new Error('Invalid War Room render journal capacity');
  }
  const ring = new Array(capacity);
  let sequence = 0;
  return {
    get latestSeq() { return sequence; },
    record(info, startedAtMs, endedAtMs) {
      const calls = info?.calls;
      const triangles = info?.triangles;
      if (![calls, triangles, startedAtMs, endedAtMs].every(Number.isFinite)
          || calls < 0 || triangles < 0 || startedAtMs < 0 || endedAtMs < startedAtMs) return;
      const seq = ++sequence;
      ring[(seq - 1) % capacity] = {
        seq, startedAtMs, endedAtMs,
        calls, triangles, cpuSubmitMs: endedAtMs - startedAtMs,
      };
    },
    readAfter(afterSeq) {
      if (!Number.isSafeInteger(afterSeq) || afterSeq < 0) {
        return { overflow: true, samples: [] };
      }
      const firstAvailable = Math.max(1, sequence - capacity + 1);
      const overflow = afterSeq < firstAvailable - 1;
      const samples = [];
      for (let seq = Math.max(afterSeq + 1, firstAvailable); seq <= sequence; seq += 1) {
        samples.push(ring[(seq - 1) % capacity]);
      }
      return { overflow, samples };
    },
  };
}
