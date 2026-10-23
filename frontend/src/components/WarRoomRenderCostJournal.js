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
      const row = {
        seq, startedAtMs, endedAtMs,
        calls, triangles, cpuSubmitMs: endedAtMs - startedAtMs,
      };
      if (Number.isSafeInteger(info.mainCalls) && Number.isSafeInteger(info.shadowCalls)
          && Number.isSafeInteger(info.shadowPasses)
          && info.mainCalls >= 0 && info.shadowCalls >= 0
          && info.shadowPasses >= 0 && info.mainCalls + info.shadowCalls === calls) {
        row.mainCalls = info.mainCalls;
        row.shadowCalls = info.shadowCalls;
        row.shadowPasses = info.shadowPasses;
        const groups = info.shadowFamilyCalls;
        if (groups && ['pieces', 'shell', 'other'].every((key) =>
          Number.isSafeInteger(groups[key]) && groups[key] >= 0)
          && groups.pieces + groups.shell + groups.other === info.shadowCalls) {
          row.shadowFamilyCalls = { pieces: groups.pieces, shell: groups.shell, other: groups.other };
          const snapshot = info.shadowTopCasters;
          const top = snapshot?.top;
          const unranked = snapshot?.unrankedCalls;
          if (Array.isArray(top) && top.length <= 8
              && Number.isSafeInteger(unranked) && unranked >= 0
              && top.every((item) =>
                item && typeof item.name === 'string' && item.name.length > 0
                && item.name.length <= 96
                && ['pieces', 'shell', 'other'].includes(item.family)
                && Number.isSafeInteger(item.calls) && item.calls > 0)
              && top.reduce((sum, item) => sum + item.calls, unranked) === info.shadowCalls) {
            row.shadowTopCasters = {
              top: top.map(({ name, family, calls }) => ({ name, family, calls })),
              unrankedCalls: unranked,
            };
          }
        }
      }
      ring[(seq - 1) % capacity] = row;
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
