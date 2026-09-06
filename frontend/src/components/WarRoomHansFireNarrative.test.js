import { describe, expect, it } from 'vitest';
import {
  installWarRoomHansFireNarrative,
  WAR_ROOM_HANS_FIRE_NARRATIVE_VERSION,
  warRoomHansNarrativeFireState,
} from './WarRoomHansFireNarrative.js';

function makeScale(x = 1, y = 1, z = 1) {
  return {
    x,
    y,
    z,
    set(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
    },
  };
}

function makeHarness() {
  const fireCore = {
    name: 'war-room-fire-core',
    visible: true,
    scale: makeScale(1, 1, 1),
  };
  const fireLight = {
    name: 'war-room-fire-light',
    intensity: 4,
    distance: 10,
    userData: { baseWarRoomIntensity: 4 },
  };
  const bounce = {
    name: 'war-room-fire-bounce-light',
    intensity: 2,
    userData: { hansBaseIntensity: 2 },
  };
  const fireplace = {
    name: 'war-room-fireplace',
    userData: {},
    getObjectByName(name) {
      if (name === fireCore.name) return fireCore;
      if (name === fireLight.name) return fireLight;
      if (name === bounce.name) return bounce;
      return null;
    },
  };
  const driver = {
    name: 'war-room-hans-fireplace-driver',
    userData: {
      warRoomHansQuickIteration: 'forced-test',
      warRoomHansPhase: 'fire-dimming',
    },
    onBeforeRender() {},
  };
  const root = {
    getObjectByName(name) {
      if (name === driver.name) return driver;
      if (name === fireplace.name) return fireplace;
      return null;
    },
  };
  return { root, driver, fireplace, fireCore, fireLight, bounce };
}

describe('Hans cold-hearth narrative', () => {
  it('mantiene la chimenea apagada mientras Hans entra, recoge la leña y prepara el atizador', () => {
    for (const phase of ['fire-dimming', 'walk-to-basket', 'take-log', 'carry-log', 'place-log', 'take-poker']) {
      const state = warRoomHansNarrativeFireState({ phase, sourceScale: 1 });
      expect(state.mode, `${phase} no puede apagar el fuego al acercarse Hans`).toBe('cold');
      expect(state.flameVisible).toBe(false);
      expect(state.lightScale).toBeLessThan(0.05);
    }
  });

  it('enciende el fuego de forma progresiva solo durante stoke-fire', () => {
    const start = warRoomHansNarrativeFireState({ phase: 'stoke-fire', sourceScale: 0.26 });
    const middle = warRoomHansNarrativeFireState({ phase: 'stoke-fire', sourceScale: 0.67 });
    const end = warRoomHansNarrativeFireState({ phase: 'stoke-fire', sourceScale: 1.08 });

    expect(start.mode).toBe('ignite');
    expect(start.flameScale).toBeLessThan(0.05);
    expect(middle.flameScale).toBeGreaterThan(start.flameScale);
    expect(end.flameScale).toBeGreaterThan(middle.flameScale);
    expect(end.lightScale).toBeCloseTo(1, 6);
  });

  it('instala el relato solo en la quick iteration y deja el primer frame ya frío', () => {
    const { root, driver, fireplace, fireCore, fireLight, bounce } = makeHarness();

    expect(installWarRoomHansFireNarrative(root)).toBe(1);
    expect(driver.userData.warRoomHansFireNarrative).toBe(WAR_ROOM_HANS_FIRE_NARRATIVE_VERSION);
    expect(driver.userData.warRoomHansFireNarrativePolicy).toBe('already-cold-then-rekindle-v1');
    expect(fireplace.userData.warRoomHansFireNarrativePhase).toBe('hearth-cold');
    expect(fireCore.visible).toBe(false);
    expect(fireLight.intensity).toBeCloseTo(4 * 0.035, 6);
    expect(fireLight.distance).toBeCloseTo(10 * 0.36, 6);
    expect(bounce.intensity).toBeCloseTo(2 * 0.025, 6);
    expect(installWarRoomHansFireNarrative(root)).toBe(0);
  });

  it('no se cuela en el cameo ambiental de Hans', () => {
    const { root, driver } = makeHarness();
    delete driver.userData.warRoomHansQuickIteration;
    expect(installWarRoomHansFireNarrative(root)).toBe(0);
  });
});
