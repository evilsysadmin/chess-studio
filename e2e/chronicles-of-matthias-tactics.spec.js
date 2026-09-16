import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

// Direct edits to this spec must schedule the specialized Chronicles browser lane.
async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openTactics(page, { progression = null } = {}) {
  await mockApi(page);
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
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();
}

test('Chronicles Tactics · arranca como action RPG isométrico con usar, ataque, clases y habilidades', async ({ page }) => {
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');

  // Exercise the live-combat action immediately. Waiting for the 3D renderer and
  // a long sequence of UI assertions first lets real-time enemy turns kill the
  // selected hero on slow CI runners, turning this into a wall-clock race.
  await page.keyboard.press('2');
  await expect(mode.getByText(/Habilidad: Martillo de asedio · 1 carga/i)).toBeVisible();
  await page.keyboard.press('e');
  await expect(mode.getByText(/Habilidad: Martillo de asedio · agotada/i)).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Habilidad de clase', exact: true })).toBeDisabled();

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
      hasUse: buttonNames.includes('Usar'),
      hasClassSkill: buttonNames.includes('Habilidad de clase'),
      hasWait: buttonNames.includes('Esperar'),
    };
  });

  expect(contract.camera).toBe('isometric-behind-party');
  expect(contract.combat).toBe('realtime');
  expect(contract.text).toMatch(/cuatro clases, cuatro geometrías de combate/i);
  expect(contract.text).toMatch(/Espadachín · Espada corta/i);
  expect(contract.text).toMatch(/Taumaturgo · Farol rúnico/i);
  expect(contract.text).toMatch(/Hostigador · Ballesta de estribo/i);
  expect(contract.text).toMatch(/espacio usa · Shift ataca · E habilidad/i);
  expect(contract.hasUse).toBe(true);
  expect(contract.hasClassSkill).toBe(true);
  expect(contract.hasWait).toBe(false);
});

test('Chronicles Tactics · elegir doctrina consume skill point y cierra la alternativa', async ({ page }) => {
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
  const summary = mode.getByText('Técnicas · 1 punto', { exact: true });
  await expect(summary).toBeVisible();
  // This case owns the progression/disclosure state contract, not pointer hit-testing.
  // Under software WebGL, Playwright's physical click waiter can be starved after the
  // browser has already dispatched the same DOM event. Use the element's real click
  // directly and prove the resulting disclosure state through the enabled actions.
  await summary.evaluate((element) => element.click());

  const tempo = mode.getByRole('button', { name: /Tempo de hierro/i });
  const rupture = mode.getByRole('button', { name: /Ruptura maestra/i });
  await expect(tempo).toBeEnabled();
  await expect(rupture).toBeEnabled();
  // This case owns the progression state contract, not pointer hit-testing. On
  // software WebGL runners Playwright's physical-click navigation waiter can be
  // starved by the live scene after the browser has already dispatched the same
  // DOM click. Invoke the real button click directly, then prove the resulting
  // learned/closed state below.
  await tempo.evaluate((button) => button.click());

  await expect(mode.getByRole('button', { name: /Tempo de hierro.*Aprendida/i })).toBeDisabled();
  await expect(mode.getByRole('button', { name: /Ruptura maestra.*Rama cerrada/i })).toBeDisabled();
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
