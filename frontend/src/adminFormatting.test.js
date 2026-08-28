import { describe, expect, it } from 'vitest';
import { adminActivityTypeLabel, adminClientReleaseState, adminPresenceDisplayStatus, filterAdminUsers, formatAdminDate, formatAdminRefreshAge, formatAdminTimestamp, sortAdminUsers, summarizeAdminClientReleases, summarizeAdminPresence } from './adminFormatting.js';

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

  it('ordena primer plano, online e inactivos antes que conexiones antiguas', () => {
    const users = [
      { username: 'offline', presence: 'offline', lastActivity: '2026-08-23T12:00:00Z' },
      { username: 'idle', presence: 'idle', lastActivity: '2026-08-23T11:58:00Z' },
      { username: 'online', presence: 'online', foreground: false, lastActivity: '2026-08-23T11:57:00Z' },
      { username: 'foreground', presence: 'online', foreground: true, lastActivity: '2026-08-23T11:56:00Z' },
    ];
    expect(sortAdminUsers(users).map((user) => user.username)).toEqual([
      'foreground', 'online', 'idle', 'offline',
    ]);
  });

  it('clasifica releases reportadas sin asumir que toda diferencia es antigua', () => {
    expect(adminClientReleaseState('v16.6dm21', 'v16.6dm21')).toMatchObject({ id: 'current', label: 'Actual' });
    expect(adminClientReleaseState('v16.6dm19', 'v16.6dm21')).toMatchObject({ id: 'outdated', label: 'Antigua' });
    expect(adminClientReleaseState('v16.6dm22', 'v16.6dm21')).toMatchObject({ id: 'newer', label: 'Más nueva' });
    expect(adminClientReleaseState(null, 'v16.6dm21')).toMatchObject({ id: 'unknown', label: 'Sin dato' });
    expect(adminClientReleaseState('v16.6dm46zfa', 'v16.6dm46zfb')).toMatchObject({ id: 'outdated', label: 'Antigua' });
    expect(adminClientReleaseState('v16.6dm46zfc', 'v16.6dm46zfb')).toMatchObject({ id: 'newer', label: 'Más nueva' });
  });

  it('filtra rápidamente por presencia y por actividad gruesa', () => {
    const users = [
      { username: 'ana', presence: 'online', foreground: true, currentActivity: 'Partida' },
      { username: 'bea', presence: 'online', foreground: false, currentActivity: 'Combat Chess' },
      { username: 'cora', presence: 'idle', foreground: false, currentActivity: 'Torneo' },
      { username: 'dani', presence: 'recent', foreground: false, currentActivity: 'Así juegas' },
      { username: 'eva', presence: 'offline', foreground: false, currentActivity: 'Combat Chess' },
    ];
    expect(filterAdminUsers(users, 'foreground').map((u) => u.username)).toEqual(['ana']);
    expect(filterAdminUsers(users, 'online').map((u) => u.username)).toEqual(['ana', 'bea']);
    expect(filterAdminUsers(users, 'idle').map((u) => u.username)).toEqual(['cora']);
    expect(filterAdminUsers(users, 'combat').map((u) => u.username)).toEqual(['bea']);
    expect(filterAdminUsers(users, 'tournament').map((u) => u.username)).toEqual(['cora']);
    expect(filterAdminUsers(users, 'insights').map((u) => u.username)).toEqual(['dani']);
  });



  it('presenta segundo plano como online y reserva idle para una sesión realmente inactiva', () => {
    expect(adminPresenceDisplayStatus({ presence: 'online', foreground: false })).toBe('online');
    expect(adminPresenceDisplayStatus({ presence: 'idle', foreground: false })).toBe('idle');
    expect(adminPresenceDisplayStatus({ foreground: false })).toBe('never');
  });

  it('un usuario online en segundo plano sigue sumando en línea pero no en primer plano', () => {
    expect(summarizeAdminPresence([
      { username: 'admin', presence: 'online', foreground: true },
      { username: 'tab-background', presence: 'online', foreground: false },
    ], 'admin')).toEqual({ foreground: 0, online: 1, idle: 0 });
  });

  it('resume presencia sin confundir segundo plano con offline o inactividad', () => {
    expect(summarizeAdminPresence([
      { username: 'admin', presence: 'online', foreground: true },
      { username: 'ana', presence: 'online', foreground: true },
      { username: 'bea', presence: 'online', foreground: false },
      { username: 'cora', presence: 'idle', foreground: false },
      { username: 'dani', presence: 'offline', foreground: false },
    ], 'admin')).toEqual({ foreground: 1, online: 2, idle: 1 });
  });

  it('explica cuándo se refrescó Admin con una edad compacta', () => {
    const now = 1_000_000;
    expect(formatAdminRefreshAge(null, now)).toBe('sin actualizar');
    expect(formatAdminRefreshAge(now - 2_000, now)).toBe('ahora');
    expect(formatAdminRefreshAge(now - 18_000, now)).toBe('hace 18 s');
    expect(formatAdminRefreshAge(now - 125_000, now)).toBe('hace 2 min');
  });


  it('resume versiones de clientes sin contar al admin actual', () => {
    expect(summarizeAdminClientReleases([
      { username:'admin', clientRelease:'v16.6dm43t' },
      { username:'ana', clientRelease:'v16.6dm43t' },
      { username:'bea', clientRelease:'v16.6dm43n' },
      { username:'cora', clientRelease:null },
    ], 'admin', 'v16.6dm43t')).toEqual({ current:1, outdated:1, newer:0, different:0, unknown:1 });
  });


  it('no enseña slugs internos en Actividad reciente', () => {
    expect(adminActivityTypeLabel({ type: 'contract-loss' })).toBe('Reto fallido');
    expect(adminActivityTypeLabel({ type: 'contract-win' })).toBe('Reto superado');
    expect(adminActivityTypeLabel({ type: 'weird-old-event' })).toBe('Weird old event');
    expect(adminActivityTypeLabel({ type: 'contract-loss', modeLabel: 'Ejecución sumaria' })).toBe('Ejecución sumaria');
  });

});
