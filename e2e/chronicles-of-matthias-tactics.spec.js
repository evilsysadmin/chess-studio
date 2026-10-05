import { expect, test } from '@playwright/test';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

// Direct edits to this spec must schedule the specialized Chronicles browser lane.
async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openTactics(page, {
  progression = null,
  apiOptions = {},
  expectReady = true,
  authenticated = false,
} = {}) {
  if (!authenticated) {
    await mockApi(page, apiOptions);
    await login(page);
  }
  await dismissGuide(page);
  if (progression) {
    await page.evaluate((value) => {
      localStorage.setItem('chess-study-chronicles-progression-v1', JSON.stringify(value));
    }, progression);
  }
  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toBeVisible();
  await experiments.click();
  const tacticalTable = page.getByRole('button').filter({ hasText: 'Abrir la mesa táctica' });
  await expect(tacticalTable).toBeVisible();
  await tacticalTable.click();
  await confirmChroniclesCharacterSetup(page);
  if (expectReady) {
    await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();
  }
}

async function openFirstPerson(page, {
  apiOptions = {},
  expectReady = true,
} = {}) {
  await mockApi(page, apiOptions);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toBeVisible();
  await experiments.click();
  const bookOne = page.getByRole('button', { name: /BOOK I.*Chronicles of Matthias/i });
  await expect(bookOne).toBeVisible();
  await bookOne.click();
  await confirmChroniclesCharacterSetup(page);
  if (expectReady) {
    await expect(page.locator('[data-chronicles="true"]')).toBeVisible();
  }
}

