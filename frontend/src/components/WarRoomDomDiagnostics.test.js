import { describe, expect, it } from 'vitest';
import {
  applyWarRoomHansScreenDiagnostics,
  applyWarRoomLightDiagnostics,
} from './WarRoomDomDiagnostics.js';

function fakeElement() {
  const attributes = new Map();
  let writes = 0;
  return {
    dataset: {},
    getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
    hasAttribute: (name) => attributes.has(name),
    setAttribute: (name, value) => {
      writes += 1;
      attributes.set(name, String(value));
    },
    writes: () => writes,
  };
}

describe('War Room differential DOM diagnostics', () => {
  it('does not rewrite stable light diagnostics every render', () => {
    const canvas = fakeElement();
    expect(applyWarRoomLightDiagnostics(canvas, { keyIntensity: 5.234, exposure: 1.0178 })).toBe(3);
    expect(canvas.dataset.warRoomLightGrade).toBe('reactive-v9');
    expect(canvas.dataset.warRoomLightKey).toBe('5.23');
    expect(canvas.dataset.warRoomLightExposure).toBe('1.018');

    expect(applyWarRoomLightDiagnostics(canvas, { keyIntensity: 5.234, exposure: 1.0178 })).toBe(0);
    expect(applyWarRoomLightDiagnostics(canvas, { keyIntensity: 5.44, exposure: 1.0178 })).toBe(1);
  });

  it('writes Hans marker state only on a real state/value transition', () => {
    const canvas = fakeElement();
    const marker = fakeElement();
    const projected = { x: 0.12345, y: -0.45678 };

    const firstWrites = applyWarRoomHansScreenDiagnostics({
      canvas,
      marker,
      screenState: 'onscreen',
      projected,
    });
    expect(firstWrites).toBe(6);
    expect(marker.getAttribute('data-war-room-hans-screen')).toBe('onscreen');
    expect(marker.getAttribute('data-war-room-hans-first-screen')).toBe('onscreen');
    const markerWrites = marker.writes();

    expect(applyWarRoomHansScreenDiagnostics({
      canvas,
      marker,
      screenState: 'onscreen',
      projected,
    })).toBe(0);
    expect(marker.writes()).toBe(markerWrites);
  });

  it('preserves the first visible screen while current state can change', () => {
    const canvas = fakeElement();
    const marker = fakeElement();

    applyWarRoomHansScreenDiagnostics({ canvas, marker, screenState: 'onscreen', projected: { x: 0, y: 0 } });
    applyWarRoomHansScreenDiagnostics({ canvas, marker, screenState: 'offscreen', projected: { x: 1.2, y: 0.2 } });

    expect(canvas.dataset.warRoomHansScreen).toBe('offscreen');
    expect(canvas.dataset.warRoomHansFirstScreen).toBe('onscreen');
    expect(marker.getAttribute('data-war-room-hans-screen')).toBe('offscreen');
    expect(marker.getAttribute('data-war-room-hans-first-screen')).toBe('onscreen');
  });

  it('keeps the last projected NDC when Hans becomes hidden, matching the existing QA contract', () => {
    const canvas = fakeElement();
    applyWarRoomHansScreenDiagnostics({
      canvas,
      screenState: 'onscreen',
      projected: { x: 0.2222, y: -0.3333 },
    });
    applyWarRoomHansScreenDiagnostics({ canvas, screenState: 'hidden' });

    expect(canvas.dataset.warRoomHansScreen).toBe('hidden');
    expect(canvas.dataset.warRoomHansNdcX).toBe('0.222');
    expect(canvas.dataset.warRoomHansNdcY).toBe('-0.333');
  });
});
