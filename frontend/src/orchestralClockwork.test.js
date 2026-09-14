import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { selectOrchestralSample } from './orchestralSampler.js';

describe('clockwork orchestral showpiece', () => {
  const theme = AMBIENT_THEMES.clockworkOverture;
  const feel = structuredFeel(theme);

  it('has exposition, development, bridge and full reprise', () => {
    expect(theme.sections).toHaveLength(4);
    const leadCounts = theme.sections.map((section) => Object.keys(section.lead).length);
    expect(leadCounts[0]).toBeGreaterThanOrEqual(30);
    expect(leadCounts[2]).toBeLessThan(leadCounts[0] / 2);
    expect(leadCounts[3]).toBeGreaterThanOrEqual(30);
    expect(theme.sections[3].counterInstrument).toBe('strings');
  });

  it('builds the pulse from real short-bow violin and cello articulations', () => {
    expect(feel.leadInstrument).toBe('spiccatoStrings');
    expect(feel.bassInstrument).toBe('spiccatoCello');
    expect(feel.percussion.kit).toBe('orchestral-pulse');
    expect(feel.signature.instrument).toBe('spiccatoStrings');

    const leadNotes = theme.sections.flatMap((section) => Object.values(section.lead));
    const bassNotes = theme.sections.flatMap((section) => Object.values(section.bass));
    expect(Math.max(...leadNotes.map((note) => Math.abs(selectOrchestralSample('spiccatoStrings', note).semitones)))).toBeLessThanOrEqual(3);
    expect(Math.max(...bassNotes.map((note) => Math.abs(selectOrchestralSample('spiccatoCello', note).semitones)))).toBeLessThanOrEqual(2);
  });

  it('keeps a memorable eight-note cell instead of unrelated procedural notes', () => {
    const exposition = theme.sections[0].lead;
    expect([0,2,4,6,8,10,12,14].map((step) => exposition[step]))
      .toEqual([64,67,71,69,67,64,62,64]);
    expect(feel.harmonyPath[0]).toBe(0);
    expect(feel.harmonyPath[1]).toBe(0);
  });
});
