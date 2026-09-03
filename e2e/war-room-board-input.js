import { expect } from '@playwright/test';
import { getWarRoomMobileFramingProfile } from '../frontend/src/components/WarRoomMobileFraming.js';

function normalized(vector) {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function desktopFramingProfile(aspect) {
  return aspect >= 1.42
    ? {
        halfSpan: 5.38,
        padding: 1.07,
        minDistance: 13.2,
        maxDistance: 22.6,
        targetY: 1.08,
        targetZ: -0.16,
        cameraY: 7.35,
        cameraZ: 10.6,
      }
    : {
        halfSpan: 5.78,
        padding: 1.13,
        minDistance: 14.5,
        maxDistance: 25.6,
        targetY: 0.92,
        targetZ: -0.08,
        cameraY: 8.2,
        cameraZ: 10.72,
      };
}

function projectSquare(rect, square, {
  whiteSide,
  coarsePointer,
  viewportWidth,
  worldY,
}) {
  const aspect = Math.max(0.35, rect.width / Math.max(1, rect.height));
  const profile = getWarRoomMobileFramingProfile({ aspect, coarsePointer, viewportWidth }) || desktopFramingProfile(aspect);
  const verticalFov = 40 * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const unclampedDistance = (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding;
  const distance = Math.max(profile.minDistance, Math.min(profile.maxDistance, unclampedDistance));
  const target = [0, profile.targetY, whiteSide ? -profile.targetZ : profile.targetZ];
  const direction = normalized([0, profile.cameraY, whiteSide ? profile.cameraZ : -profile.cameraZ]);
  const camera = target.map((value, index) => value + direction[index] * distance);
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const point = [fileIndex - 3.5, worldY, 4.5 - rank];
  const forward = normalized(target.map((value, index) => value - camera[index]));
  const right = normalized(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const relative = point.map((value, index) => value - camera[index]);
  const depth = dot(relative, forward);
  const ndcX = dot(relative, right) / (depth * Math.tan(verticalFov / 2) * aspect);
  const ndcY = dot(relative, up) / (depth * Math.tan(verticalFov / 2));
  return {
    x: rect.x + ((ndcX + 1) / 2) * rect.width,
    y: rect.y + ((1 - ndcY) / 2) * rect.height,
  };
}

async function pointerProfile(page, canvas) {
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('War Room canvas has no bounding box');
  const environment = await page.evaluate(() => ({
    coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)')?.matches),
    viewportWidth: Number(window.innerWidth) || 0,
  }));
  return { rect, ...environment };
}

async function clickProjectedSquare(page, square, whiteSide, profile, worldY) {
  const point = projectSquare(profile.rect, square, {
    whiteSide,
    coarsePointer: profile.coarsePointer,
    viewportWidth: profile.viewportWidth,
    worldY,
  });
  await page.mouse.click(point.x, point.y);
}

export async function clickWarRoomMove(page, from, to) {
  const board = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  if (!(await board.isVisible().catch(() => false)) || !(await canvas.isVisible().catch(() => false))) return false;

  const profile = await pointerProfile(page, canvas);
  let whiteSide = true;

  // Orientation is presentation state, not chess state. Rather than teaching
  // every generic E2E about the human colour, probe the real renderer: the
  // correct camera projection must select exactly the requested source square.
  await clickProjectedSquare(page, from, true, profile, 0.76);
  try {
    await expect(board).toHaveAttribute('data-board3d-selected', from, { timeout: 800 });
  } catch {
    whiteSide = false;
    await clickProjectedSquare(page, from, false, profile, 0.76);
    await expect(board).toHaveAttribute('data-board3d-selected', from, { timeout: 2_500 });
  }

  await clickProjectedSquare(page, to, whiteSide, profile, 0.12);
  return true;
}
