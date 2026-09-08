import { describe, expect, it, vi } from 'vitest';
import { createClockRuntime } from './clockRuntime.js';

describe('clock runtime aislado', () => {
  it('publica únicamente cuando cambia el reloj y conserva ambos tiempos', () => {
    const runtime = createClockRuntime({ whiteTime: 180, blackTime: 180, tickingColor: 'w' });
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);

    runtime.advance('w', 0.2);
    expect(runtime.getSnapshot()).toMatchObject({ whiteTime: 179.8, blackTime: 180, tickingColor: 'w' });
    expect(listener).toHaveBeenCalledTimes(1);

    runtime.setTickingColor('w');
    expect(listener).toHaveBeenCalledTimes(1);

    runtime.addIncrement('b', 2);
    expect(runtime.getTime('b')).toBe(182);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    runtime.advance('b', 1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('detiene la señal activa al caer una bandera', () => {
    const runtime = createClockRuntime({ whiteTime: 0.1, blackTime: 12, tickingColor: 'w' });
    runtime.advance('w', 0.3);
    runtime.setFlagFallen('w');

    expect(runtime.getSnapshot()).toEqual({
      whiteTime: 0,
      blackTime: 12,
      tickingColor: null,
      flagFallen: 'w',
    });
  });
});
