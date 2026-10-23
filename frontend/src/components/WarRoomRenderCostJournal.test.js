import { describe, expect, it } from 'vitest';
import { createWarRoomRenderCostJournal } from './WarRoomRenderCostJournal.js';

describe('War Room real-render cost journal', () => {
  it('captures only real draw records in order, without inventing rAF frames', () => {
    const journal = createWarRoomRenderCostJournal(3);
    expect(journal.latestSeq).toBe(0);
    expect(journal.readAfter(0)).toEqual({ overflow: false, samples: [] });
    journal.record({ calls: 979, triangles: 459990 }, 100, 108);
    journal.record({ calls: 102, triangles: 87000 }, 130, 131.25);
    expect(journal.latestSeq).toBe(2);
    expect(journal.readAfter(0)).toEqual({ overflow: false, samples: [
      { seq: 1, startedAtMs: 100, endedAtMs: 108, calls: 979, triangles: 459990, cpuSubmitMs: 8 },
      { seq: 2, startedAtMs: 130, endedAtMs: 131.25, calls: 102, triangles: 87000, cpuSubmitMs: 1.25 },
    ] });
    expect(journal.readAfter(1).samples).toHaveLength(1);
    // Bad or failed renders cannot fabricate a zero-draw frame.
    journal.record(null, 140, 141);
    journal.record({ calls: -1, triangles: 100 }, 145, 147);
    journal.record({ calls: 9, triangles: 15 }, 160, 159);
    expect(journal.latestSeq).toBe(2);
  });

  it('keeps only mathematically valid measured shadow/main draw partitions', () => {
    const journal = createWarRoomRenderCostJournal(3);
    journal.record({ calls: 100, triangles: 350,
      mainCalls: 65, shadowCalls: 35, shadowPasses: 1 }, 1, 3);
    journal.record({ calls: 100, triangles: 350,
      mainCalls: 60, shadowCalls: 50, shadowPasses: 1 }, 4, 5);
    const rows = journal.readAfter(0).samples;
    expect(rows[0]).toMatchObject({
      calls: 100, mainCalls: 65, shadowCalls: 35, shadowPasses: 1,
    });
    expect(rows[1].shadowCalls).toBeUndefined();
    expect(rows[1].mainCalls).toBeUndefined();
  });

  it('retains only exact nonnegative shadow-family sums', () => {
    const journal = createWarRoomRenderCostJournal(3);
    journal.record({ calls: 30, triangles: 60, mainCalls: 10, shadowCalls: 20,
      shadowPasses: 1, shadowFamilyCalls: { pieces: 12, shell: 5, other: 3 } }, 1, 2);
    journal.record({ calls: 30, triangles: 60, mainCalls: 10, shadowCalls: 20,
      shadowPasses: 1, shadowFamilyCalls: { pieces: 12, shell: 5, other: 4 } }, 2, 3);
    const [valid, invalid] = journal.readAfter(0).samples;
    expect(valid.shadowFamilyCalls).toEqual({ pieces: 12, shell: 5, other: 3 });
    expect(invalid.shadowFamilyCalls).toBeUndefined();
  });

  it('keeps only bounded, complete real shadow-caster ranks', () => {
    const journal = createWarRoomRenderCostJournal(3);
    const common = {
      calls: 24, triangles: 100, mainCalls: 4, shadowCalls: 20,
      shadowPasses: 1, shadowFamilyCalls: { pieces: 12, shell: 5, other: 3 },
    };
    journal.record({ ...common, shadowTopCasters: {
      top: [{ name: 'armour', family: 'shell', calls: 5 },
        { name: 'pawn', family: 'pieces', calls: 12 }],
      unrankedCalls: 3,
    } }, 1, 2);
    journal.record({ ...common, shadowTopCasters: {
      top: [{ name: 'armour', family: 'shell', calls: 50 }],
      unrankedCalls: 0,
    } }, 2, 3);
    const rows = journal.readAfter(0).samples;
    expect(rows[0].shadowTopCasters).toEqual({
      top: [{ name: 'armour', family: 'shell', calls: 5 },
        { name: 'pawn', family: 'pieces', calls: 12 }],
      unrankedCalls: 3,
    });
    expect(rows[1].shadowTopCasters).toBeUndefined();
    expect(rows[1].shadowFamilyCalls).toEqual(common.shadowFamilyCalls);
  });

  it('fails closed on overrun instead of presenting a biased tail as full sampling', () => {
    const journal = createWarRoomRenderCostJournal(3);
    for (let i = 1; i <= 5; i += 1) journal.record({ calls: i, triangles: i * 10 }, i, i + 1);
    expect(journal.latestSeq).toBe(5);
    expect(journal.readAfter(0)).toMatchObject({ overflow: true });
    expect(journal.readAfter(0).samples.map((item) => item.seq)).toEqual([3, 4, 5]);
    expect(journal.readAfter(3)).toMatchObject({ overflow: false });
    expect(journal.readAfter(5).samples).toEqual([]);
    expect(journal.readAfter(-1)).toEqual({ overflow: true, samples: [] });
    expect(() => createWarRoomRenderCostJournal(0)).toThrow(/capacity/);
  });
});
