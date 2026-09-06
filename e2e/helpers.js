import { expect } from '@playwright/test';
import { clickWarRoomMove } from './war-room-board-input.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CHECK_START_FEN = '7k/8/8/8/8/8/4Q3/7K w - - 0 1';
const CHECK_END_FEN = '4Q2k/8/8/8/8/8/8/7K b - - 1 1';
const MATE_START_FEN = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';
const MATE_END_FEN = '7k/6Q1/5K2/8/8/8/8/8 b - - 1 1';
const OPENING_END_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
const LOSS_CAPTURE_START_FEN = 'k3r3/8/8/8/4P3/8/8/4K1N1 w - - 0 1';
const LOSS_CAPTURE_END_FEN = 'k7/8/8/8/4r3/5N2/8/4K3 w - - 0 2';

function scenarioInitialFen(scenario) {
  if (scenario === 'check') return CHECK_START_FEN;
  if (scenario === 'mate') return MATE_START_FEN;
  if (scenario === 'lossCapture') return LOSS_CAPTURE_START_FEN;
  return START_FEN;
}

function scenarioMoveResult(game, payload, scenario) {
  if (scenario === 'lossCapture') {
    if (payload.from !== 'g1' || payload.to !== 'f3') throw new Error(`E2E lossCapture esperaba g1-f3, recibió ${payload.from}-${payload.to}`);
    return {
      ...game,
      fen: LOSS_CAPTURE_END_FEN,
      turn: 'w',
      status: 'check',
      isGameOver: false,
      history: [
        { from: 'g1', to: 'f3', san: 'Nf3', piece: 'n', by: 'human' },
        { from: 'e8', to: 'e4', san: 'Rxe4+', piece: 'r', captured: 'p', by: 'cpu' },
      ],
      lastMove: { from: 'e8', to: 'e4', san: 'Rxe4+', piece: 'r', captured: 'p', by: 'cpu' },
    };
  }
  if (scenario === 'check') {
    if (payload.from !== 'e2' || payload.to !== 'e8') throw new Error(`E2E check esperaba e2-e8, recibió ${payload.from}-${payload.to}`);
    return {
      ...game,
      fen: CHECK_END_FEN,
      turn: 'b',
      status: 'check',
      isGameOver: false,
      history: [{ from: 'e2', to: 'e8', san: 'Qe8+', piece: 'q', by: 'human' }],
      lastMove: { from: 'e2', to: 'e8', san: 'Qe8+', piece: 'q', by: 'human' },
    };
  }
  if (scenario === 'mate') {
    if (payload.from !== 'g6' || payload.to !== 'g7') throw new Error(`E2E mate esperaba g6-g7, recibió ${payload.from}-${payload.to}`);
    return {
      ...game,
      fen: MATE_END_FEN,
      turn: 'b',
      status: 'checkmate',
      isGameOver: true,
      history: [{ from: 'g6', to: 'g7', san: 'Qg7#', piece: 'q', by: 'human' }],
      lastMove: { from: 'g6', to: 'g7', san: 'Qg7#', piece: 'q', by: 'human' },
    };
  }

  if (payload.from === 'e2' && payload.to === 'e4') {
    return {
      ...game,
      fen: OPENING_END_FEN,
      turn: 'w',
      status: 'playing',
      isGameOver: false,
      history: [
        { from: 'e2', to: 'e4', san: 'e4', piece: 'p', by: 'human' },
        { from: 'e7', to: 'e5', san: 'e5', piece: 'p', by: 'cpu' },
      ],
      lastMove: { from: 'e7', to: 'e5', san: 'e5', piece: 'p', by: 'cpu' },
    };
  }

  throw new Error(`E2E route de jugada no simulada: ${payload.from}-${payload.to}`);
}

