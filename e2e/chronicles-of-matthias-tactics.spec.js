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
} = {}) {
  await mockApi(page, apiOptions);
  await login(page);
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

test('Chronicles Tactics · arranca como RPG táctico isométrico con combate por turnos, clases y habilidades', async ({ page }) => {
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');

  // Prove a real world-state transition before exercising combat UI. North is
  // deliberately safe on the canonical crypt spawn, so this canary verifies
  // movement without coupling the assertion to enemy AI timing.
  const narrator = mode.locator('.chronicles-tactics__narrator p');
  const moveNorth = mode.getByRole('button', { name: 'Mover al norte', exact: true });
  await expect(narrator).toBeVisible();
  await expect(moveNorth).toBeEnabled();
  await moveNorth.evaluate((button) => button.click());
  await expect(narrator).toContainText(/La compañía avanza hacia norte/i);

  // Return to the canonical engagement cell before exercising the existing
  // class-skill contract. The move throttle is gameplay logic, so respect it
  // instead of bypassing it in the browser canary.
  await page.waitForTimeout(140);
  const moveSouth = mode.getByRole('button', { name: 'Mover al sur', exact: true });
  await expect(moveSouth).toBeEnabled();
  await moveSouth.evaluate((button) => button.click());
  await expect(narrator).toContainText(/La compañía avanza hacia sur/i);

  // Exercise a real combat action immediately. Turn-based combat means the
  // enemy answers only after this action, never because the CI runner is slow.
  await page.keyboard.press('2');
  const rookCard = mode.locator('[data-member-id="rook"]');
  await expect(rookCard).toHaveClass(/is-selected/);
  await expect(rookCard.locator('.chronicles-party-hud__vital--mp small')).toHaveText('1/1');
  // This assertion owns the ability state transition, not browser keyboard delivery.
  // SwiftShader can starve Playwright keyboard dispatch while the 3D scene is busy,
  // even though the same React action remains available. Invoke the real button
  // handler directly, as the doctrine test below already does for the same CI reason.
  const classSkill = mode.getByRole('button', { name: 'Habilidad de clase', exact: true });
  await expect(classSkill).toBeEnabled();
  await classSkill.evaluate((button) => button.click());
  await expect(rookCard.locator('.chronicles-party-hud__vital--mp small')).toHaveText('0/1');
  await expect(classSkill).toBeDisabled();

  const canvas = mode.locator('[data-chronicles-tactics-renderer="three"] canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // Keep the renderer readiness assertion above as a real Playwright wait, then
  // read the stable UI contract in one browser hop. Under SwiftShader every
  // instrumented assertion against this continuously rendered scene can cost
  // several seconds of trace/snapshot work; serializing ten of them turns a
  // healthy UI into a 90 s timeout without increasing coverage.
  const contract = await mode.evaluate((root) => {
    const buttonNames = [...root.querySelectorAll('button')]
      .map((button) => button.getAttribute('aria-label') || button.textContent || '')
      .map((label) => label.trim());
    return {
      camera: root.dataset.camera,
      combat: root.dataset.combat,
      text: root.textContent || '',
      partyMembers: root.querySelectorAll('.chronicles-party-hud__member[data-member-id]').length,
      sheetTriggers: buttonNames.filter((label) => label.startsWith('Abrir ficha de ')).length,
      hasUse: buttonNames.includes('Usar'),
      hasClassSkill: buttonNames.includes('Habilidad de clase'),
      hasWait: buttonNames.includes('Esperar'),
    };
  });

  expect(contract.camera).toBe('isometric-behind-party');
  expect(contract.combat).toBe('turn-based');
  expect(contract.text).toMatch(/exploración libre/i);
  expect(contract.text).toMatch(/combate por turnos/i);
  expect(contract.text).toMatch(/Espadachín/i);
  expect(contract.text).toMatch(/Taumaturgo/i);
  expect(contract.text).toMatch(/Hostigador/i);
  expect(contract.text).toMatch(/espacio usa · Shift ataca · E habilidad/i);
  expect(contract.partyMembers).toBe(4);
  expect(contract.sheetTriggers).toBe(4);
  expect(contract.hasUse).toBe(true);
  expect(contract.hasClassSkill).toBe(true);
  expect(contract.hasWait).toBe(false);
});

test('Chronicles Tactics · salir y volver a entrar inicia una expedición autoritativa nueva', async ({ page }) => {
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
    const raw = localStorage.getItem('chess-study-chronicles-tactics-run-v2');
    return raw ? JSON.parse(raw) : null;
  });
  expect(firstRun?.id).toBe(firstRequest.idempotencyKey);

  const exit = page.getByRole('button', { name: '← Experimentos', exact: true });
  await expect(exit).toBeVisible();
  await exit.evaluate((button) => button.click());
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();

  const tacticalTable = page.getByRole('button').filter({ hasText: 'Abrir la mesa táctica' });
  await expect(tacticalTable).toBeVisible();
  await tacticalTable.click();
  await confirmChroniclesCharacterSetup(page);
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();

  await expect.poll(() => requestLog.filter((entry) => (
    entry.method === 'POST' && entry.path === '/api/chronicles/runs'
  )).length).toBe(2);

  const runRequests = requestLog.filter((entry) => (
    entry.method === 'POST' && entry.path === '/api/chronicles/runs'
  ));
  expect(runRequests[1].idempotencyKey).toBeTruthy();
  expect(runRequests[1].idempotencyKey).not.toBe(runRequests[0].idempotencyKey);

  const secondRun = await page.evaluate(() => {
    const raw = localStorage.getItem('chess-study-chronicles-tactics-run-v2');
    return raw ? JSON.parse(raw) : null;
  });
  expect(secondRun?.id).toBe(runRequests[1].idempotencyKey);
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
    const raw = localStorage.getItem('chess-study-chronicles-tactics-run-v2');
    return raw ? JSON.parse(raw) : null;
  });
  expect(firstRun?.id).toBeTruthy();

  const restart = page.getByRole('button', { name: 'Reiniciar incursión', exact: true });
  await expect(restart).toBeVisible();
  await restart.evaluate((button) => button.click());

  await expect.poll(() => runRequests.length).toBeGreaterThan(initialRequestCount);
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();

  const secondRun = await page.evaluate(() => {
    const raw = localStorage.getItem('chess-study-chronicles-tactics-run-v2');
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
    const raw = localStorage.getItem('chess-study-chronicles-tactics-run-v2');
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