import { describe, it, expect } from 'vitest';
import { flagOutcome, flagPgnResult, formatClock, timeControlById, TIME_CONTROLS } from './clock.js';

describe('formatClock', () => {
  it('formatea segundos como m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
  });

  it('nunca muestra negativo', () => {
    expect(formatClock(-30)).toBe('0:00');
  });

  it('agrega horas si pasa de 3600 segundos', () => {
    expect(formatClock(3661)).toBe('1:01:01');
  });
});

describe('timeControlById', () => {
  it('encuentra el control por id', () => {
    expect(timeControlById('5+0').initial).toBe(300);
  });

  it('cae a "sin reloj" si el id no existe', () => {
    expect(timeControlById('inventado')).toBe(TIME_CONTROLS[0]);
    expect(timeControlById('inventado').initial).toBeNull();
  });
});


describe('bandera y material de mate', () => {
  it('da victoria/derrota normal si el rival conserva material de mate', () => {
    expect(flagOutcome('w', 'w', { w: false, b: false })).toBe('loss');
    expect(flagOutcome('b', 'w', { w: false, b: false })).toBe('win');
    expect(flagPgnResult('w', { w: false, b: false })).toBe('0-1');
  });

  it('declara tablas si el bando con tiempo no puede dar mate', () => {
    expect(flagOutcome('w', 'w', { w: false, b: true })).toBe('draw');
    expect(flagOutcome('b', 'w', { w: true, b: false })).toBe('draw');
    expect(flagPgnResult('w', { w: false, b: true })).toBe('1/2-1/2');
  });
});
