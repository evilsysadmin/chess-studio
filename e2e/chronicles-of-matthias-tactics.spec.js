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
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Abrir la mesa táctica' }).click();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();
}

test('Chronicles Tactics · arranca como action RPG isométrico con usar, ataque, clases y habilidades', async ({ page }) => {
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');
  const canvas = mode.locator('[data-chronicles-tactics-renderer="three"] canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(mode).toHaveAttribute('data-camera', 'isometric-behind-party');
  await expect(mode).toHaveAttribute('data-combat', 'realtime');
  await expect(mode.getByText(/cuatro clases, cuatro geometrías de combate/i)).toBeVisible();
  await expect(mode.getByText(/Espadachín · Espada corta/i)).toBeVisible();
  await expect(mode.getByText(/Taumaturgo · Farol rúnico/i)).toBeVisible();
  await expect(mode.getByText(/Hostigador · Ballesta de estribo/i)).toBeVisible();
  await expect(mode.getByText(/espacio usa · Shift ataca · E habilidad/i)).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Usar', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Habilidad de clase', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Esperar', exact: true })).toHaveCount(0);

  await page.keyboard.press('2');
  await expect(mode.getByText(/Habilidad: Martillo de asedio · 1 carga/i)).toBeVisible();
  await page.keyboard.press('e');
  await expect(mode.getByText(/Habilidad: Martillo de asedio · agotada/i)).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Habilidad de clase', exact: true })).toBeDisabled();
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
  await summary.click();

  const tempo = mode.getByRole('button', { name: /Tempo de hierro/i });
  const rupture = mode.getByRole('button', { name: /Ruptura maestra/i });
  await expect(tempo).toBeEnabled();
  await expect(rupture).toBeEnabled();
  await tempo.click();

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