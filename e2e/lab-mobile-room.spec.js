import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const VIEWPORTS = [
  { width: 360, height: 640, name: 'portrait estrecho' },
  { width: 390, height: 844, name: 'portrait alto' },
  { width: 780, height: 360, name: 'landscape estrecho' },
  { width: 915, height: 412, name: 'landscape ancho' },
];

for (const viewport of VIEWPORTS) {
  test(`Experimentos móvil ${viewport.name} · entradas visibles en primer pantallazo`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockApi(page);
    await login(page);

    const moreModes = await openMoreGameModes(page);
    await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
    await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();

    const entrances = page.locator('.lab-workshop-portal, .lab-workshop-map-table, .lab-workshop-tool');
    await expect(entrances).toHaveCount(8);
    const checks = await entrances.evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const target = document.elementFromPoint(x, y);
      return {
        title: button.textContent.trim().replace(/\s+/g, ' ').slice(0, 45),
        size: rect.height,
        insideViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1
          && rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
        unobstructed: Boolean(target && button.contains(target)),
      };
    }));

    for (const check of checks) {
      expect(check.insideViewport, `${check.title} fuera del primer pantallazo`).toBe(true);
      expect(check.unobstructed, `${check.title} tapado por otro elemento`).toBe(true);
      expect(check.size, `${check.title} demasiado pequeño para touch`).toBeGreaterThanOrEqual(44);
    }

    const headerControls = await page.locator('.masthead-feedback-trigger, .masthead-account-trigger')
      .evaluateAll((buttons) => buttons.map((button) => {
        const { left, right, top, bottom, width, height } = button.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      }));
    expect(headerControls).toHaveLength(2);
    const [feedback, account] = headerControls;
    expect(feedback.right <= account.left || account.right <= feedback.left
      || feedback.bottom <= account.top || account.bottom <= feedback.top,
    'Feedback y Mi cuenta no pueden solaparse').toBe(true);
    for (const button of headerControls) {
      expect(button.width, 'control global demasiado pequeño').toBeGreaterThanOrEqual(44);
      expect(button.height, 'control global demasiado pequeño').toBeGreaterThanOrEqual(44);
    }

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow, 'overflow horizontal en la sala').toBeLessThanOrEqual(1);

    await page.screenshot({
      path: testInfo.outputPath(`experiments-${viewport.width}x${viewport.height}.png`),
      fullPage: false,
    });
  });
}