export async function mockApi(page, {
  isAdmin = false,
  gameGetFailures = 0,
  gameCreateFailures = 0,
  gameCreateCommitThenFailures = 0,
  moveCommitThenFailures = 0,
  gameScenario = 'opening',
  profileSeed = {},
  initialFeedback = [],
  analysisMoves = [],
  adminUsers = [],
  requestLog = [],
} = {}) {
  // Seed tutorials as seen so overlays cannot intercept unrelated E2E clicks.
  let profileData = {
    'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
      'combat-basics': { seen: true },
      'combat-campaign': { seen: true },
      'combat-intelligence': { seen: true },
      'combat-deployment': { seen: true },
      'quick-match-rules': { seen: true },
      tournament: { seen: true },
      practice: { seen: true },
      puzzles: { seen: true },
      spectator: { seen: true },
      lab: { seen: true },
      'rival-ghost': { seen: true },
    }),
    ...profileSeed,
  };
  let profileRevisions = {};
  let nextGameId = 1;
  let nextFeedbackId = 1;
  let remainingGameGetFailures = Math.max(0, Number(gameGetFailures || 0));
  let remainingGameCreateFailures = Math.max(0, Number(gameCreateFailures || 0));
  let remainingGameCreateCommitThenFailures = Math.max(0, Number(gameCreateCommitThenFailures || 0));
  let remainingMoveCommitThenFailures = Math.max(0, Number(moveCommitThenFailures || 0));
  let analysisIndex = 0;
  const games = new Map();
  const idempotentCreates = new Map();
  const idempotentMoves = new Map();
  let feedback = initialFeedback.map((item, index) => ({
    id: item.id || `e2e-feedback-${index + 1}`,
    username: item.username || 'e2e',
    category: item.category || 'bug',
    message: item.message || 'Bug E2E',
    context: item.context || 'Home',
    status: item.status || 'new',
    attachments: item.attachments || [],
    admin_reply: item.admin_reply || null,
    admin_replied_at: item.admin_replied_at || null,
    created_at: item.created_at || '2026-08-27T19:00:00Z',
  }));

  await page.route('http://localhost:4000/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const headers = route.request().headers();
    requestLog.push({ method, path, idempotencyKey: headers['idempotency-key'] || null, presenceSession: headers['x-presence-session'] || null });
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/auth/login') && method === 'POST') return json({ token: 'e2e-token', username: 'e2e' });
    if (path.endsWith('/auth/me')) return json({ username: 'e2e', isAdmin, email: 'e2e@example.test' });
    if (path.endsWith('/profile') && method === 'GET') {
      return json({ app: 'estudio-de-ajedrez', version: 2, data: profileData, revisions: profileRevisions });
    }
    if (path.endsWith('/profile') && method === 'PUT') {
      const payload = route.request().postDataJSON?.() ?? {};
      const nextData = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
      const keys = new Set([...Object.keys(profileData), ...Object.keys(nextData)]);
      for (const key of keys) {
        if (profileData[key] !== nextData[key] || (key in profileData) !== (key in nextData)) {
          profileRevisions[key] = Number(profileRevisions[key] || 0) + 1;
        }
      }
      profileData = { ...nextData };
      return json({ ...payload, data: profileData, revisions: profileRevisions });
    }
    if (path.endsWith('/profile') && method === 'PATCH') {
      const payload = route.request().postDataJSON?.() ?? {};
      const changes = payload?.data && typeof payload.data === 'object' ? payload.data : {};
      const expected = payload?.revisions && typeof payload.revisions === 'object' ? payload.revisions : {};
      const conflicts = {};
      for (const key of Object.keys(changes)) {
        const actual = Number(profileRevisions[key] || 0);
        const wanted = Number(expected[key] || 0);
        if (actual !== wanted) conflicts[key] = { expected: wanted, actual };
      }
      if (Object.keys(conflicts).length) {
        return json({
          detail: {
            message: 'Conflicto E2E de perfil',
            conflicts,
            profile: { app: 'estudio-de-ajedrez', version: 2, data: profileData, revisions: profileRevisions },
            revisions: profileRevisions,
          },
        }, 409);
      }
      const nextData = { ...profileData };
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) delete nextData[key];
        else nextData[key] = value;
        profileRevisions[key] = Number(profileRevisions[key] || 0) + 1;
      }
      profileData = nextData;
      return json({ app: 'estudio-de-ajedrez', version: 2, data: profileData, revisions: profileRevisions });
    }

    if (path.endsWith('/feedback') && method === 'POST') {
      const payload = route.request().postDataJSON?.() ?? {};
      const created = {
        id: `e2e-feedback-created-${nextFeedbackId++}`,
        username: 'e2e', category: payload.category || 'other', message: payload.message || '', context: payload.context || 'Home',
        status: 'new', attachments: (payload.attachments || []).map((attachment, index) => ({ index, name: attachment.name || `captura-${index + 1}.png`, mime: attachment.mime || 'image/png', size: attachment.size || 1 })),
        admin_reply: null, admin_replied_at: null, created_at: '2026-08-27T19:00:00Z',
      };
      feedback = [created, ...feedback];
      return json({ feedback: created }, 201);
    }
    if (path.endsWith('/feedback/mine') && method === 'GET') return json({ feedback: feedback.filter((item) => item.username === 'e2e') });
    if (path.endsWith('/admin/feedback/summary') && method === 'GET') return json({ newCount: feedback.filter((item) => item.status === 'new').length, pendingCount: feedback.filter((item) => item.status !== 'resolved').length });
    if (path.endsWith('/admin/feedback') && method === 'GET') return json({ feedback });
    const feedbackDeleteMatch = path.match(/\/admin\/feedback\/([^/]+)$/);
    if (feedbackDeleteMatch && method === 'DELETE') {
      const id = decodeURIComponent(feedbackDeleteMatch[1]);
      const before = feedback.length;
      feedback = feedback.filter((item) => item.id !== id);
      if (feedback.length === before) return json({ detail: 'Feedback no encontrado' }, 404);
      return route.fulfill({ status: 204, body: '' });
    }
    const feedbackStatusMatch = path.match(/\/admin\/feedback\/([^/]+)\/status$/);
    if (feedbackStatusMatch && method === 'POST') {
      const payload = route.request().postDataJSON?.() ?? {};
      const index = feedback.findIndex((item) => item.id === decodeURIComponent(feedbackStatusMatch[1]));
      if (index < 0) return json({ detail: 'Feedback no encontrado' }, 404);
      feedback[index] = { ...feedback[index], status: payload.status || 'read' };
      return json({ feedback: feedback[index] });
    }
    const feedbackReplyMatch = path.match(/\/admin\/feedback\/([^/]+)\/reply$/);
    if (feedbackReplyMatch && method === 'POST') {
      const payload = route.request().postDataJSON?.() ?? {};
      const index = feedback.findIndex((item) => item.id === decodeURIComponent(feedbackReplyMatch[1]));
      if (index < 0) return json({ detail: 'Feedback no encontrado' }, 404);
      feedback[index] = {
        ...feedback[index],
        admin_reply: payload.message || '',
        admin_replied_at: '2026-08-27T19:05:00Z',
        status: payload.resolve === false ? 'read' : 'resolved',
      };
      return json({ feedback: feedback[index] });
    }

    const matthiasMemory = {
      schemaVersion: 4,
      consultations: 4,
      relationship: { tier: 'regular', label: 'Habitual del despacho', games_seen: 18 },
      respect: { tier: 'respected', label: 'Respeto ganado', score: 46 },
      mood: 'observant',
      activeGoals: [{ id: 'opening:Siciliana', topic: 'openings', label: 'Domar la Siciliana', current_games: 5 }],
      currentObsession: { id: 'opening:Siciliana', topic: 'openings', label: 'Domar la Siciliana' },
      activeChallenge: { id: 'clean-run:human:MISSED_MATE', label: '3 partidas sin repetir: Ver mates antes de que sea demasiado tarde', baseline_games: 17, current_games: 18, target_games: 3, setbacks: 1 },
      openingMemory: [{ name: 'Siciliana', games: 5, wins: 1, draws: 1, losses: 3, win_pct: 20 }],
      nemesisOpening: { name: 'Siciliana', games: 5, wins: 1, draws: 1, losses: 3, win_pct: 20 },
      rivalry: { games: 8, wins: 3, draws: 1, losses: 4, best_human_streak: 2, best_cpu_streak: 2 },
      hallOfFame: [{ fingerprint: 'first-win', kind: 'first_win', polarity: 'fame', label: 'Primera victoria registrada' }],
      hallOfShame: [],
      recentMilestones: [{ fingerprint: 'first-win', kind: 'first_win', polarity: 'fame', label: 'Primera victoria registrada' }],
      emblematicPositions: [{ fingerprint: 'pos-1', label: 'Posición emblemática: Qh5, error grave de 430 cp', fen: '8/8/8/8/8/8/4K3/4k3 w - - 0 1', loss_cp: 430 }],
      openDebt: { topic: 'decision_process', advice: 'Compara dos candidatas antes de mover.', status: 'mixed', games_since: 3 },
      mainAdvice: { text: 'Compara dos candidatas antes de mover.', questionKind: 'improve', topic: 'decision_process' },
    };
    if (path.endsWith('/matthias/daily') && method === 'GET') return json({ used: false, pending: false, memory: matthiasMemory });
    if (path.endsWith('/matthias/daily') && method === 'POST') return json({ used: true, text: 'Has jugado 18 partidas. Compara dos candidatas antes de mover.', provider: 'cloudflare', memory: matthiasMemory });
    if (path.endsWith('/matthias/briefing') && method === 'GET') return json({ text: 'Achtung. Mi obsesión actual sigue siendo: Domar la Siciliana. Hoy no hace falta inventar otro problema.', memory: matthiasMemory });
    if (path.endsWith('/matthias/reset-memory') && method === 'POST') return json({ ok: true });
    if (path.endsWith('/narrative') && method === 'POST') {
      const payload = route.request().postDataJSON?.() ?? {};
      if (payload.eventType === 'matthias_position') return json({ text: 'La evaluación castiga tu jugada; compara la candidata sugerida antes de comprometer la pieza.', provider: 'cloudflare', latencyMs: 35 });
      return json({ text: 'Matthias ha revisado los hechos disponibles.', provider: 'cloudflare', latencyMs: 35 });
    }
    if (path.endsWith('/admin/users')) return json({ users: Array.isArray(adminUsers) ? adminUsers : [] });
    if (path.endsWith('/admin/ai-metrics')) return json({ samples: 0, enabled: true, circuit: { open: false } });
    if (path.endsWith('/admin/matthias/memory') && method === 'POST') return json({ username: 'e2e', memory: matthiasMemory });
    if (path.endsWith('/admin/matthias/personality-preview') && method === 'POST') {
      const payload = route.request().postDataJSON?.() ?? {};
      return json({ preset: payload.preset || 'veteran', text: 'Eso ha sido bueno. Muy bueno. Ahora no estropees el expediente.', provider: 'cloudflare', latencyMs: 31, synthetic: true });
    }
    if (path.endsWith('/admin/matthias-status')) return json({ ok: true, storage: 'mongo', memorySchemaVersion: 4, recentAdviceCap: 12, activeGoalCap: 3, milestoneCap: 10, openingMemoryCap: 6, emblematicPositionCap: 8, consultations: 3, usersWithMemory: 2, topQuestionKind: 'improve', questionCounts: { improve: 2, tactics: 1 }, activeGoalCounts: { openings: 2 }, topActiveGoal: { topic: 'openings', label: 'Aperturas recurrentes', users: 2 }, relationshipCounts: { regular: 2 }, respectCounts: { respected: 2 }, milestonesRemembered: 3, activeChallenges: 1, emblematicPositions: 2, dominantAdvice: { topic: 'decision_process', label: 'Proceso de decisión antes de mover', consultations: 2, usersAffected: 2 }, aiToday: { calls: 2, cloudflarePercent: 100, fallbackPercent: 0, p50Ms: 35, p95Ms: 42, timeouts: 0, errors: 0 } });
    if (path.endsWith('/status')) return json({ onlineUsers: 2, presenceAvailable: true });
    if (path.endsWith('/auth/logout') && method === 'POST') return route.fulfill({ status: 204, body: '' });
    if (path.endsWith('/auth/activity')) return json({ ok: true });
    if (path.endsWith('/health')) return json({ ok: true });
    if (path.endsWith('/features')) return json({});
    if (path.endsWith('/analyze') && method === 'POST') {
      const move = analysisMoves[analysisIndex++];
      return move ? json(move) : json({ detail: 'E2E sin jugada de análisis preparada' }, 503);
    }
    if (path.endsWith('/games') && method === 'POST') {
      const operationKey = headers['idempotency-key'] || null;
      if (operationKey && idempotentCreates.has(operationKey)) return json(idempotentCreates.get(operationKey), 201);
      if (remainingGameCreateFailures > 0) {
        remainingGameCreateFailures -= 1;
        return json({ detail: 'Servicio temporalmente no disponible' }, 503);
      }
      const payload = route.request().postDataJSON?.() ?? {};
      const id = `e2e-game-${nextGameId++}`;
      const forcedFen = scenarioInitialFen(gameScenario);
      const game = {
        id,
        fen: forcedFen,
        turn: 'w',
        humanColor: payload.color === 'b' ? 'b' : 'w',
        difficulty: Math.round(Number(payload.difficulty ?? 50)),
        status: 'playing',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: false,
        history: [],
        lastMove: null,
        initialFen: gameScenario === 'opening' ? (payload.startingFen || null) : forcedFen,
        ghostStyle: payload.ghostStyle || null,
      };
      games.set(id, game);
      if (operationKey) idempotentCreates.set(operationKey, game);
      if (remainingGameCreateCommitThenFailures > 0) {
        remainingGameCreateCommitThenFailures -= 1;
        return json({ detail: 'Respuesta perdida tras persistir la partida' }, 503);
      }
      return json(game, 201);
    }
    const moveMatch = path.match(/\/games\/([^/]+)\/move$/);
    if (moveMatch && method === 'POST') {
      const id = moveMatch[1];
      const operationKey = headers['idempotency-key'] || null;
      const replayKey = operationKey ? `${id}:${operationKey}` : null;
      if (replayKey && idempotentMoves.has(replayKey)) return json(idempotentMoves.get(replayKey));
      const game = games.get(id);
      if (!game) return json({ detail: 'Partida no encontrada' }, 404);
      try {
        const updated = scenarioMoveResult(game, route.request().postDataJSON?.() ?? {}, gameScenario);
        games.set(id, updated);
        if (replayKey) idempotentMoves.set(replayKey, updated);
        if (remainingMoveCommitThenFailures > 0) {
          remainingMoveCommitThenFailures -= 1;
          return json({ detail: 'Respuesta perdida tras persistir la jugada' }, 503);
        }
        return json(updated);
      } catch (error) {
        return json({ detail: error.message }, 400);
      }
    }
    const gameMatch = path.match(/\/games\/([^/]+)$/);
    if (gameMatch && method === 'GET') {
      if (remainingGameGetFailures > 0) {
        remainingGameGetFailures -= 1;
        return json({ detail: 'Backend temporalmente no disponible' }, 503);
      }
      const game = games.get(gameMatch[1]);
      return game ? json(game) : json({ detail: 'Partida no encontrada' }, 404);
    }
    if (gameMatch && method === 'DELETE') {
      games.delete(gameMatch[1]);
      return route.fulfill({ status: 204, body: '' });
    }
    return json({ detail: `E2E route no simulada: ${method} ${path}` }, 404);
  });
}

