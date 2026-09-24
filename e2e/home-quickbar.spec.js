import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test.use({ viewport: { width: 1672, height: 941 } });

test('Home quick-access bar: collapsed by default, lists every action, highlights the prop, Escape closes', async ({ page }) => {
  await mockApi(page);
  await login(page);
  const home = page.getByRole('region', { name: 'Modos principales' });
  const stage = home.locator('.illustrated-home__stage');
  const toggle = home.getByRole('button', { name: /Accesos rápidos/ });
  const bar = home.getByRole('navigation', { name: 'Accesos rápidos' });

  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(bar).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(bar.getByRole('button')).toHaveCount(6);
  await expect(bar.getByRole('button').first()).toContainText(/JUGAR|CONTINUAR/);

  await bar.locator('.illustrated-home__quickbar-chip--train').focus();
  await expect(stage).toHaveAttribute('data-home-castle-focus', 'train');

  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
