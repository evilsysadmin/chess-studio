import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

test('War Room · Matthias aprovecha la altura libre del rail sin inflar Cuaderno ni Capturas', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const room = page.locator('.board-live-row.is-3d-warroom');
  const rail = page.locator('.game-side-column-3d .game-warroom-rail');
  const chatLog = rail.locator('.game-chat-log');
  await expect(room).toBeVisible({ timeout: 45_000 });
  await expect(rail).toBeVisible({ timeout: 45_000 });
  await expect(chatLog).toBeVisible();

  // Board3D and its CSS are lazy; validate the settled desktop composition.
  await page.waitForTimeout(1500);

  const geometry = await page.evaluate(() => {
    const roomNode = document.querySelector('.board-live-row.is-3d-warroom');
    const railNode = document.querySelector('.game-side-column-3d .game-warroom-rail');
    const panelNode = document.querySelector('.game-warroom-rail-panel.is-matthias');
    const chatNode = panelNode?.querySelector('.game-chat');
    const logNode = panelNode?.querySelector('.game-chat-log');
    if (!roomNode || !railNode || !panelNode || !chatNode || !logNode) return null;

    const roomRect = roomNode.getBoundingClientRect();
    const railRect = railNode.getBoundingClientRect();
    const panelRect = panelNode.getBoundingClientRect();
    const chatRect = chatNode.getBoundingClientRect();
    const logRect = logNode.getBoundingClientRect();
    const railStyle = getComputedStyle(railNode);
    const logStyle = getComputedStyle(logNode);

    return {
      roomBottom: roomRect.bottom,
      railBottom: railRect.bottom,
      railHeight: railRect.height,
      panelHeight: panelRect.height,
      chatHeight: chatRect.height,
      logHeight: logRect.height,
      railDisplay: railStyle.display,
      railAlignSelf: railStyle.alignSelf,
      logMaxHeight: logStyle.maxHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.railDisplay).toBe('flex');
  expect(geometry.railAlignSelf).toBe('stretch');
  expect(geometry.logMaxHeight).toBe('none');
  expect(geometry.logHeight).toBeGreaterThan(310);
  expect(geometry.panelHeight).toBeGreaterThan(geometry.logHeight);
  expect(geometry.chatHeight).toBeGreaterThanOrEqual(geometry.panelHeight - 2);
  expect(geometry.railBottom).toBeLessThanOrEqual(geometry.roomBottom + 2);
  expect(geometry.roomBottom - geometry.railBottom).toBeLessThan(20);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  const notebook = page.getByRole('button', { name: 'Cuaderno', exact: true });
  await notebook.click();
  const notebookPanel = page.locator('.game-warroom-rail-panel.is-notebook');
  await expect(notebookPanel).toBeVisible();
  expect((await notebookPanel.boundingBox())?.height).toBeLessThanOrEqual(391);

  const captures = page.getByRole('button', { name: 'Capturas', exact: true });
  await captures.click();
  const capturesPanel = page.locator('.game-warroom-rail-panel.is-captures');
  await expect(capturesPanel).toBeVisible();
  expect((await capturesPanel.boundingBox())?.height).toBeLessThanOrEqual(391);
});
