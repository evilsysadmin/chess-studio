import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { getPercussionVoiceKit } from './sound.js';

function chain(id) {
  const theme = AMBIENT_THEMES[id];
  const feel = structuredFeel(theme);
  return [feel.leadInstrument, feel.counterInstrument, feel.chordInstrument, feel.bassInstrument, feel.percussion.kit, feel.percussion.period].join('/');
}

describe('ambient identity contrasts', () => {
  it('separates the two minimal-piano rooms by articulation and depth', () => {
    const rain = structuredFeel(AMBIENT_THEMES.rainOnE4);
    const keys = structuredFeel(AMBIENT_THEMES.sixtyFourKeys);

    expect(chain('rainOnE4')).not.toBe(chain('sixtyFourKeys'));
    expect(rain.counterInstrument).toBe('cello');
    expect(keys.counterInstrument).toBe('pizz');
    expect(rain.space).toBeGreaterThan(keys.space);
    expect(rain.releaseScale).toBeGreaterThan(keys.releaseScale);
    expect(rain.layers.signature).toBe(true);
    expect(Object.keys(rain.signature.motif)).toHaveLength(4);
  });

  it('turns Cafe Gambit into a guitar-led rim combo instead of Blue Lobby again', () => {
    const blue = structuredFeel(AMBIENT_THEMES.blueLobby);
    const cafe = structuredFeel(AMBIENT_THEMES.cafeGambit213);

    expect(chain('blueLobby')).not.toBe(chain('cafeGambit213'));
    expect(blue.leadInstrument).toBe('mutedHorn');
    expect(cafe.leadInstrument).toBe('jazzGuitar');
    expect(cafe.counterInstrument).toBe('mutedHorn');
    expect(cafe.percussion.kit).toBe('late-cafe-combo');
    expect(getPercussionVoiceKit('cafeGambit213')).toBe('late-cafe-combo');
    expect(cafe.percussion.period).toBe(24);
    expect(cafe.layers.signature).toBe(true);
    expect(cafe.signature.instrument).toBe('jazzGuitar');
  });
});
