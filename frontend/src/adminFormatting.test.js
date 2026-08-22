import { describe, expect, it } from 'vitest';
import { formatAdminDate, formatAdminTimestamp } from './adminFormatting.js';

describe('formato temporal del panel admin', () => {
  it('usa español y reloj de 24 horas sin AM/PM', () => {
    const text = formatAdminTimestamp('2026-08-22T21:07:09');
    expect(text).toMatch(/22\/08\/2026/);
    expect(text).toMatch(/21:07:09/);
    expect(text).not.toMatch(/\b(?:AM|PM)\b/i);
  });

  it('mantiene fecha española y tolera valores ausentes o inválidos', () => {
    expect(formatAdminDate('2026-08-22T21:07:09')).toBe('22/08/2026');
    expect(formatAdminTimestamp(null)).toBe('—');
    expect(formatAdminTimestamp('esto-no-es-fecha')).toBe('—');
  });
});
