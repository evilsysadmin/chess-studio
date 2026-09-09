import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { warRoomHansEventForGame } from '../frontend/src/components/WarRoomHansEventContract.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;

function firstE2EFireGameIndex() {
  for (let index = 1; index <= 64; index += 1) {
    if (warRoomHansEventForGame(`e2e-game-${index}`) === 'fire') return index;
  }
  throw new Error('Hans fire-call E2E could not find a deterministic fire game id');
}

async function seedGamesBeforeFire(page) {
  const fireIndex = firstE2EFireGameIndex();
  if (fireIndex <= 1) return;
  await page.evaluate(async (count) => {
    for (let index = 1; index < count; index += 1) {
      await fetch('http://localhost:4000/api/games', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      });
    }
  }, fireIndex);
}

async function waitForHansReplyRendered(page, timeoutMs = 20_000) {
  await page.evaluate((timeout) => new Promise((resolve, reject) => {
    const selector = '.warroom-fire-call-bubble-hans';
    const replyPattern = /HANS\s*Sí, señor\./;

    const matchesReply = (element) => {
      if (!(element instanceof Element) || !element.matches(selector)) return false;
      const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return replyPattern.test(text)
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0;
    };

    const findReply = (root) => {
      if (matchesReply(root)) return true;
      if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) return false;
      return Array.from(root.querySelectorAll(selector)).some(matchesReply);
    };

    if (findReply(document)) {
      resolve(true);
      return;
    }

    let timer = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!findReply(node)) continue;
          clearTimeout(timer);
          observer.disconnect();
          resolve(true);
          return;
        }
      }
      if (findReply(document)) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('Hans reply bubble was not rendered before timeout'));
    }, timeout);
  }), timeoutMs);
}

test('War Room · Matthias llama a Hans por el fuego y Hans responde al aparecer', async ({ page }) => {
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);
  // Hans now has one deterministic ambient event per game. Seed the mock game's
  // counter so this dedicated lane actually exercises the fire event rather than
  // whichever chore e2e-game-1 happens to hash to.
  await seedGamesBeforeFire(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });

  const matthiasCall = page.getByRole('status', { name: 'Matthias llama a Hans por el fuego' });
  await expect(matthiasCall).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  // The call is intentionally brief. Assert its own contract immediately: a
  // cold 3D mount can replace the canvas while the scene reaches its ready
  // frame, and waiting on that new canvas must not consume the whole bubble.
  await expect(matthiasCall).toContainText('MATTHIAS');
  await expect(matthiasCall).toContainText('HANS! El fuego, bitte.');
  await expect(matthiasCall).toHaveAttribute('data-matthias-square', /^[a-h][1-8]$/);
  await expect(canvas).toHaveAttribute('data-war-room-hans-scene-ready', 'true');
  await expect(canvas).toHaveAttribute('data-war-room-hans-screen', 'hidden');

  await expect(page.getByRole('status', { name: 'Bravuconada de Matthias al iniciar la partida' })).toHaveCount(0);

  // Arm the observer before release can turn into the short Hans reply. On
  // software WebGL a long render frame can make polling miss the 1.6 s bubble
  // even though the browser visibly paints it and the narrative advances.
  const hansReplyRendered = waitForHansReplyRendered(page);
  await expect(canvas).toHaveAttribute('data-war-room-hans-call-released', 'true', { timeout: 8_000 });
  await hansReplyRendered;
  await expect(canvas).toHaveAttribute('data-war-room-hans-screen', 'onscreen');
  await expect(matthiasCall).toBeHidden();
});
