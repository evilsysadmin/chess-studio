import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installWarRoomHansElderClock,
  WAR_ROOM_HANS_ELDER_CLOCK_VERSION,
  WAR_ROOM_HANS_ELDER_CRUISE_SPEED,
  warRoomHansClockRateCeiling,
} from './WarRoomHansElderClock.js';

function makeHarness() {
  const hans = {
    name: 'war-room-hans-butler',
    position: { x: 0, y: 0, z: 0 },
    userData: {
      warRoomHansMotionState: 'walk',
      warRoomHansRoute: 'entry',
    },
  };
  const driver = {
    name: 'war-room-hans-fireplace-driver',
    userData: {
      warRoomHansPhase: 'fire-dimming',
      warRoomHansQuickIteration: 'forced-test',
    },
    onBeforeRender: null,
  };
  const root = {
    getObjectByName(name) {
      if (name === hans.name) return hans;
      if (name === driver.name) return driver;
      return null;
    },
  };
  return { root, hans, driver };
}

function stageKey(stage) {
  return stage.route || stage.phase;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Hans elder cruise clock', () => {
  it('mantiene un único techo de velocidad aunque cada tramo fuente intente correr distinto', () => {
    let realNow = 1_000;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => realNow);
    const { root, hans, driver } = makeHarness();

    let sourceSpeed = 1.051;
    let syntheticPrevious = globalThis.performance.now();
    driver.onBeforeRender = () => {
      const syntheticNow = globalThis.performance.now();
      const delta = Math.max(0, (syntheticNow - syntheticPrevious) / 1000);
      syntheticPrevious = syntheticNow;
      hans.position.x += sourceSpeed * delta;
      hans.userData.warRoomHansMotionState = 'walk';
    };

    expect(installWarRoomHansElderClock(root)).toBe(1);
    expect(driver.userData.warRoomHansElderClock).toBe(WAR_ROOM_HANS_ELDER_CLOCK_VERSION);
    expect(driver.userData.warRoomHansCruiseSpeed).toBe(WAR_ROOM_HANS_ELDER_CRUISE_SPEED);
    expect(driver.userData.warRoomHansClockPolicy).toBe('single-elder-cruise-v1');

    const stages = [
      { phase: 'fire-dimming', route: 'entry', sourceSpeed: 1.051 },
      { phase: 'carry-log', route: null, sourceSpeed: 0.779 },
      { phase: 'take-poker', route: null, sourceSpeed: 1.498 },
      { phase: 'stoke-fire', route: null, sourceSpeed: 1.152 },
      { phase: 'return-poker', route: null, sourceSpeed: 1.728 },
      { phase: 'leave', route: 'leave-side', sourceSpeed: 1.984 },
      { phase: 'leave', route: 'leave-bypass', sourceSpeed: 1.395 },
      { phase: 'leave', route: 'leave-door', sourceSpeed: 0.924 },
    ];

    const measured = new Map();
    for (const stage of stages) {
      driver.userData.warRoomHansPhase = stage.phase;
      hans.userData.warRoomHansRoute = stage.route;
      sourceSpeed = stage.sourceSpeed;
      const speeds = [];
      for (let frame = 0; frame < 90; frame += 1) {
        const before = hans.position.x;
        realNow += 1000 / 60;
        driver.onBeforeRender();
        speeds.push(Math.abs(hans.position.x - before) * 60);
      }
      measured.set(stageKey(stage), speeds);
    }

    for (const [stage, speeds] of measured) {
      const max = Math.max(...speeds);
      const settled = speeds.slice(-30).reduce((sum, value) => sum + value, 0) / 30;
      expect(max, `${stage} no debe tener turbo`).toBeLessThanOrEqual(WAR_ROOM_HANS_ELDER_CRUISE_SPEED + 0.01);
      expect(settled, `${stage} debe converger al mismo paso de yayo`).toBeGreaterThan(0.40);
    }

    // The governor only owns the scoped Hans callback. Outside it, callers see
    // the real clock again rather than the synthetic one.
    expect(globalThis.performance.now()).toBe(realNow);
    expect(installWarRoomHansElderClock(root)).toBe(0);
  });

  it('conserva el reloj normal cuando Hans está parado haciendo una acción', () => {
    let realNow = 5_000;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => realNow);
    const { root, hans, driver } = makeHarness();
    hans.userData.warRoomHansMotionState = 'place-log';
    hans.userData.warRoomHansRoute = null;
    driver.userData.warRoomHansPhase = 'place-log';

    let syntheticPrevious = globalThis.performance.now();
    let observedStep = 0;
    driver.onBeforeRender = () => {
      const syntheticNow = globalThis.performance.now();
      observedStep = syntheticNow - syntheticPrevious;
      syntheticPrevious = syntheticNow;
    };

    expect(installWarRoomHansElderClock(root)).toBe(1);
    realNow += 100;
    driver.onBeforeRender();
    expect(observedStep).toBeCloseTo(100, 5);
  });

  it('usa techos más bajos en la rutina ambiental que no trae el 0.54x incorporado', () => {
    const quick = warRoomHansClockRateCeiling({ phase: 'leave', route: 'leave-bypass', quick: true });
    const ambient = warRoomHansClockRateCeiling({ phase: 'leave', route: 'leave-bypass', quick: false });
    expect(quick).toBeCloseTo(0.32, 6);
    expect(ambient).toBeCloseTo(quick * 0.54, 6);
  });
});
