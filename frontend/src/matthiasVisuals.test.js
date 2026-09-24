import { describe, expect, it } from 'vitest';
import {
  MATTHIAS_BASE_AVATAR,
  matthiasAmbientVisual,
  matthiasAmbientVisuals,
  matthiasHomeStation,
  matthiasHomeZone,
  matthiasMoodAvatar,
  matthiasRoutineDwellMs,
  matthiasTimeVisual,
} from './matthiasVisuals.js';

describe('Matthias visual identity', () => {
  it('mantiene cara de pocos amigos en todos los estados no-enfadado', () => {
    expect(matthiasMoodAvatar('observant')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('satisfied')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('pleased')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('skeptical')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('impressed')).toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasMoodAvatar('annoyed')).not.toBe(MATTHIAS_BASE_AVATAR);
  });

  it('usa las escenas de café completas en mañana y turno nocturno', () => {
    expect(matthiasTimeVisual(6).key).toBe('morning-coffee');
    expect(matthiasTimeVisual(21).key).toBe('night-coffee');
    expect(matthiasTimeVisual(6).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
    expect(matthiasTimeVisual(21).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
  });

  it('resuelve un avatar visible para todas las horas, incluida la escena de las 15', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(matthiasTimeVisual(hour).avatar, `hour ${hour}`).toBeTruthy();
    }
    expect(matthiasTimeVisual(15).key).toBe('chess-inception');
    expect(matthiasTimeVisual(15).avatar).not.toBe(MATTHIAS_BASE_AVATAR);
  });

  it('expone escenas ambientales canónicas reutilizables por microeventos', () => {
    const reading = matthiasAmbientVisual('reading');
    const dossier = matthiasAmbientVisual('dossier');
    expect(reading.key).toBe('reading');
    expect(reading.avatar).toBeTruthy();
    expect(dossier.key).toBe('dossier');
    expect(dossier.avatar).toBeTruthy();
    expect(matthiasAmbientVisual('no-existe').key).toBe('base');
  });

  it('varía el orden visible por día sin rerollear al recargar', () => {
    const date = (day) => ({
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => day,
    });
    const keys = (day) => matthiasAmbientVisuals(16, date(day)).map((scene) => scene.key);
    const firstVisit = keys(13);
    const reloadSameDay = keys(13);
    const nextDay = keys(14);

    expect(firstVisit).toEqual(reloadSameDay);
    expect(firstVisit[0]).toBe('time-afternoon-ops');
    expect(nextDay[0]).toBe('time-afternoon-ops');
    expect(firstVisit.slice(1)).not.toEqual(nextDay.slice(1));
    expect([...firstVisit.slice(1)].sort()).toEqual([...nextDay.slice(1)].sort());
    expect(new Set(firstVisit).size).toBe(firstVisit.length);
    expect(new Set(nextDay).size).toBe(nextDay.length);
  });

  it('mantiene cada actividad un tiempo natural en lugar de rotar como un carrusel fijo', () => {
    const base = matthiasRoutineDwellMs('base');
    const coffee = matthiasRoutineDwellMs('time-morning-coffee');
    const ops = matthiasRoutineDwellMs('time-chess-inception');
    const dossier = matthiasRoutineDwellMs({ key: 'moment-loss-dossier' });
    const reading = matthiasRoutineDwellMs('time-chess-weekly');
    const sleep = matthiasRoutineDwellMs('moment-book-doze-sleep');

    expect(base).toBe(34_000);
    expect(coffee).toBe(38_000);
    expect(ops).toBe(42_000);
    expect(dossier).toBe(44_000);
    expect(reading).toBe(48_000);
    expect(sleep).toBe(64_000);
    expect(new Set([base, coffee, ops, dossier, reading, sleep]).size).toBe(6);
  });

  it('bloquea Sobando durante toda la madrugada y no activa el carrusel sonámbulo', () => {
    for (let hour = 0; hour < 6; hour += 1) {
      const scenes = matthiasAmbientVisuals(hour);
      expect(scenes, `hour ${hour}`).toHaveLength(1);
      expect(scenes[0].key, `hour ${hour}`).toBe('time-late-sleep');
      expect(scenes[0].label, `hour ${hour}`).toBe('Sobando');
    }

    const reveille = matthiasAmbientVisuals(6);
    expect(reveille.length).toBeGreaterThan(1);
    expect(reveille[0].key).toBe('time-morning-coffee');
  });

  it('sitúa cada actividad en una zona coherente del gran salón', () => {
    expect(matthiasHomeZone('time-morning-coffee')).toBe('table');
    expect(matthiasHomeZone('time-breakfast-news')).toBe('table');
    expect(matthiasHomeZone('time-chess-inception')).toBe('desk');
    expect(matthiasHomeZone('dossier')).toBe('desk');
    expect(matthiasHomeZone('reading')).toBe('library');
    expect(matthiasHomeZone('time-chess-weekly')).toBe('library');
    expect(matthiasHomeZone('time-late-sleep')).toBe('rest');
    expect(matthiasHomeZone('base')).toBe('watch');
  });

  it('ancla cada rutina junto al mueble que explica la actividad', () => {
    expect(matthiasHomeStation('time-chess-inception')).toBe('chess-chair');
    expect(matthiasHomeStation('moment-solo-board-inception')).toBe('chess-chair');
    expect(matthiasHomeStation('time-morning-coffee')).toBe('refreshment-table');
    expect(matthiasHomeStation('time-lunch-bocata')).toBe('dining-table');
    expect(matthiasHomeStation('time-strategy-book')).toBe('library-chair');
    expect(matthiasHomeStation('moment-loss-dossier')).toBe('writing-desk');
    expect(matthiasHomeStation('time-late-sleep')).toBe('rest');
    expect(matthiasHomeStation('base')).toBe('watch-post');
  });
});
