import { describe, expect, it } from 'vitest';
import { formatAdminDate, formatAdminTimestamp, sortAdminUsers } from './adminFormatting.js';

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

  it('ordena primero online y después por última conexión más reciente', () => {
    const users = [
      { username: 'old-offline', presence: 'offline', lastActivity: '2026-08-20T10:00:00Z' },
      { username: 'new-offline', presence: 'offline', lastActivity: '2026-08-23T10:00:00Z' },
      { username: 'old-online', presence: 'online', lastActivity: '2026-08-22T10:00:00Z' },
      { username: 'new-online', presence: 'online', lastActivity: '2026-08-23T11:00:00Z' },
    ];
    expect(sortAdminUsers(users).map((user) => user.username)).toEqual([
      'new-online', 'old-online', 'new-offline', 'old-offline',
    ]);
  });

});