test('Chronicles primera persona · monta el mapa autoritativo y nunca la entrada local legacy', async ({ page }) => {
  const requestLog = [];
  await openFirstPerson(page, {
    apiOptions: {
      requestLog,
      chroniclesCurrentMapId: 'menagerie-of-ash',
    },
  });

  const root = page.locator('[data-chronicles="true"]');
  await expect(root).toHaveAttribute('data-chronicles-map-id', 'menagerie-of-ash');
  await expect(root.locator('[data-chronicles-renderer="three"] canvas')).toHaveCount(1, { timeout: 30_000 });

  const runRequests = requestLog.filter((entry) => (
    entry.method === 'POST' && entry.path === '/api/chronicles/runs'
  ));
  expect(runRequests).toHaveLength(1);
  expect(runRequests[0].idempotencyKey).toBeTruthy();

  const storedRun = await page.evaluate(() => {
    const raw = localStorage.getItem('chess-study-chronicles-run-v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(storedRun?.id).toBe(runRequests[0].idempotencyKey);
  expect(storedRun?.ended).toBe(false);
});

test('Chronicles primera persona · fallo de bootstrap queda fail-closed y no monta la cripta local', async ({ page }) => {
  await openFirstPerson(page, {
    apiOptions: { chroniclesRunFailureStatus: 503 },
    expectReady: false,
  });

  const error = page.getByRole('alert');
  await expect(error.getByRole('heading', { name: 'No se pudo preparar Chronicles', exact: true })).toBeVisible();
  await expect(error).toContainText('No se cargará la cripta local como sustituto.');
  await expect(page.locator('[data-chronicles-renderer="three"] canvas')).toHaveCount(0);
  await expect(page.locator('[data-chronicles="true"]')).toHaveCount(0);
});

test('Chronicles Tactics · arranca como RPG táctico isométrico · locomoción continua', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');
  const narrator = mode.locator('.chronicles-tactics__narrator p');
  const rendererHost = mode.locator('[data-chronicles-tactics-renderer="three"]');
  const moveNorth = mode.getByRole('button', { name: 'Mover al norte', exact: true });

  await expect(narrator).toBeVisible();
  await expect(moveNorth).toBeEnabled();
  await page.keyboard.down('ArrowUp');
  await expect(rendererHost).toHaveAttribute('data-chronicles-party-motion', 'walking');
  await page.keyboard.up('ArrowUp');
  await expect(narrator).toContainText(/La compañía avanza hacia norte/i);

  const releasedCell = await mode.evaluate((node) => ({
    x: node.getAttribute('data-party-x'),
    y: node.getAttribute('data-party-y'),
  }));
  await page.waitForTimeout(260);
  await expect(mode).toHaveAttribute('data-party-x', releasedCell.x);
  await expect(mode).toHaveAttribute('data-party-y', releasedCell.y);
});

test('Chronicles Tactics · arranca como RPG táctico isométrico · exploración a combate', async ({ page }) => {
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');
  await expect(mode.locator('[data-chronicles-tactics-renderer="three"] canvas')).toHaveCount(1, { timeout: 30_000 });
  await expect(mode).toHaveAttribute('data-engagement', 'exploration');
  await expect(mode).toHaveAttribute('data-party-x', '1');
  await expect(mode).toHaveAttribute('data-party-y', '5');

  const moveNorth = mode.getByRole('button', { name: 'Mover al norte', exact: true });
  await page.waitForTimeout(140);
  await expect(moveNorth).toBeEnabled();
  await moveNorth.evaluate((button) => button.click());
  await expect(mode).toHaveAttribute('data-engagement', 'exploration');

  await page.waitForTimeout(140);
  await expect(moveNorth).toBeEnabled();
  await moveNorth.evaluate((button) => button.click());
  await expect(mode).toHaveAttribute('data-engagement', 'exploration');

  await page.waitForTimeout(140);
  const moveEast = mode.getByRole('button', { name: 'Mover al este', exact: true });
  await expect(moveEast).toBeEnabled();
  await moveEast.evaluate((button) => button.click());
  await expect(mode).toHaveAttribute('data-engagement', 'combat');
  await expect(mode).not.toHaveAttribute('data-initiative-actor', '');

  // Initiative is intentionally random (AGI + 1d8). The browser canary owns
  // integration, not a full scripted battle: wait for the first real party turn,
  // prove the HUD follows that actor synchronously, then pass exactly one turn.
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-chronicles-tactics="true"]');
    return root?.dataset.turnPhase === 'party' && Boolean(root?.dataset.initiativeActor);
  }, null, { timeout: 10_000 });

  const beforePass = await page.evaluate(() => {
    const root = document.querySelector('[data-chronicles-tactics="true"]');
    if (!root) throw new Error('Tactics root ausente');
    const actorId = root.dataset.initiativeActor || '';
    const selected = root.querySelector('.chronicles-party-hud__member.is-selected')?.getAttribute('data-member-id') || '';
    const pass = [...root.querySelectorAll('button')]
      .find((node) => node.getAttribute('aria-label') === 'Pasar turno');
    return {
      actorId,
      selected,
      passEnabled: Boolean(pass && !pass.disabled),
      camera: root.dataset.camera,
      combat: root.dataset.combat,
      engagement: root.dataset.engagement,
      partyMembers: root.querySelectorAll('.chronicles-party-hud__member[data-member-id]').length,
      hasCanvas: Boolean(root.querySelector('[data-chronicles-tactics-renderer="three"] canvas')),
      text: root.textContent || '',
    };
  });

  expect(beforePass.actorId).toBeTruthy();
  expect(beforePass.selected).toBe(beforePass.actorId);
  expect(beforePass.passEnabled).toBe(true);
  expect(beforePass.camera).toBe('isometric-behind-party');
  expect(beforePass.combat).toBe('turn-based');
  expect(beforePass.engagement).toBe('combat');
  expect(beforePass.partyMembers).toBe(4);
  expect(beforePass.hasCanvas).toBe(true);
  expect(beforePass.text).toMatch(/exploración libre/i);
  expect(beforePass.text).toMatch(/combate por turnos/i);
  expect(beforePass.text).toMatch(/Espadachín/i);
  expect(beforePass.text).toMatch(/Taumaturgo/i);
  expect(beforePass.text).toMatch(/Hostigador/i);

  await page.evaluate(() => {
    const root = document.querySelector('[data-chronicles-tactics="true"]');
    const pass = [...(root?.querySelectorAll('button') || [])]
      .find((node) => node.getAttribute('aria-label') === 'Pasar turno');
    if (!pass || pass.disabled) throw new Error('Pasar turno no está disponible');
    pass.click();
  });

  await page.waitForFunction((previousActorId) => {
    const actorId = document.querySelector('[data-chronicles-tactics="true"]')?.dataset.initiativeActor || '';
    return Boolean(actorId && actorId !== previousActorId);
  }, beforePass.actorId, { timeout: 10_000 });

});
test('Chronicles · Tactics → primera persona conserva una única expedición autoritativa', async ({ page }) => {
  const requestLog = [];
  await openTactics(page, { apiOptions: { requestLog } });

  await expect.poll(() => requestLog.filter((entry) => (
    entry.method === 'POST' && entry.path === '/api/chronicles/runs'
  )).length).toBe(1);

  const firstRequest = requestLog.find((entry) => (
    entry.method === 'POST' && entry.path === '/api/chronicles/runs'
  ));
  expect(firstRequest?.idempotencyKey).toBeTruthy();

  const firstRun = await page.evaluate(() => {
    const raw = localStorage.getItem('chess-study-chronicles-run-v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(firstRun?.id).toBe(firstRequest.idempotencyKey);
  expect(firstRun?.ended).toBe(false);

  const exit = page.getByRole('button', { name: '← Experimentos', exact: true });
  await expect(exit).toBeVisible();
  await exit.evaluate((button) => button.click());
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();

  const bookOne = page.getByRole('button', { name: /BOOK I.*Chronicles of Matthias/i });
  await expect(bookOne).toBeVisible();
  await bookOne.click();
  await confirmChroniclesCharacterSetup(page);
  await expect(page.locator('[data-chronicles="true"]')).toBeVisible();

  await expect.poll(() => requestLog.filter((entry) => (
    entry.method === 'POST' && entry.path === '/api/chronicles/runs'
  )).length).toBe(2);

  const runRequests = requestLog.filter((entry) => (
    entry.method === 'POST' && entry.path === '/api/chronicles/runs'
  ));
  expect(runRequests[1].idempotencyKey).toBe(runRequests[0].idempotencyKey);

  const sharedRun = await page.evaluate(() => {
    const raw = localStorage.getItem('chess-study-chronicles-run-v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(sharedRun?.id).toBe(firstRun.id);
  expect(sharedRun?.ended).toBe(false);
});

test('Chronicles Tactics · reiniciar incursión solicita una expedición autoritativa nueva', async ({ page }) => {
  const runRequests = [];
  page.on('request', (request) => {
    try {
      const url = new URL(request.url());
      if (request.method() !== 'POST' || url.pathname !== '/api/chronicles/runs') return;
      runRequests.push(request.headers()['idempotency-key'] || '');
    } catch {
      // Ignore non-URL browser internals.
    }
  });

  await openTactics(page);
  await expect.poll(() => runRequests.length).toBeGreaterThan(0);
  const initialRequestCount = runRequests.length;
  const firstRun = await page.evaluate(() => {
    const raw = localStorage.getItem('chess-study-chronicles-run-v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(firstRun?.id).toBeTruthy();

  const restart = page.getByRole('button', { name: 'Reiniciar incursión', exact: true });
  await expect(restart).toBeVisible();
  await restart.evaluate((button) => button.click());

  await expect.poll(() => runRequests.length).toBeGreaterThan(initialRequestCount);
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();

  const secondRun = await page.evaluate(() => {
    const raw = localStorage.getItem('chess-study-chronicles-run-v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(secondRun?.id).toBeTruthy();
  expect(secondRun.id).not.toBe(firstRun.id);
  expect(runRequests.at(-1)).toBe(secondRun.id);
  expect(runRequests[initialRequestCount - 1]).toBe(firstRun.id);
});

test('Chronicles Tactics · bootstrap remoto fallido bloquea gameplay con error controlado', async ({ page }) => {
  await openTactics(page, {
    apiOptions: { chroniclesRunFailureStatus: 503 },
    expectReady: false,
  });

  const error = page.getByRole('alert');
  await expect(error.getByRole('heading', { name: 'No se pudo preparar Chronicles', exact: true })).toBeVisible();
  await expect(error.getByText('Código CHR-BOOT-002', { exact: true })).toBeVisible();
  await expect(error.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
  await expect(error.getByRole('button', { name: 'Salir de Chronicles', exact: true })).toBeVisible();
  await expect(page.locator('[data-chronicles-tactics-renderer="three"] canvas')).toHaveCount(0);
  await expect(page.locator('[data-chronicles-tactics="true"]')).toHaveCount(0);
});

test('Chronicles Tactics · un 409 de run obsoleta rota la identidad una vez y recupera el arranque', async ({ page }) => {
  const runRequests = [];
  await mockApi(page);
  let rejectStaleRun = true;
  await page.route('http://localhost:4000/api/chronicles/runs', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    runRequests.push(request.headers()['idempotency-key'] || '');
    if (!rejectStaleRun) return route.fallback();
    rejectStaleRun = false;
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      headers: { 'X-Request-ID': 'e2e-stale-chronicles-run' },
      body: JSON.stringify({
        detail: 'La revisión de contenido de esta run ya no está disponible.',
        requestId: 'e2e-stale-chronicles-run',
      }),
    });
  });

  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await page.getByRole('button').filter({ hasText: 'Abrir la mesa táctica' }).click();
  await confirmChroniclesCharacterSetup(page);

  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();
  await expect.poll(() => runRequests.length).toBe(2);
  expect(runRequests[0]).toBeTruthy();
  expect(runRequests[1]).toBeTruthy();
  expect(runRequests[1]).not.toBe(runRequests[0]);

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('chess-study-chronicles-run-v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(stored?.id).toBe(runRequests[1]);
  expect(stored?.ended).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Chronicles Tactics · elegir doctrina desde la ficha consume skill point y cierra la alternativa', async ({ page }) => {
  await openTactics(page, {
    progression: {
      version: 1,
      heroes: {
        matthias: {
          xp: 40,
          attributePoints: 0,
          skillPoints: 1,
          attributes: { vigor: 0, power: 0, precision: 0, will: 0 },
          skills: [],
        },
      },
      claimedAwards: [],
    },
  });
  const mode = page.locator('[data-chronicles-tactics="true"]');
  const openSheet = mode.getByRole('button', { name: 'Abrir ficha de Matthias', exact: true });
  await expect(openSheet).toBeVisible();
  // The sheet is progressive disclosure: the combat HUD remains compact and the
  // progression controls only materialize when the player explicitly opens a hero.
  await openSheet.evaluate((button) => button.click());
  const sheet = mode.getByRole('dialog', { name: 'Matthias' });
  await expect(sheet).toBeVisible();

  const tempo = sheet.getByRole('button', { name: /Tempo de hierro/i });
  const rupture = sheet.getByRole('button', { name: /Ruptura maestra/i });
  await expect(tempo).toBeEnabled();
  await expect(rupture).toBeEnabled();
  // This case owns the progression state contract, not pointer hit-testing. On
  // software WebGL runners Playwright's physical-click navigation waiter can be
  // starved by the live scene after the browser has already dispatched the same
  // DOM click. Invoke the real button click directly, then prove the resulting
  // learned/closed state below.
  await tempo.evaluate((button) => button.click());

  await expect(sheet.getByRole('button', { name: /Tempo de hierro.*Aprendida/i })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: /Ruptura maestra.*Rama cerrada/i })).toBeDisabled();
});

test('Chronicles Tactics · móvil conserva canvas y controles de acción sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');
  await expect(mode.locator('[data-chronicles-tactics-renderer="three"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByRole('button', { name: 'Mover al norte' })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Mover al oeste' })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Usar', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Atacar', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Habilidad de clase', exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});