export async function login(page) {
  await page.goto('./');
  await page.getByLabel('Usuario').fill('e2e');
  await page.getByLabel('Contraseña').fill('clave123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Stable Home-ready landmark shared by immersive desktop and compact mobile.
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
}


export function gameStatus(page) {
  return page.getByRole('status', { name: 'Estado de la partida' });
}

export function gameTurn(page, text = 'Tu turno') {
  return gameStatus(page).getByText(text, { exact: true });
}


export function buttonWithVisibleText(scope, text) {
  // Prefer the visible copy rendered inside the action button, not a broad
  // accessible-name regex. Tutorial help buttons intentionally include the
  // mode name in aria-label (e.g. "Ayuda de Partida rápida"), so regex
  // role selectors can become ambiguous as the UI gains contextual help.
  const visibleLabel = scope.getByText(text, { exact: true });
  return scope.getByRole('button').filter({ has: visibleLabel });
}


export function buttonWithHeading(scope, text) {
  // Some compact status chips repeat mode names such as "Torneo". Home
  // mode cards own an actual heading, so anchoring the button to that heading
  // keeps the locator semantic and unambiguous without depending on card copy.
  const heading = scope.getByRole('heading', { name: text, exact: true });
  return scope.getByRole('button').filter({ has: heading });
}

export async function dismissTutorialIfVisible(page) {
  // Defensive fallback: close every visible mechanic tutorial. A strict
  // getByRole('button', { name: 'Saltar' }) can throw when two overlays are
  // briefly mounted at once; swallowing that error left the backdrop in place
  // and the *next* click waited the full 30 s action timeout.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const dialog = page.locator('.mechanic-tutorial-card:visible').last();
    if (await dialog.count() === 0) return;
    const skip = dialog.getByRole('button', { name: 'Saltar', exact: true });
    await expect(skip).toBeVisible({ timeout: 2_000 });
    await skip.click({ timeout: 2_000 });
    await expect(dialog).toBeHidden({ timeout: 2_000 });
  }

  await expect(page.locator('.mechanic-tutorial-card:visible')).toHaveCount(0, { timeout: 2_000 });
}

