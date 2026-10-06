import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Home · el avatar residente de Matthias abre Así juegas aunque haya partida guardada', async ({ page }) => {
  await mockApi(page, { profileSeed: {
    'matthias.onboarded': '2',
    'chess-study-home-guide-dismissed-v1': '1',
  } });
  await login(page);

  // Una partida prioritaria puede silenciar el bocadillo de Matthias, pero no
  // borrar al personaje de Home. Este estado reproduce perfiles que vuelven a
  // la aplicación con una sesión guardada pendiente de continuar.
  await page.evaluate(() => {
    localStorage.setItem('chess-study-active-game', 'saved-home-presence-e2e');
  });
  await page.reload();

  await expect(page.locator('.home-continue-card:visible, .illustrated-home__destination--play:visible')).toContainText(/Continuar|CONTINUAR/);
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await expect(corner.getByRole('region', { name: 'Mensaje de Matthias' })).toHaveCount(0);

  await corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Así juegas/i }).first()).toBeVisible();
});

// The collapsed global music dock lives in the lower-left corner of the
// desktop Home; Matthias' low stations share that band. Neither the resident
// avatar nor his speech bubble may sit under the dock.
for (const [width, height] of [[1024, 768], [1280, 720], [1440, 900]]) {
  test(`Home ${width}×${height} · el reproductor plegado no tapa a Matthias ni a su bocadillo`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockApi(page, { profileSeed: { 'chess-study-home-guide-dismissed-v1': '1' } });
    await login(page);
    await expect(page.locator('.global-music-dock .music-deck-collapsed')).toBeVisible();
    await expect(page.locator('.illustrated-home__matthias')).toBeVisible();

    const boxes = await page.evaluate(() => {
      const box = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      return {
        dock: box('.global-music-dock'),
        matthias: box('.illustrated-home__matthias'),
        speech: box('.illustrated-home__speech'),
      };
    });
    const intersects = (a, b) => Boolean(a && b) && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    expect(boxes.dock).not.toBeNull();
    expect(intersects(boxes.dock, boxes.matthias), JSON.stringify(boxes)).toBe(false);
    expect(intersects(boxes.dock, boxes.speech), JSON.stringify(boxes)).toBe(false);
  });
}
