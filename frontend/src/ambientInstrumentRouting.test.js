import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { structuredSectionInstrument } from './ambientInstrumentRouting.js';

describe('radio section instrument routing', () => {
  it('lets the written soloists exchange places across real sections', () => {
    for (const id of ['istanbul0326', 'istanbulBackgammon', 'beirut0113', 'terraceFireflies']) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);
      const dialogue = theme.sections.find((section) => section.leadInstrument && section.counterInstrument);
      expect(dialogue, `${id} must contain the authored exchange`).toBeTruthy();
      expect(structuredSectionInstrument(theme, feel, dialogue, 'lead')).toBe(dialogue.leadInstrument);
      expect(structuredSectionInstrument(theme, feel, dialogue, 'counter')).toBe(dialogue.counterInstrument);
      expect(structuredSectionInstrument(theme, feel, theme.sections[0], 'lead')).toBe(feel.leadInstrument);
    }
  });

  it('keeps the production grade on written guitar exchanges and the normal default elsewhere', () => {
    const coast = AMBIENT_THEMES.andalusianCoast;
    const coastFeel = structuredFeel(coast);
    expect(structuredSectionInstrument(coast, coastFeel, coast.sections[1], 'counter')).toBe('nylonGuitar');
    const smooth = AMBIENT_THEMES.midnightSatin;
    const smoothFeel = structuredFeel(smooth);
    expect(structuredSectionInstrument(smooth, smoothFeel, {}, 'lead')).toBe('jazzGuitar');
    expect(structuredSectionInstrument(smooth, smoothFeel, { leadInstrument: 'guitar2' }, 'lead')).toBe('jazzGuitar');
    expect(structuredSectionInstrument(smooth, smoothFeel, {}, 'chord')).toBe('rhodesWarm');
  });
});
