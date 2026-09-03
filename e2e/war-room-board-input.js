import { expect } from '@playwright/test';

const FILES = 'abcdefgh';
const ARROW_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'];
const INVERSE_KEY = {
  ArrowRight: 'ArrowLeft',
  ArrowLeft: 'ArrowRight',
  ArrowUp: 'ArrowDown',
  ArrowDown: 'ArrowUp',
};

function squareDistance(a, b) {
  const fileA = FILES.indexOf(String(a || '')[0]);
  const fileB = FILES.indexOf(String(b || '')[0]);
  const rankA = Number(String(a || '')[1]);
  const rankB = Number(String(b || '')[1]);
  if (fileA < 0 || fileB < 0 || !Number.isFinite(rankA) || !Number.isFinite(rankB)) return Number.POSITIVE_INFINITY;
  return Math.abs(fileA - fileB) + Math.abs(rankA - rankB);
}

async function focusedSquare(board) {
  return String(await board.getAttribute('data-board3d-focused') || '');
}

async function navigateWarRoomKeyboard(canvas, board, target) {
  await canvas.focus();

  for (let step = 0; step < 18; step += 1) {
    const current = await focusedSquare(board);
    if (current === target) return;
    const currentDistance = squareDistance(current, target);

    let advanced = false;
    for (const key of ARROW_KEYS) {
      await canvas.press(key);
      const next = await focusedSquare(board);
      if (next === target) return;
      if (next !== current && squareDistance(next, target) < currentDistance) {
        advanced = true;
        break;
      }
      if (next !== current) {
        await canvas.press(INVERSE_KEY[key]);
        await expect(board).toHaveAttribute('data-board3d-focused', current, { timeout: 1_000 });
      }
    }

    if (!advanced) {
      throw new Error(`War Room keyboard navigation could not advance from ${current || '?'} to ${target}`);
    }
  }

  throw new Error(`War Room keyboard navigation exceeded step budget while targeting ${target}`);
}

/**
 * Generic renderer-agnostic E2E input for War Room.
 *
 * Dedicated pointer/touch specs exercise projection and hit-testing directly.
 * Generic journeys (School, restore, golden paths...) should instead use the
 * renderer's real keyboard accessibility contract, which is independent of the
 * camera framing and therefore works in both the full War Room and embedded 3D
 * boards. We discover orientation from the actual focused-square transitions
 * rather than duplicating camera/orientation maths in every test surface.
 */
export async function clickWarRoomMove(page, from, to) {
  const board = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  if (!(await board.isVisible().catch(() => false)) || !(await canvas.isVisible().catch(() => false))) return false;

  await navigateWarRoomKeyboard(canvas, board, from);
  await canvas.press('Enter');
  await expect(board).toHaveAttribute('data-board3d-selected', from, { timeout: 2_500 });

  await navigateWarRoomKeyboard(canvas, board, to);
  await canvas.press('Enter');
  return true;
}
