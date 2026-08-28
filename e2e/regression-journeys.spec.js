import { expect, test } from '@playwright/test';
import { APP_RELEASE } from '../frontend/src/release.js';
import {
  buttonWithHeading,
  buttonWithVisibleText,
  clickBoardMove,
  gameStatus,
  login,
  mockApi,
  openFreeCombat,
  seedCombatBattleSnapshot,
  startQuickGame,
} from './helpers.js';

const PERSONAL_MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
const COMBAT_MATE_FEN = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
}

test('sesión · F5 rota la presencia del documento viejo y logout explícito limpia la nueva', async ({ page }) => {
  const requests = [];
  await mockApi(page, { requestLog: requests });
  await login(page);
  const firstPresence = await page.evaluate(() => sessionStorage.getItem('chess-study-presence-session-v1'));
  expect(firstPresence).toBeTruthy();

  await page.reload();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  const secondPresence = await page.evaluate(() => sessionStorage.getItem('chess-study-presence-session-v1'));
  expect(secondPresence).toBeTruthy();
  expect(secondPresence).not.toBe(firstPresence);
  await expect.poll(() => requests.some((row) => row.method === 'POST' && row.path.endsWith('/auth/logout') && row.presenceSession === firstPresence)).toBe(true);

  await page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
  await page.getByRole('menuitem', { name: /Cerrar sesión/ }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(requests.some((row) => row.method === 'POST' && row.path.endsWith('/auth/logout') && row.presenceSession === secondPresence)).toBe(true);
});

test('sesión · dos pestañas comparten login pero no identidad de presencia', async ({ page, context }) => {
  const firstRequests = [];
  await mockApi(page, { requestLog: firstRequests });
  await login(page);
  const firstPresence = await page.evaluate(() => sessionStorage.getItem('chess-study-presence-session-v1'));

  const secondPage = await context.newPage();
  await mockApi(secondPage);
  await secondPage.goto('./');
  await expect(secondPage.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  const secondPresence = await secondPage.evaluate(() => sessionStorage.getItem('chess-study-presence-session-v1'));
  expect(secondPresence).toBeTruthy();
  expect(secondPresence).not.toBe(firstPresence);

  await page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
  await page.getByRole('menuitem', { name: /Cerrar sesión/ }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(secondPage.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
});

test('abandono · sin pieza perdida cancela sin rating ni historial competitivo', async ({ page }) => {
  await mockApi(page, { gameScenario: 'opening' });
  await login(page);
  await dismissHomeGuide(page);
  await startQuickGame(page);
  await clickBoardMove(page, 'e2', 'e4');
  await expect(page.getByRole('button', { name: /^Casilla e5, peón negro/i })).toBeVisible();

  await page.getByRole('button', { name: 'Abandonar partida', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '¿Abandonar la partida?' });
  await expect(dialog.getByText(/todavía no has perdido ninguna pieza/i)).toBeVisible();
  await expect(dialog.getByText(/rating no cambiará/i)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar sin penalización', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chess-study-game-history') || '[]'))).toHaveLength(0);
});

test('abandono · después de perder una pieza registra una sola derrota', async ({ page }) => {
  await mockApi(page, { gameScenario: 'lossCapture' });
  await login(page);
  await dismissHomeGuide(page);
  await startQuickGame(page);
  await clickBoardMove(page, 'g1', 'f3');
  await expect(gameStatus(page).getByText('Jaque', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Abandonar partida', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '¿Abandonar la partida?' });
  await expect(dialog.getByText(/Se registrará como derrota/i)).toBeVisible();
  await dialog.getByRole('button', { name: 'Abandonar y asumir resultado', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('chess-study-game-history') || '[]'));
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ outcome: 'loss' });
});

test('Matthias · se presenta una vez, lidera la guía y al reabrirla no repite presentación', async ({ page }) => {
  await mockApi(page);
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  await expect(guide.getByRole('heading', { name: 'Guten Morgen. Soy Matthias.', exact: true })).toBeVisible();
  await expect(guide.getByText(/mayor cabronazo ajedrecista.*Tajo/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('matthias.onboarded'))).toBe('2');

  await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Guía rápida de Chess Studio' })).toHaveCount(0);
  await page.getByRole('button', { name: /Juega primero/ }).click();
  const reopened = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByRole('heading', { name: 'Guten Morgen. Soy Matthias.', exact: true })).toHaveCount(0);
});

