import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { exportProfile, importProfile, pullProfileFromServer, pushProfileToServer } from './profileBackup.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('exportProfile', () => {
  it('incluye el progreso persistente pero no la partida activa', () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 100 }));
    localStorage.setItem('chess-study-active-game', 'algun-id');
    const exported = exportProfile();
    expect(exported.data['chess-study-tournament']).toBeDefined();
    expect(exported.data['chess-study-active-game']).toBeUndefined();
  });

  it('incluye logros y puzzles resueltos (bug encontrado: faltaban en la lista exportable)', () => {
    localStorage.setItem('chess-study-achievements', JSON.stringify(['first_game']));
    localStorage.setItem('chess-study-puzzles-solved', '5');
    const exported = exportProfile();
    expect(exported.data['chess-study-achievements']).toBeDefined();
    expect(exported.data['chess-study-puzzles-solved']).toBe('5');
  });

  it('incluye el historial de combate y el caché de peor jugada (mismo bug otra vez: el historial de batallas nunca estuvo en la lista, solo el roster/ejército)', () => {
    localStorage.setItem('chess-study-combat-history', JSON.stringify([{ id: 'c1' }]));
    localStorage.setItem('chess-study-worst-move-cache', JSON.stringify({ g1: { worst: null } }));
    const exported = exportProfile();
    expect(exported.data['chess-study-combat-history']).toBeDefined();
    expect(exported.data['chess-study-worst-move-cache']).toBeDefined();
  });

  it('incluye el historial de rating, la racha de puzzles, y la skin/título elegidos (tercera vuelta del mismo bug: features nuevas de esta sesión que quedaron fuera de la lista sin querer)', () => {
    localStorage.setItem('chess-study-rating-history', JSON.stringify([600, 620, 615]));
    localStorage.setItem('chess-study-puzzle-streak', '7');
    localStorage.setItem('chess-study-puzzle-best-streak', '12');
    localStorage.setItem('chess-study-selected-title', 'estratega');
    localStorage.setItem('chess-study-selected-skin', 'azul');
    const exported = exportProfile();
    expect(exported.data['chess-study-rating-history']).toBeDefined();
    expect(exported.data['chess-study-puzzle-streak']).toBe('7');
    expect(exported.data['chess-study-puzzle-best-streak']).toBe('12');
    expect(exported.data['chess-study-selected-title']).toBe('estratega');
    expect(exported.data['chess-study-selected-skin']).toBe('azul');
  });
});

describe('importProfile', () => {
  it('restaura las claves guardadas en el export (desde string)', () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 250 }));
    const exported = exportProfile();
    localStorage.clear();
    expect(localStorage.getItem('chess-study-tournament')).toBeNull();

    const restored = importProfile(JSON.stringify(exported));
    expect(restored).toBe(1);
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 250 }));
  });

  it('también acepta un objeto ya parseado directamente (lo que devuelve el backend)', () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 400 }));
    const exported = exportProfile(); // objeto, no string
    localStorage.clear();

    const restored = importProfile(exported);
    expect(restored).toBe(1);
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 400 }));
  });

  it('rechaza un archivo que no es JSON', () => {
    expect(() => importProfile('no es json')).toThrow();
  });

  it('rechaza un JSON que no tiene la forma esperada', () => {
    expect(() => importProfile(JSON.stringify({ foo: 'bar' }))).toThrow();
  });
});

describe('pullProfileFromServer', () => {
  it('baja el perfil del backend y pisa localStorage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { 'chess-study-tournament': JSON.stringify({ points: 777 }) } }),
    }));

    const restored = await pullProfileFromServer();
    expect(restored).toBe(true);
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 777 }));
  });

  it('no rompe nada si el backend no tiene perfil guardado todavía', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const restored = await pullProfileFromServer();
    expect(restored).toBe(false);
  });

  it('no rompe nada si el backend no está disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin conexión')));
    const restored = await pullProfileFromServer();
    expect(restored).toBe(false);
  });
});

describe('pushProfileToServer', () => {
  it('manda el perfil actual al backend con PUT', async () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 300 }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await pushProfileToServer();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/profile');
    expect(options.method).toBe('PUT');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.data['chess-study-tournament']).toBe(JSON.stringify({ points: 300 }));
  });

  it('no revienta si el backend no está disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin conexión')));
    await expect(pushProfileToServer()).resolves.not.toThrow();
  });
});

describe('ciclo completo: exportar -> subir -> bajar -> importar', () => {
  it('lo que se sube es exactamente lo que se puede volver a bajar e importar', async () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 555, wins: 3 }));
    localStorage.setItem('chess-study-achievements', JSON.stringify(['first_game', 'ten_games']));

    let savedOnServer = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url, options) => {
      if (options?.method === 'PUT') {
        savedOnServer = JSON.parse(options.body);
        return Promise.resolve({ ok: true, json: async () => savedOnServer });
      }
      return Promise.resolve({ ok: true, json: async () => savedOnServer || {} });
    }));

    await pushProfileToServer();
    expect(savedOnServer).not.toBeNull();

    localStorage.clear(); // simulamos pisar la carpeta / limpiar el navegador
    const restored = await pullProfileFromServer();

    expect(restored).toBe(true);
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 555, wins: 3 }));
    expect(localStorage.getItem('chess-study-achievements')).toBe(JSON.stringify(['first_game', 'ten_games']));
  });
});
