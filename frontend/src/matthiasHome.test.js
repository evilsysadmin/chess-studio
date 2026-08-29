import { beforeEach, describe, expect, it } from 'vitest';
import {
  MATTHIAS_HOME_COOLDOWN_MS,
  MATTHIAS_ONBOARDED_KEY,
  MATTHIAS_ONBOARDED_VERSION,
  buildMatthiasHomeCardModel,
  buildMatthiasHomeVisit,
  buildMatthiasIntroVisit,
  buildMatthiasLoginGreeting,
  markMatthiasHomeShown,
  matthiasMoodPresentation,
  markMatthiasOnboarded,
  matthiasIntroPlacement,
  matthiasOnboarded,
  matthiasHomeLastShownAt,
  matthiasHomeSessionSeen,
  shouldShowMatthiasHome,
} from './matthiasHome.js';
import { consumeMatthiasLoginGreeting, matthiasLoginGreetingPending, queueMatthiasLoginGreeting } from './matthiasSession.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('chess-study-auth-username', 'tester');
});


describe('Matthias en Home', () => {
  it('repara perfiles legacy marcados prematuramente con onboarding v1', () => {
    localStorage.setItem(MATTHIAS_ONBOARDED_KEY, '1');
    expect(matthiasOnboarded()).toBe(false);
    markMatthiasOnboarded();
    expect(matthiasOnboarded()).toBe(true);
  });

  it('deja que Matthias lidere la guía inicial sin apilar otra presentación', () => {
    expect(matthiasIntroPlacement({ onboarded: false, guideEnabled: true, guideVisible: true, blocked: false })).toBe('guide');
    expect(matthiasIntroPlacement({ onboarded: false, guideEnabled: false, guideVisible: true, blocked: false })).toBe('visit');
    expect(matthiasIntroPlacement({ onboarded: false, guideEnabled: true, guideVisible: false, blocked: false })).toBe('visit');
    expect(matthiasIntroPlacement({ onboarded: false, guideEnabled: true, guideVisible: true, blocked: true })).toBe('none');
    expect(matthiasIntroPlacement({ onboarded: true, guideEnabled: true, guideVisible: true, blocked: false })).toBe('none');
  });

  it('cubre la matriz de entrada: nuevo con guía, nuevo sin guía, legacy v1 y ya presentado', () => {
    expect(matthiasIntroPlacement({ onboarded: false, guideEnabled: true, guideVisible: true, blocked: false })).toBe('guide');
    expect(matthiasIntroPlacement({ onboarded: false, guideEnabled: false, guideVisible: false, blocked: false })).toBe('visit');

    localStorage.setItem(MATTHIAS_ONBOARDED_KEY, '1');
    expect(matthiasOnboarded()).toBe(false);
    expect(matthiasIntroPlacement({ onboarded: matthiasOnboarded(), guideEnabled: true, guideVisible: true, blocked: false })).toBe('guide');

    localStorage.setItem(MATTHIAS_ONBOARDED_KEY, MATTHIAS_ONBOARDED_VERSION);
    expect(matthiasOnboarded()).toBe(true);
    expect(matthiasIntroPlacement({ onboarded: true, guideEnabled: true, guideVisible: true, blocked: false })).toBe('none');
  });

  it('sólo recuerda cagadas que existen realmente en el expediente', () => {
    const generic = buildMatthiasHomeVisit({ rivalry: { record: { incidents: {} } } });
    expect(generic.kind).toBe('generic');
    expect(generic.text).not.toMatch(/mate|dama|horquilla|ahogado/i);

    const remembered = buildMatthiasHomeVisit({ rivalry: { record: { incidents: { 'human:MISSED_MATE': 2 } } } });
    expect(remembered).toMatchObject({ kind: 'incident', action: 'train' });
    expect(remembered.text).toMatch(/2 mates ignorados/i);
  });

  it('puede hablar desde memoria persistente sin inventar otro incidente', () => {
    const visit = buildMatthiasHomeVisit({
      rivalry: { record: { incidents: {} } },
      memory: { activeGoals: [{ id: 'g1', label: 'Levantar la Siciliana' }] },
    });
    expect(visit).toMatchObject({ kind: 'goal', action: 'insights' });
    expect(visit.text).toContain('Levantar la Siciliana');
  });

  it('prioriza continuar una partida activa sobre sacar una pulla histórica', () => {
    const visit = buildMatthiasHomeVisit({
      hasSavedGame: true,
      rivalry: { record: { incidents: { 'human:QUEEN_EN_PRISE_TO_PAWN': 8 } } },
    });
    expect(visit).toMatchObject({ kind: 'continue', action: 'continue', actionLabel: 'Continuar partida' });
  });

  it('es ocasional: una vez por sesión, cooldown persistente y sin competir con overlays', () => {
    const now = Date.parse('2026-08-28T12:00:00Z');
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2 })).toBe(true);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.9 })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, hasOpenOverlay: true })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, hasPriorityAction: true })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, sessionSeen: true })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, lastShownAt: now - MATTHIAS_HOME_COOLDOWN_MS + 1 })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.2, lastShownAt: now - MATTHIAS_HOME_COOLDOWN_MS - 1 })).toBe(true);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.30, relationshipTier: 'veteran', visitKind: 'generic' })).toBe(false);
    expect(shouldShowMatthiasHome({ now, randomValue: 0.30, relationshipTier: 'veteran', visitKind: 'goal' })).toBe(true);
  });


  it('saluda una vez tras cada autenticación explícita sin depender del cooldown', () => {
    queueMatthiasLoginGreeting();
    expect(matthiasLoginGreetingPending()).toBe(true);
    const greeting = buildMatthiasLoginGreeting({ hour: 22 });
    expect(greeting).toMatchObject({ kind: 'login-greeting', action: 'insights', actionLabel: 'Ver Así juegas' });
    expect(greeting.text).toMatch(/^Guten Abend\./);
    expect(greeting.timeScene).toBe('chess-inception');
    expect(buildMatthiasLoginGreeting({ hour: 12 })).toMatchObject({ timeScene: 'lunch-bocata' });
    expect(buildMatthiasLoginGreeting({ hour: 3 })).toMatchObject({ timeScene: 'late-sleep' });
    expect(buildMatthiasLoginGreeting({ hour: 3 }).text).toMatch(/(crimen horario|despertado|las tres)/i);
    const model = buildMatthiasHomeCardModel({ visit: greeting });
    expect(model).toMatchObject({ variant: 'comment', eyebrow: 'MATTHIAS · WILLKOMMEN' });
    consumeMatthiasLoginGreeting();
    expect(matthiasLoginGreetingPending()).toBe(false);
    expect(matthiasHomeSessionSeen()).toBe(true);
  });

  it('marca sesión y cooldown usando el almacenamiento seguro', () => {
    markMatthiasHomeShown(123456);
    expect(matthiasHomeSessionSeen()).toBe(true);
    expect(matthiasHomeLastShownAt()).toBe(123456);
  });
  it('presenta a Matthias una sola vez por perfil con matthias.onboarded', () => {
    expect(matthiasOnboarded()).toBe(false);
    const intro = buildMatthiasIntroVisit();
    expect(intro).toMatchObject({ kind: 'intro', action: 'play', actionLabel: 'Jugar con Matthias' });
    expect(intro.text).toMatch(/Guten Morgen.*Matthias.*Tajo.*Tschüss/s);
    markMatthiasOnboarded();
    expect(localStorage.getItem(MATTHIAS_ONBOARDED_KEY)).toBe(MATTHIAS_ONBOARDED_VERSION);
    expect(matthiasOnboarded()).toBe(true);
  });

  it('recibe al veterano que vuelve sin inventar recuerdos nuevos', () => {
    const visit = buildMatthiasHomeVisit({
      memory: { returnContext: { days: 23 }, nemesisOpening: { name: 'Francesa', games: 6, win_pct: 33 } },
    });
    expect(visit).toMatchObject({ kind: 'reunion', action: 'insights' });
    expect(visit.text).toMatch(/23 días.*Francesa/s);
  });

  it('mantiene un reto pendiente y reconoce explícitamente cuando se cierra', () => {
    const pending = buildMatthiasHomeVisit({ memory: { activeChallenge: {
      id: 'clean-run:x', label: '3 partidas sin repetir: Horquillas', baseline_games: 10, current_games: 11, target_games: 3, setbacks: 1,
    } } });
    expect(pending).toMatchObject({ kind: 'challenge', action: 'insights' });
    expect(pending.text).toMatch(/Quedan 2 partidas.*reincidencias/s);

    const closed = buildMatthiasHomeVisit({ memory: { recentMilestones: [{ fingerprint: 'done', kind: 'challenge_completed', polarity: 'fame', label: 'Expediente cerrado: Horquillas' }] } });
    expect(closed).toMatchObject({ kind: 'earned-respect' });
    expect(closed.text).toMatch(/Eso ha sido bueno\. Muy bueno/);
  });

  it('da a Matthias un rincón silencioso estable sin obligarlo a hablar', () => {
    const model = buildMatthiasHomeCardModel({ memory: { relationship: { label: 'Viejo conocido' } } });
    expect(model).toMatchObject({
      variant: 'quiet',
      eyebrow: 'MATTHIAS · EN OBSERVACIÓN',
      text: '…',
      action: 'insights',
      actionLabel: 'Ver Así juegas',
      meta: 'Viejo conocido',
    });
  });

  it('expone el humor real como microseñal visual sin inventar un estado', () => {
    expect(matthiasMoodPresentation({ mood: 'annoyed' })).toEqual({ label: 'Cabreado', cue: 'annoyed' });
    expect(matthiasMoodPresentation({ mood: 'impressed' })).toEqual({ label: 'Impresionado', cue: 'impressed' });
    expect(matthiasMoodPresentation({ mood: 'estado-inventado' })).toEqual({ label: 'Observador', cue: 'observant' });
    const model = buildMatthiasHomeCardModel({ memory: { mood: 'pleased' } });
    expect(model).toMatchObject({ moodCue: 'pleased', moodLabel: 'Contento' });
  });

  it('convierte retos e hitos en mensajes importantes dentro del mismo bocadillo', () => {
    const visit = buildMatthiasHomeVisit({ memory: { activeChallenge: {
      id: 'clean-run:x', label: '3 partidas sin repetir: Horquillas', baseline_games: 10, current_games: 11, target_games: 3,
    } } });
    const model = buildMatthiasHomeCardModel({ visit, memory: { activeChallenge: {
      id: 'clean-run:x', label: '3 partidas sin repetir: Horquillas', baseline_games: 10, current_games: 11, target_games: 3,
    } } });
    expect(model).toMatchObject({ variant: 'important', eyebrow: 'MATTHIAS · RETO ACTIVO', action: 'insights', meta: 'Reto activo · 1/3' });
    expect(model.text).toContain('3 partidas sin repetir: Horquillas');
  });

  it('el respeto ganado cambia el tono genérico sin convertirlo en halago automático', () => {
    const visit = buildMatthiasHomeVisit({ memory: { respect: { tier: 'formidable', label: 'Rival respetado', score: 80 } } });
    expect(visit.kind).toBe('generic');
    expect(visit.text).toMatch(/no pienso regalarte/i);
  });

  it('convierte expediente y sesión en progreso visible sin inventar nivel RPG', () => {
    const model = buildMatthiasHomeCardModel({
      memory: {
        mood: 'annoyed',
        activeChallenge: { label: 'Tres partidas sin colgar dama' },
        hallOfFame: [{ fingerprint: 'f1', label: 'Primera victoria contra Matthias' }],
        hallOfShame: [{ fingerprint: 's1', label: 'Dama a un peón' }],
      },
      sessionContext: { games: 4, wins: 2, draws: 0, losses: 2 },
    });
    expect(model.sessionLabel).toBe('Sesión · 4 partidas · 2V · 0T · 2D');
    expect(model.deskArtifacts.map((item) => item.id)).toEqual(['challenge', 'fame', 'shame']);
    expect(model.moodLabel).toBe('Cabreado');
  });

});