export async function openCampaignMap(page) {
  await buttonWithVisibleText(page, 'Combat Chess · Campaña').click();

  // The campaign landing is deliberately simple: start first, then the
  // strategic map appears. Keep this flow centralized so UI copy changes do
  // not leave half the E2E suite waiting for a retired button label.
  const startCampaign = page.getByRole('button', { name: /Empezar campaña/i });
  await expect(startCampaign).toBeVisible();
  await startCampaign.click();
  await dismissTutorialIfVisible(page);

  const map = page.getByRole('region', { name: 'Mapa completo de campaña Combat Chess' });
  await expect(map).toBeVisible();
  return map;
}

export async function openCampaignBriefing(page) {
  const map = await openCampaignMap(page);
  const availableRoute = map.getByRole('button', { name: /Elegir esta ruta/ }).first();
  await expect(availableRoute).toBeVisible();
  await availableRoute.click();
  await dismissTutorialIfVisible(page);

  const briefing = page.getByLabel('Resumen táctico');
  await expect(briefing).toBeVisible();
  return briefing;
}

export async function openDeployment(page) {
  const deployment = page.getByRole('region', { name: 'Preparar despliegue de Combat Chess' });

  // La ruta normal de campaña usa defaults en un clic y ya no abre la Mesa
  // de Guerra automáticamente. Este helper entra explícitamente por la ruta
  // avanzada de personalización, pero conserva tolerancia con builds antiguas
  // que montaban el overlay directamente.
  if (await deployment.isVisible().catch(() => false)) return deployment;

  const enterPreparation = page.getByRole('button', { name: /PREPARAR EJÉRCITO/i });
  if (await enterPreparation.isVisible().catch(() => false)) {
    await enterPreparation.click();
    await dismissTutorialIfVisible(page);

    // React mounts CombatScreen and currently opens deployment immediately.
    // Give that direct transition a short chance before falling back to the
    // legacy/intermediate preparation-screen path.
    try {
      await deployment.waitFor({ state: 'visible', timeout: 1_500 });
      return deployment;
    } catch {
      await expect(page.getByLabel('Resumen de preparación')).toBeVisible();
    }
  }

  const reviewDeployment = page.getByRole('button', { name: /PREPARAR DESPLIEGUE|REVISAR Y CONFIRMAR|Personalizar despliegue/i });
  await expect(reviewDeployment).toBeVisible();
  await reviewDeployment.click();
  await dismissTutorialIfVisible(page);

  await expect(deployment).toBeVisible();
  return deployment;
}