test('recuperación · serie mejor de 3 conserva contexto y posición tras F5', async ({ page }) => {
  await mockApi(page, { gameScenario: 'opening' });
  await login(page);
  await dismissHomeGuide(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const modal = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await modal.locator('details.quick-match-settings summary').click();
  await modal.getByLabel('Formato de serie').selectOption('3');
  await modal.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  const moveCommitted = page.waitForResponse((response) => response.url().includes('/games/') && response.url().endsWith('/move') && response.ok());
  await clickBoardMove(page, 'e2', 'e4');
  await moveCommitted;
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible({ timeout: 6000 });

  await page.reload();
  await expect(gameStatus(page)).toBeVisible();
  await expect(page.getByText(/Mejor de 3|Serie/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
});

test('recuperación · puzzles conservan la ruta tras F5', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  const learningMore = page.locator('details.home-learning-more');
  if (!(await learningMore.evaluate((node) => node.open))) await learningMore.locator('summary').click();
  await learningMore.getByRole('button').filter({ has: learningMore.getByRole('heading', { name: 'Puzzles', exact: true }) }).click();
  await expect(page.getByText('Mate en 1', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Mate en 1', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
});

test('recuperación · Desafío diario conserva su pantalla tras F5', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  const today = page.getByRole('region', { name: 'Hoy en Chess Studio' });
  await today.getByRole('button', { name: /Jugar ahora|Seguir|Revisar 3\/3/ }).click();
  await expect(page.getByRole('button', { name: 'Desafío diario', exact: true })).toHaveClass(/primary-btn/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Desafío diario', exact: true })).toHaveClass(/primary-btn/);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
});

test('puzzles personales · Siguiente no recicla los ya dominados; el histórico sí permite revisarlos', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  await page.evaluate(({ fen }) => {
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      { id: 'pending-e2e', kind: 'personal', source: 'autopsy', title: 'Pendiente E2E', description: 'Corrige este error.', fen, solution: ['Ra8#'], createdAt: '2026-08-28T10:00:00Z', attempts: 0, solves: 0, cleanSolves: 0 },
      { id: 'mastered-e2e', kind: 'personal', source: 'autopsy', title: 'Histórico previo', description: 'Ya dominado.', fen, solution: ['Ra8#'], createdAt: '2026-08-27T10:00:00Z', attempts: 1, solves: 1, cleanSolves: 1, masteredAt: '2026-08-27T11:00:00Z' },
    ]));
  }, { fen: PERSONAL_MATE_FEN });

  await buttonWithHeading(page, 'Entrena tus mayores errores').click();
  await expect(page.getByRole('heading', { name: 'Pendiente E2E', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pendiente E2E', exact: true })).toBeVisible();
  await clickBoardMove(page, 'a1', 'a8');
  await expect(page.getByText('¡Resuelto!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente puzzle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pendiente E2E', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'No quedan errores pendientes' })).toBeVisible();
  const history = page.locator('details.personal-puzzle-history');
  await history.locator('summary').click();
  await expect(history.getByText('Histórico previo', { exact: true })).toBeVisible();
});

test('Combat Chess · batalla recuperada tras F5 puede terminar en mate sin turno CPU zombi', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await seedCombatBattleSnapshot(page, { fen: COMBAT_MATE_FEN });
  await openFreeCombat(page);
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();
  await clickBoardMove(page, 'g6', 'g7');
  const endgame = page.locator('.combat-battle-screen .endgame-banner');
  await expect(endgame.getByRole('heading', { name: 'Jaque mate', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar turno de la CPU', exact: true })).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

test('sesión · dos contextos de navegador del mismo usuario son independientes', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await mockApi(pageA);
    await mockApi(pageB);
    await login(pageA);
    await login(pageB);

    const presenceA = await pageA.evaluate(() => sessionStorage.getItem('chess-study-presence-session-v1'));
    const presenceB = await pageB.evaluate(() => sessionStorage.getItem('chess-study-presence-session-v1'));
    expect(presenceA).toBeTruthy();
    expect(presenceB).toBeTruthy();
    expect(presenceA).not.toBe(presenceB);

    await pageA.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
    await pageA.getByRole('menuitem', { name: /Cerrar sesión/ }).click();
    await expect(pageA.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    await expect(pageB.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('deploy · una release nueva no fuerza reload mientras la partida está activa', async ({ page }) => {
  test.setTimeout(30_000);
  let publishedRelease = APP_RELEASE;
  const servedReleases = [];

  // Interceptamos el manifest con una regex real. Así el test no depende de la
  // semántica de glob para el '?' del cache-busting (?ts=...).
  await page.route(/\/release\.json(?:\?.*)?$/, async (route) => {
    const releaseAtRequest = publishedRelease;
    servedReleases.push(releaseAtRequest);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ release: releaseAtRequest }),
    });
  });

  await mockApi(page, { gameScenario: 'opening' });
  await login(page);
  await dismissHomeGuide(page);
  await startQuickGame(page);
  await expect(gameStatus(page)).toBeVisible();

  // Toda espera tiene timeout propio. Nunca dejamos Promises manuales vivas
  // hasta que salte el timeout global del test.
  await expect.poll(() => servedReleases.filter((release) => release === APP_RELEASE).length, {
    message: 'ReleaseUpdateNotice debe consultar la release actual',
    timeout: 5_000,
  }).toBeGreaterThanOrEqual(1);

  publishedRelease = 'v16.6dm46zzz';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await expect.poll(() => servedReleases.includes('v16.6dm46zzz'), {
    message: 'visibilitychange debe consultar la release recién publicada',
    timeout: 5_000,
  }).toBe(true);

  const notice = page.getByRole('status').filter({ hasText: 'Nueva versión disponible' });
  await expect(notice).toBeVisible({ timeout: 5_000 });
  await expect(notice.getByText(/Tu partida sigue intacta; actualiza al terminar/i)).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Actualizar', exact: true })).toHaveCount(0);
  await expect(notice.getByRole('button', { name: 'Después', exact: true })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 10_000 });
  await expect(gameStatus(page)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
});

test('admin · presencia distingue primer plano, segundo plano, idle y offline', async ({ page }) => {
  const now = Date.now();
  const iso = (deltaMs) => new Date(now - deltaMs).toISOString();
  await mockApi(page, {
    isAdmin: true,
    adminUsers: [
      { username: 'foreground-user', presence: 'online', foreground: true, lastActivity: iso(10_000), currentActivity: 'Partida', clientRelease: 'v16.6dm46zff' },
      { username: 'background-user', presence: 'online', foreground: false, lastActivity: iso(20_000), currentActivity: 'Puzzle', clientRelease: 'v16.6dm46zff' },
      { username: 'idle-user', presence: 'idle', foreground: null, lastActivity: iso(4 * 60_000), currentActivity: null, clientRelease: 'v16.6dm46zff' },
      { username: 'offline-user', presence: 'offline', foreground: null, lastActivity: iso(20 * 60_000), currentActivity: null, clientRelease: 'v16.6dm46zff' },
    ],
  });
  await login(page);
  await page.getByRole('button', { name: '2 usuarios online', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios registrados', exact: true })).toBeVisible();

  const foreground = page.getByRole('row').filter({ hasText: 'foreground-user' });
  const background = page.getByRole('row').filter({ hasText: 'background-user' });
  const idle = page.getByRole('row').filter({ hasText: 'idle-user' });
  const offline = page.getByRole('row').filter({ hasText: 'offline-user' });
  await expect(foreground.getByText(/Primer plano/)).toBeVisible();
  await expect(background.getByText('En línea', { exact: true })).toBeVisible();
  await expect(background.getByText(/Segundo plano/)).toBeVisible();
  await expect(idle.getByText('Inactivo', { exact: true })).toBeVisible();
  await expect(offline.getByText('Offline', { exact: true })).toBeVisible();
  await expect(offline.getByText(/Segundo plano/)).toHaveCount(0);
});

test('Matthias · el briefing persistente aparece antes de una partida rápida', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const briefing = page.getByRole('complementary', { name: 'Briefing de Matthias' });
  await expect(briefing).toBeVisible();
  await expect(briefing.getByText('MATTHIAS // BRIEFING', { exact: true })).toBeVisible();
  await expect(briefing.getByText(/Mi obsesión actual sigue siendo: Domar la Siciliana/i)).toBeVisible();
});

test('Home · el avatar residente de Matthias abre Así juegas', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expect(matthias).toBeVisible();
  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

test('Matthias · banco de personalidad Admin usa sólo datos sintéticos', async ({ page }) => {
  await mockApi(page, { isAdmin: true, adminUsers: [] });
  await login(page);
  await page.getByRole('button', { name: '2 usuarios online', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios registrados', exact: true })).toBeVisible();
  const section = page.getByRole('region', { name: 'Estado de Matthias' });
  await expect(section).toBeVisible();
  await section.getByRole('combobox', { name: 'Perfil sintético de Matthias' }).selectOption('improving');
  await section.getByRole('button', { name: 'Probar a Matthias', exact: true }).click();
  await expect(section.getByText(/Eso ha sido bueno\. Muy bueno\./)).toBeVisible();
  await expect(section.getByText(/sandbox sintético/i)).toBeVisible();
});

test('Matthias · la tarjeta de rival muestra el historial específico del duelo', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  await page.evaluate(() => {
    localStorage.setItem('chess-study-cpu-rivalry', JSON.stringify({
      version: 3,
      totalGames: 8,
      record: { games: 8, wins: 3, draws: 1, losses: 4, currentStreak: -1, bestHumanStreak: 2, bestCpuStreak: 2, incidents: {}, recentGames: [], milestones: {}, byTimeControl: {}, byOpening: {}, memories: [] },
      incidents: {},
    }));
  });
  await startQuickGame(page);
  const matthiasRail = page.getByLabel(/Matthias, CPU/);
  await expect(matthiasRail).toContainText(/duelo 3V 1T 4D/i);
});
