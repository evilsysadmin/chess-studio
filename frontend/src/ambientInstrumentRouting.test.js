import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import {
  ORGANIC_IBERIAN_ROUTING_IDS,
  ORGANIC_LATIN_ROUTING_IDS,
  ORGANIC_MEDITERRANEAN_ROUTING_IDS,
  structuredSectionInstrument,
} from './ambientInstrumentRouting.js';

const SYNTHETIC_PLUCKS = new Set(['oudJazz', 'qanun', 'buzuq']);

function expectedWrittenPlayer(theme, feel, section, lane) {
  const authored = section?.[`${lane}Instrument`];
  let expected = authored || feel?.[`${lane}Instrument`] || theme?.[`${lane}Instrument`] || (lane === 'counter' ? theme?.leadInstrument : undefined);
  if (authored === 'brass' && ['Smooth Jazz', 'Jazz / Mediterráneo'].includes(theme?.genre)) expected = 'mutedHorn';
  if (authored === 'epiano' && feel?.[`${lane}Instrument`] === 'rhodesWarm') expected = 'rhodesWarm';
  if (authored === 'guitar2') {
    if (theme?.genre === 'Smooth Jazz' || [feel?.leadInstrument, feel?.counterInstrument].includes('jazzGuitar')) expected = 'jazzGuitar';
    if (theme?.genre === 'Bossa / Latin Lounge' || [feel?.leadInstrument, feel?.counterInstrument].includes('nylonGuitar')) expected = 'nylonGuitar';
  }
  if (ORGANIC_MEDITERRANEAN_ROUTING_IDS.includes(theme?.id) && SYNTHETIC_PLUCKS.has(expected)) expected = 'nylonGuitar';
  if (ORGANIC_IBERIAN_ROUTING_IDS.includes(theme?.id) && expected === 'oudJazz' && ['lead', 'counter'].includes(lane)) expected = 'jazzGuitar';
  if (ORGANIC_LATIN_ROUTING_IDS.includes(theme?.id) && expected === 'bandoneon' && ['lead', 'counter'].includes(lane)) expected = 'nylonGuitar';
  return expected;
}

describe('radio section instrument routing', () => {
  it('lets the written soloists exchange places while organicizing continuous regional plucks', () => {
    for (const id of ['istanbul0326', 'istanbulBackgammon', 'beirut0113', 'terraceFireflies']) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);
      const dialogue = theme.sections.find((section) => section.leadInstrument && section.counterInstrument);
      expect(dialogue, `${id} must contain the authored exchange`).toBeTruthy();
      expect(structuredSectionInstrument(theme, feel, dialogue, 'lead')).toBe(expectedWrittenPlayer(theme, feel, dialogue, 'lead'));
      expect(structuredSectionInstrument(theme, feel, dialogue, 'counter')).toBe(expectedWrittenPlayer(theme, feel, dialogue, 'counter'));
      expect(structuredSectionInstrument(theme, feel, theme.sections[0], 'lead')).toBe(expectedWrittenPlayer(theme, feel, theme.sections[0], 'lead'));
    }
  });

  it('keeps oscillator plucks out of continuous Mediterranean lanes', () => {
    for (const id of ORGANIC_MEDITERRANEAN_ROUTING_IDS) {
      const theme = AMBIENT_THEMES[id];
      expect(theme, id).toBeTruthy();
      const feel = structuredFeel(theme);
      for (const section of [{}, ...(theme.sections || [])]) {
        for (const lane of ['lead', 'counter']) {
          const instrument = structuredSectionInstrument(theme, feel, section, lane);
          expect(SYNTHETIC_PLUCKS.has(instrument), `${id}:${lane}:${instrument}`).toBe(false);
        }
      }
    }
  });

  it('keeps Oud Trench dry oud colour out of the continuous lead lane', () => {
    const theme = AMBIENT_THEMES.oudTrench;
    const feel = structuredFeel(theme);
    expect(ORGANIC_MEDITERRANEAN_ROUTING_IDS).toContain('oudTrench');
    expect(feel.leadInstrument).toBe('oudJazz');
    expect(structuredSectionInstrument(theme, feel, {}, 'lead')).toBe('nylonGuitar');
  });

  it('routes Havana away from the short oscillator bandoneon without changing tango globally', () => {
    const havana = AMBIENT_THEMES.havana205;
    const feel = structuredFeel(havana);
    expect(ORGANIC_LATIN_ROUTING_IDS).toContain('havana205');
    expect(structuredSectionInstrument(havana, feel, {}, 'lead')).toBe('nylonGuitar');
    expect(structuredSectionInstrument(havana, feel, havana.sections[0], 'lead')).toBe('nylonGuitar');

    const tango = AMBIENT_THEMES.kingTango;
    const tangoFeel = structuredFeel(tango);
    expect(structuredSectionInstrument(tango, tangoFeel, {}, 'lead')).toBe('bandoneon');
  });

  it('keeps Andalusian Coast on two modelled guitar bodies instead of oscillator oud/guitar', () => {
    const coast = AMBIENT_THEMES.andalusianCoast;
    const feel = structuredFeel(coast);
    expect(ORGANIC_IBERIAN_ROUTING_IDS).toContain('andalusianCoast');
    expect(structuredSectionInstrument(coast, feel, coast.sections[1], 'lead')).toBe('jazzGuitar');
    expect(structuredSectionInstrument(coast, feel, coast.sections[1], 'counter')).toBe('nylonGuitar');
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