export async function loginAndOpenDeployment(page) {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  return openDeployment(page);
}

export async function clickBoardMove(page, from, to, scope = page) {
  const fromSquare = scope.getByRole('button', { name: new RegExp(`^Casilla ${from},`) });
  const toSquare = scope.getByRole('button', { name: new RegExp(`^Casilla ${to},`) });

  if (await fromSquare.isVisible().catch(() => false)) {
    await fromSquare.click();
    await expect(toSquare).toBeVisible();
    await toSquare.click();
    return;
  }

  if (scope === page && await clickWarRoomMove(page, from, to)) return;

  // Keep the old semantic failure when neither renderer is available so a
  // broken board does not get disguised as a helper timeout.
  await expect(fromSquare).toBeVisible();
}

export async function startQuickGame(page) {
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await expect(page.getByRole('dialog', { name: 'Configurar partida rápida' })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();
}

export async function startTournamentGame(page) {
  await buttonWithHeading(page, 'Torneo').click();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jugar siguiente partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();
}

export async function startPracticeGame(page) {
  await buttonWithHeading(page, 'Partida de práctica').click();
  await expect(gameStatus(page)).toBeVisible();
}

export async function openMoreGameModes(page) {
  const details = page.locator('details.home-more-modes');
  await expect(details).toBeVisible();
  if (!(await details.evaluate((node) => node.open))) await details.locator('summary').click();
  return details;
}

export async function openFreeCombat(page) {
  const details = await openMoreGameModes(page);
  await buttonWithHeading(details, 'Combat Chess · Batalla libre').click();
}

export async function seedCombatBattleSnapshot(page, {
  sessionId = 'free',
  fen,
  humanColor = 'w',
} = {}) {
  if (!fen) throw new Error('seedCombatBattleSnapshot requiere FEN');
  await page.evaluate(({ sessionId, fen, humanColor }) => {
    const files = 'abcdefgh';
    const [boardPart] = fen.split(' ');
    const ranks = boardPart.split('/');
    const registry = {};
    for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
      let fileIndex = 0;
      for (const token of ranks[rankIndex]) {
        if (/\d/.test(token)) {
          fileIndex += Number(token);
          continue;
        }
        const square = `${files[fileIndex]}${8 - rankIndex}`;
        const type = token.toLowerCase();
        const color = token === token.toUpperCase() ? 'w' : 'b';
        registry[square] = {
          id: `${color}-${type}-${square}`,
          type,
          color,
          square,
          strengthPoints: 0,
          speedPoints: 0,
          bankedXp: 0,
        };
        fileIndex += 1;
      }
    }
    const snapshot = {
      version: 1,
      sessionId,
      savedAt: new Date().toISOString(),
      phase: 'battle',
      fen,
      registry,
      humanColor,
      combatLog: [],
      uiLog: [],
      autoLevelUpEnabled: true,
      focus: { w: null, b: null },
      positionCounts: [],
      bossHp: null,
      bossPhase: 1,
      battleStartRoster: null,
      battleParticipants: [],
      unitBattleStats: { killsByIdentity: {}, bossDamageByIdentity: {}, bossFinisherIdentityId: null, underdogCredits: 0, tacticalCredits: 0 },
      activityGameId: 'e2e-combat-game',
    };
    sessionStorage.setItem('chess-study-active-combat-session-v1', JSON.stringify({ version: 2, sessions: { [sessionId]: snapshot } }));
  }, { sessionId, fen, humanColor });
}

