import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { CONTEMPLATIVE_PRODUCTION_IDS } from './ambientContemplativeProduction.js';
import { getPercussionVoiceKit } from './sound.js';

function chain(id) {
  const feel = structuredFeel(AMBIENT_THEMES[id]);
  return [
    feel.leadInstrument,
    feel.counterInstrument,
    feel.chordInstrument,
    feel.bassInstrument,
    feel.percussion?.kit,
    feel.finish?.name,
  ].join('/');
}

describe('contemplative production', () => {
  it('assigns an authored acoustic finish to every selected room', () => {
    expect(CONTEMPLATIVE_PRODUCTION_IDS).toHaveLength(12);
    for (const id of CONTEMPLATIVE_PRODUCTION_IDS) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);
      expect(feel.finish?.name).toBeTruthy();
      expect(feel.finish?.brightness).toBeGreaterThanOrEqual(0.7);
      expect(feel.finish?.reflectionScale).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('separates the cassette, window and notebook bands', () => {
    const ids = ['lofiRainTape', 'lofiWindowLight', 'lofiPawnNotebook'];
    expect(new Set(ids.map(chain)).size).toBe(3);
    expect(ids.map((id) => getPercussionVoiceKit(id))).toEqual([
      'lofi-cassette-rain',
      'lofi-window-brush',
      'lofi-pencil-brush',
    ]);
    expect(structuredFeel(AMBIENT_THEMES.lofiWindowLight).counterInstrument).toBe('nylonGuitar');
  });

  it('keeps zen sparse while distinguishing cedar, wood and water', () => {
    const mist = structuredFeel(AMBIENT_THEMES.mistSpa);
    const onsen = structuredFeel(AMBIENT_THEMES.moonOnsen);
    const courtyard = structuredFeel(AMBIENT_THEMES.zenCourtyard0408);
    expect(new Set(['mistSpa', 'moonOnsen', 'zenCourtyard0408'].map(chain)).size).toBe(3);
    expect(mist.percussion.kit).toBe('none');
    expect(onsen.percussion.kit).toBe('onsen-water');
    expect(courtyard.percussion.kit).toBe('none');
    expect(mist.signature.instrument).toBe('cedarFlute');
    expect(onsen.signature.instrument).toBe('glass');
  });

  it('gives the four piano rooms different performance fingerprints', () => {
    const ids = ['fourSquares', 'verticalRainPiano', 'rainOnE4', 'sixtyFourKeys'];
    expect(new Set(ids.map(chain)).size).toBe(4);
    expect(structuredFeel(AMBIENT_THEMES.rainOnE4).leadInstrument).toBe('tapePiano');
    expect(structuredFeel(AMBIENT_THEMES.verticalRainPiano).leadInstrument).toBe('feltGrand');
    expect(structuredFeel(AMBIENT_THEMES.fourSquares).signature.instrument).toBe('pizz');
  });
});
