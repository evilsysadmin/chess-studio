import { describe, expect, it } from 'vitest';
import {
  matthiasHomeShouldCycleAmbient,
  matthiasHomeShouldRunClock,
} from './MatthiasHomeVisit.jsx';

describe('Matthias Home timer policy', () => {
  it('duerme reloj y carrusel cuando la pestaña está oculta', () => {
    expect(matthiasHomeShouldRunClock({ documentVisible: true })).toBe(true);
    expect(matthiasHomeShouldRunClock({ documentVisible: false })).toBe(false);
    expect(matthiasHomeShouldCycleAmbient({ documentVisible: true, sceneCount: 3 })).toBe(true);
    expect(matthiasHomeShouldCycleAmbient({ documentVisible: false, sceneCount: 3 })).toBe(false);
  });

  it('no cicla mientras habla, con reduced-motion o sin escenas alternativas', () => {
    expect(matthiasHomeShouldCycleAmbient({ documentVisible: true, speaking: true, sceneCount: 3 })).toBe(false);
    expect(matthiasHomeShouldCycleAmbient({ documentVisible: true, reducedMotion: true, sceneCount: 3 })).toBe(false);
    expect(matthiasHomeShouldCycleAmbient({ documentVisible: true, sceneCount: 1 })).toBe(false);
  });
});