export async function startLabGame(page) {
  const details = await openMoreGameModes(page);
  await buttonWithHeading(details, 'Laboratorio').click();
  await expect(page.getByRole('button', { name: 'Jugar esta posición', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jugar esta posición', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();
}

export async function startGhostGame(page) {
  const details = await openMoreGameModes(page);
  await buttonWithHeading(details, 'Rival Fantasma').click();
  const dialog = page.getByRole('dialog', { name: 'Rival fantasma' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Jugar contra mi fantasma', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();
}

export async function openSpectator(page) {
  const details = await openMoreGameModes(page);
  await buttonWithHeading(details, 'Espectador').click();
  await expect(page.getByRole('button', { name: 'Empezar partida', exact: true })).toBeVisible();
}

export async function openBoard3D(page) {
  await page.getByRole('button', { name: 'Abrir menú de cuenta' }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Personalizar' }).click();
  const settings = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Empezar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.locator('.board3d-canvas canvas')).toBeVisible();
}

export async function clickBoard3DSquare(page, square) {
  const canvas = page.locator('.board3d-canvas canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((node, targetSquare) => {
    const rect = node.getBoundingClientRect();
    const fileIndex = targetSquare.charCodeAt(0) - 97;
    const rank = Number(targetSquare[1]);
    const point = [fileIndex - 3.5, 0.03, 4.5 - rank];
    const camera = [0, 7.5, 7];
    const forwardRaw = [0, -7.5, -7];
    const norm = (v) => {
      const length = Math.hypot(...v);
      return v.map((value) => value / length);
    };
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const forward = norm(forwardRaw);
    const right = norm(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    const relative = point.map((value, index) => value - camera[index]);
    const depth = dot(relative, forward);
    const tanHalfFov = Math.tan((45 * Math.PI / 180) / 2);
    const aspect = rect.width / rect.height;
    const ndcX = dot(relative, right) / (depth * tanHalfFov * aspect);
    const ndcY = dot(relative, up) / (depth * tanHalfFov);
    const clientX = rect.left + ((ndcX + 1) / 2) * rect.width;
    const clientY = rect.top + ((1 - ndcY) / 2) * rect.height;
    node.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    }));
  }, square);
}

export async function clickBoard3DMove(page, from, to) {
  await clickBoard3DSquare(page, from);
  await clickBoard3DSquare(page, to);
}
