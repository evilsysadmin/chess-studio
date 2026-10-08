import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const INSIGHTS_DOSSIER_HISTORY = Array.from({ length: 4 }, (_, index) => ({
  id: `visual-insights-dossier-${index}`,
  sourceGameId: `visual-insights-dossier-${index}`,
  date: new Date(Date.UTC(2026, 8, 20 + index)).toISOString(),
  outcome: index % 2 ? 'loss' : 'win',
  mode: 'casual',
  difficulty: 10,
  humanColor: 'w',
  moves: ['e4', 'e5', 'Nf3', 'Nc6'],
  captured: [],
}));

const TRAINING_SCOPE = new Set(
  (process.env.APP_VISUAL_TRAINING_SCOPE || 'all')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

test.use({ viewport: { width: 1440, height: 900 } });

function scopeEnabled(scope) {
  return TRAINING_SCOPE.has('all') || TRAINING_SCOPE.has(scope);
}

function scopedTest(scope, title, body) {
  if (scopeEnabled(scope)) {
    test(title, body);
  }
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(120);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });
  expect(overflow.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function assertInsightsActionableFold(room, label) {
  await expect(room.getByRole('button', { name: /^Empezar sesión recomendada de (5|15|30) min$/ })).toBeVisible();
  const geometry = await room.evaluate((root) => {
    const tools = root.querySelector('.insights-room-tools')?.getBoundingClientRect();
    const session = root.querySelector('.insights-guided-session:not(.active)')?.getBoundingClientRect();
    const recommended = root.querySelector('.insights-guided-focus .primary-btn')?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      toolsBottom: tools?.bottom || 0,
      sessionTop: session?.top || 0,
      recommendedBottom: recommended?.bottom || 0,
    };
  });

  expect(geometry.sessionTop, `${label}: training action starts too low`).toBeLessThan(geometry.viewportHeight * .7);
  expect(geometry.recommendedBottom, `${label}: recommended task CTA falls below the first viewport`).toBeLessThanOrEqual(geometry.viewportHeight - 8);
  expect(geometry.toolsBottom, `${label}: archive tools should sit before the task`).toBeLessThanOrEqual(geometry.sessionTop + 8);
}

async function assertSchoolTouchTargets(shell, label) {
  const undersized = await shell.locator([
    '.matthias-school-toolbar .back-link',
    '.matthias-school-resources > summary',
    '.matthias-school-resources-menu button',
    '.matthias-school-focusbar button',
    '.matthias-school-board-actions button',
    '.matthias-school-nav button',
    '.matthias-school-curriculum-panel button',
    '.matthias-school-curriculum-panel select',
    '.matthias-school-topic-explorer > summary',
    '.matthias-school-focus-mode-bar button',
  ].join(',')).evaluateAll((nodes) => nodes
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
    })
    .map((node) => ({
      text: node.textContent?.trim() || node.getAttribute('aria-label') || node.tagName,
      height: node.getBoundingClientRect().height,
    }))
    .filter((entry) => entry.height < 43.5));
  expect(undersized, `${label}: Class Room touch targets under 44px`).toEqual([]);
}

async function assertSchoolMobileFold(shell, label) {
  const geometry = await shell.evaluate((root) => {
    const board = root.querySelector('.matthias-school-board');
    const actions = root.querySelector('.matthias-school-board-actions');
    const coach = root.querySelector('.matthias-school-coach');
    const boardRect = board?.getBoundingClientRect();
    const actionRect = actions?.getBoundingClientRect();
    const coachRect = coach?.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      boardLeft: boardRect?.left || 0,
      boardTop: boardRect?.top || 0,
      boardRight: boardRect?.right || 0,
      boardBottom: boardRect?.bottom || 0,
      boardWidth: boardRect?.width || 0,
      boardHeight: boardRect?.height || 0,
      actionsBottom: actionRect?.bottom || 0,
      coachBottom: coachRect?.bottom || 0,
      coachPosition: coach ? getComputedStyle(coach).position : '',
      actionCount: actions?.querySelectorAll('button')?.length || 0,
    };
  });
  expect(geometry.boardLeft, `${label}: board starts at the viewport edge`).toBeLessThanOrEqual(1);
  expect(geometry.boardTop, `${label}: board starts at the viewport edge`).toBeLessThanOrEqual(1);
  expect(geometry.boardRight, `${label}: board fills viewport width`).toBeGreaterThanOrEqual(geometry.innerWidth - 1);
  expect(geometry.boardBottom, `${label}: board fills viewport height`).toBeGreaterThanOrEqual(geometry.innerHeight - 1);
  expect(geometry.boardWidth, `${label}: board owns the room width`).toBeGreaterThanOrEqual(geometry.innerWidth * 0.98);
  expect(geometry.boardHeight, `${label}: board owns the room height`).toBeGreaterThanOrEqual(geometry.innerHeight * 0.98);
  expect(geometry.actionsBottom, `${label}: actions stay inside the room`).toBeLessThanOrEqual(geometry.innerHeight);
  expect(geometry.coachBottom, `${label}: Matthias stays inside the room`).toBeLessThanOrEqual(geometry.innerHeight);
  expect(geometry.coachPosition, `${label}: Matthias is an overlay`).toBe('absolute');
  expect(geometry.actionCount, `${label}: expected actionable lesson controls`).toBeGreaterThanOrEqual(3);
}

async function assertSchoolCurriculumLayout(shell, label) {
  const panel = shell.locator('.matthias-school-curriculum-panel');
  const geometry = await panel.evaluate((root) => {
    const rect = root.getBoundingClientRect();
    const courses = root.querySelector('.matthias-school-curriculum-courses');
    const lessons = root.querySelector('.matthias-school-curriculum-lessons');
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      panelOverflow: root.scrollWidth - root.clientWidth,
      coursesOverflow: courses ? courses.scrollWidth - courses.clientWidth : 0,
      lessonsOverflow: lessons ? lessons.scrollWidth - lessons.clientWidth : 0,
    };
  });

  expect(geometry.left, `${label}: curriculum stays inside left edge`).toBeGreaterThanOrEqual(-1);
  expect(geometry.top, `${label}: curriculum stays inside top edge`).toBeGreaterThanOrEqual(-1);
  expect(geometry.right, `${label}: curriculum stays inside right edge`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bottom, `${label}: curriculum stays inside bottom edge`).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.panelOverflow, `${label}: curriculum has no horizontal overflow`).toBeLessThanOrEqual(1);
  expect(geometry.coursesOverflow, `${label}: course list has no horizontal overflow`).toBeLessThanOrEqual(1);
  expect(geometry.lessonsOverflow, `${label}: lesson list has no horizontal overflow`).toBeLessThanOrEqual(1);
}

async function assertSpecialModesDensity(shell) {
  const density = await shell.locator('.mechanic-library').evaluate((root) => {
    const list = root.querySelector('.mechanic-library-list')?.getBoundingClientRect();
    const detail = root.querySelector('.mechanic-library-detail')?.getBoundingClientRect();
    return {
      listHeight: list?.height || 0,
      detailHeight: detail?.height || 0,
    };
  });

  expect(density.detailHeight, 'special modes: detail should size to its lesson, not the rail').toBeLessThanOrEqual(480);
  expect(density.detailHeight, 'special modes: detail should remain visibly shorter than the scroll rail').toBeLessThan(density.listHeight - 40);
}

async function captureAt(page, label, { width = 1440, height = 900, variant = 'desktop' } = {}) {
  await page.setViewportSize({ width, height });
  await settle(page);
  await assertNoHorizontalOverflow(page, `${label}-${variant}`);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/training-${label}-${variant}-${width}x${height}.png`,
    fullPage: false,
    animations: 'disabled',
  });
}

async function capture(page, label) {
  await captureAt(page, label);
}

async function prepare(page, { profileSeed = {} } = {}) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
      ...profileSeed,
    },
  });
  await login(page);
  const homeGuide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  const dismissGuide = homeGuide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismissGuide.isVisible().catch(() => false)) await dismissGuide.click();
  await expect(page.getByRole('region', { name: 'Modos principales' })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('chess-study-war-room-variant-v1', 'v2');
    localStorage.removeItem('chess-study-class-room-variant-v1');
  });
}

async function openDungeon(page) {
  await expect(page.locator('.illustrated-home')).toBeVisible();
  await page.getByRole('button', { name: 'Más modos y herramientas · Mazmorras', exact: true }).click();
}

scopedTest('daily', 'Entrenar · Cámara de desafíos diarios', async ({ page }) => {
  test.setTimeout(35_000);
  await prepare(page);

  await page.evaluate(() => {
    sessionStorage.setItem('chess-study-current-view', 'dailyChallenges');
  });
  await page.reload();

  const room = page.locator('.daily-room');
  await expect(room).toBeVisible();
  await expect(room.getByRole('heading', { name: 'Cámara de desafíos', exact: true })).toBeVisible();
  await expect(room.getByRole('button', { name: 'Jugar →', exact: true })).toHaveCount(3);
  await captureAt(page, 'daily-challenges', { width: 1440, height: 900, variant: 'desktop' });
  await captureAt(page, 'daily-challenges', { width: 390, height: 844, variant: 'mobile' });
});

scopedTest('school', 'Entrenar · Escuela, Glosario y Modos especiales', async ({ page }) => {
  test.setTimeout(110_000);
  await prepare(page);

  await page.evaluate(() => {
    sessionStorage.setItem('chess-study-current-view', 'tutorial');
  });
  await page.reload();

  const shell = page.locator('.tutorial-shell.matthias-school-shell');
  if (!await shell.isVisible().catch(() => false)) {
    await page.waitForTimeout(900);
  }
  if (!await shell.isVisible().catch(() => false)) {
    const debugState = await page.evaluate(() => ({
      view: sessionStorage.getItem('chess-study-current-view'),
      homeVisible: Boolean(document.querySelector('.illustrated-home, .home-castle-hub')),
      bodyPreview: document.body?.innerText?.slice(0, 260) || '',
    }));
    console.log('School visual bootstrap fallback:', JSON.stringify(debugState));
    const schoolEntry = buttonWithHeading(page, 'Escuela de Matthias');
    if (await schoolEntry.isVisible().catch(() => false)) {
      await schoolEntry.click();
    }
  }
  await expect(shell).toBeVisible();
  // The bootstrap reload may rehydrate profile storage. Seed the unrelated
  // global War Room preference only after School is mounted, then prove the
  // classroom never mutates it while its own renderer stays canonical.
  await page.evaluate(() => {
    localStorage.setItem('chess-study-war-room-variant-v1', 'v2');
  });
  await expect(shell.locator('.matthias-school-stage')).toBeVisible();
  const retroDock = page.locator('.global-music-dock');
  const retroDeck = retroDock.locator('.music-deck');
  await expect(retroDock).toBeVisible();
  await expect(retroDeck).toBeVisible();
  const retroBox = await retroDeck.boundingBox();
  expect(retroBox).not.toBeNull();
  expect(retroBox.x).toBeGreaterThanOrEqual(0);
  expect(retroBox.y).toBeGreaterThanOrEqual(0);
  expect(retroBox.x + retroBox.width).toBeLessThanOrEqual(1440);
  expect(retroBox.y + retroBox.height).toBeLessThanOrEqual(900);
  expect(await retroDeck.evaluate((node) => Number.parseInt(getComputedStyle(node.closest('.global-music-dock')).zIndex, 10))).toBeGreaterThan(1200);
  await expect(shell.locator('[data-board3d-camera="classroom-overhead"]')).toBeVisible();
  const school3d = shell.locator('[data-board3d-war-room="true"]');
  await expect(school3d).toHaveAttribute('data-board3d-variant', 'classic');
  await expect(shell.locator('.board3d-main-canvas')).toHaveAttribute('data-school-room-scene', 'school-room-war-room-v1');
  await capture(page, 'school');

  await shell.getByRole('button', { name: 'Por qué funciona', exact: true }).click();
  await expect(shell.locator('.matthias-school-board')).toHaveAttribute('data-school-explanation', 'demo');
  await shell.getByRole('button', { name: 'Siguiente paso', exact: true }).click();
  await settle(page);
  await capture(page, 'school-explanation');
  await captureAt(page, 'school-explanation', { width: 390, height: 844, variant: 'mobile' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await shell.getByRole('button', { name: 'Volver a practicar', exact: true }).click();
  await expect(shell.locator('.matthias-school-board')).toHaveAttribute('data-school-explanation', 'practice');
  await settle(page);

  await shell.getByRole('button', { name: 'Plan de estudios', exact: true }).click();
  const curriculum = shell.getByRole('dialog', { name: 'Plan de estudios' });
  await expect(curriculum).toBeVisible();
  await expect(shell.getByRole('group', { name: 'Modo de estudio' })).toBeVisible();
  await expect(shell.locator('.matthias-school-coach')).toBeHidden();
  await assertSchoolCurriculumLayout(shell, 'school-curriculum-desktop');
  await capture(page, 'school-curriculum');
  await captureAt(page, 'school-curriculum', { width: 390, height: 844, variant: 'mobile' });
  await assertSchoolCurriculumLayout(shell, 'school-curriculum-mobile');
  await assertSchoolTouchTargets(shell, 'school-curriculum-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);
  await curriculum.getByRole('button', { name: 'Cerrar plan de estudios', exact: true }).click();

  await expect(shell.getByRole('button', { name: 'Pantalla completa', exact: true })).toBeHidden();
  await expect(shell).toHaveAttribute('data-school-focus', 'normal');
  const immersive = await shell.evaluate((root) => {
    const board = root.querySelector('.matthias-school-board')?.getBoundingClientRect();
    const coach = root.querySelector('.matthias-school-coach');
    return {
      width: board?.width || 0,
      height: board?.height || 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      coachPosition: coach ? getComputedStyle(coach).position : '',
    };
  });
  expect(immersive.width).toBeGreaterThanOrEqual(immersive.viewportWidth * 0.98);
  expect(immersive.height).toBeGreaterThanOrEqual(immersive.viewportHeight * 0.98);
  expect(immersive.coachPosition).toBe('absolute');
  await capture(page, 'school-board-mode');
  await captureAt(page, 'school-board-mode', { width: 390, height: 844, variant: 'mobile' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);

  const resources = shell.getByText('Recursos', { exact: true });
  await resources.click();
  await expect(shell.getByRole('group', { name: 'Escena de clase' })).toHaveCount(0);
  await expect(school3d).toHaveAttribute('data-board3d-variant', 'classic');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chess-study-war-room-variant-v1'))).toBe('v2');
  await resources.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  await assertSchoolTouchTargets(shell, 'school-mobile');
  await assertSchoolMobileFold(shell, 'school-mobile');
  await captureAt(page, 'school', { width: 390, height: 844, variant: 'mobile' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);

  await shell.getByText('Recursos', { exact: true }).click();
  await shell.getByRole('button', { name: 'Glosario', exact: true }).click();
  await expect(shell.locator('.chess-glossary')).toBeVisible();
  await capture(page, 'glossary');

  await page.keyboard.press('Escape');
  await expect(shell.locator('.chess-glossary')).toBeHidden();
  await shell.getByText('Recursos', { exact: true }).click();
  await shell.getByRole('button', { name: 'Modos especiales', exact: true }).click();
  await expect(shell.locator('.mechanic-library')).toBeVisible();
  await settle(page);
  await assertSpecialModesDensity(shell);
  await capture(page, 'special-modes');
});

scopedTest('openings', 'Entrenar · Aperturas', async ({ page }) => {
  test.setTimeout(45_000);
  await prepare(page);
  await openDungeon(page);
  await page.getByRole('button', { name: 'Aperturas', exact: true }).click();

  const openings = page.locator('.openings-library-screen');
  await expect(openings).toBeVisible();
  await expect(openings.getByRole('heading', { name: 'Aperturas famosas', exact: true })).toBeVisible();
  await expect(openings.locator('.openings-volume').first()).toBeVisible();
  await capture(page, 'openings');
  await captureAt(page, 'openings', { width: 390, height: 844, variant: 'mobile' });
  await expect(page.locator('.masthead:not(.masthead-game-compact) .masthead-text')).toBeHidden();
});

scopedTest('puzzles', 'Entrenar · Puzzles', async ({ page }) => {
  test.setTimeout(55_000);
  await prepare(page);
  await openDungeon(page);
  await page.getByRole('button', { name: 'Puzzles clásicos', exact: true }).click();

  const puzzles = page.locator('.puzzle-screen');
  await expect(puzzles).toBeVisible();
  await expect(puzzles.locator('.puzzle-training-workspace')).toBeVisible();
  const sourcePicker = puzzles.locator('.puzzle-source-picker');
  await expect(sourcePicker).toBeVisible();
  await expect(sourcePicker).not.toHaveAttribute('open', '');
  await expect(sourcePicker.locator('> summary')).toContainText('Puzzles clásicos');
  await expect(puzzles.locator('[data-board3d-camera="training-room-overhead"]')).toBeVisible({ timeout: 20_000 });
  await expect(puzzles.locator('[data-board3d-room-profile="insights-training-room"]')).toBeVisible();
  await expect(puzzles.locator('[data-board3d-war-room="true"]')).toHaveAttribute('data-board3d-variant', 'classic');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chess-study-war-room-variant-v1'))).toBe('v2');
  await expect(puzzles.locator('.board3d-main-canvas')).toHaveAttribute('data-training-room-scene', 'insights-training-room-v3-copy-safe-study');
  await expect(puzzles.locator('.board3d-main-canvas')).toHaveAttribute('data-school-room-scene', 'off');

  async function assertPuzzleRoom(label) {
    const geometry = await puzzles.evaluate((root) => {
      const room = root.getBoundingClientRect();
      const board = root.querySelector('.puzzle-board-column')?.getBoundingClientRect();
      const board3d = root.querySelector('.puzzle-board-column .board3d-main-shell')?.getBoundingClientRect();
      const coach = root.querySelector('.puzzle-coach-panel');
      const actions = root.querySelector('.puzzle-board-column > .game-controls');
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        room: { left: room.left, top: room.top, right: room.right, bottom: room.bottom, width: room.width, height: room.height },
        board: board ? { left: board.left, top: board.top, right: board.right, bottom: board.bottom, width: board.width, height: board.height } : null,
        board3d: board3d ? { left: board3d.left, top: board3d.top, right: board3d.right, bottom: board3d.bottom, width: board3d.width, height: board3d.height } : null,
        coachPosition: coach ? getComputedStyle(coach).position : '',
        actionsPosition: actions ? getComputedStyle(actions).position : '',
      };
    });
    expect(geometry.room.left, `${label}: room starts at left edge`).toBeLessThanOrEqual(1);
    expect(geometry.room.top, `${label}: room starts at top edge`).toBeLessThanOrEqual(1);
    expect(geometry.room.width, `${label}: room owns viewport width`).toBeGreaterThanOrEqual(geometry.viewportWidth * .98);
    expect(geometry.room.height, `${label}: room owns viewport height`).toBeGreaterThanOrEqual(geometry.viewportHeight * .98);
    expect(geometry.board?.width || 0, `${label}: board surface owns viewport width`).toBeGreaterThanOrEqual(geometry.viewportWidth * .98);
    expect(geometry.board?.height || 0, `${label}: board surface owns viewport height`).toBeGreaterThanOrEqual(geometry.viewportHeight * .98);
    expect(geometry.board3d?.width || 0, `${label}: 3D room owns viewport width`).toBeGreaterThanOrEqual(geometry.viewportWidth * .98);
    expect(geometry.board3d?.height || 0, `${label}: 3D room owns viewport height`).toBeGreaterThanOrEqual(geometry.viewportHeight * .98);
    expect(geometry.board3d?.bottom || 0, `${label}: 3D room reaches viewport bottom`).toBeGreaterThanOrEqual(geometry.viewportHeight - 2);
    expect(geometry.coachPosition, `${label}: coach is overlay, not dashboard column`).toBe('absolute');
    expect(geometry.actionsPosition, `${label}: actions float over the room`).toBe('absolute');
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);
  await assertPuzzleRoom('puzzles-desktop');
  await captureAt(page, 'puzzles', { width: 1440, height: 900, variant: 'desktop' });

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await settle(page);
    await assertPuzzleRoom(`puzzles-mobile-${viewport.width}`);
    await captureAt(page, 'puzzles', {
      ...viewport,
      variant: `mobile-${viewport.width}`,
    });
  }
});

scopedTest('tournament', 'Entrenar · Torneo', async ({ page }) => {
  test.setTimeout(45_000);
  await prepare(page);

  await page.locator('.illustrated-home__destination--tournament').click();
  const tournament = page.locator('.tournament-panel');
  await expect(tournament).toBeVisible();
  await expect(tournament).toHaveAttribute('data-tournament-hall', 'true');
  await expect(tournament.getByRole('heading', { name: 'Siguiente rival', exact: true })).toBeVisible();
  const play = tournament.getByRole('button', { name: 'Jugar siguiente partida', exact: true });
  await expect(play).toBeVisible();
  await expect(tournament.locator('.tournament-hall-rival .primary-btn')).toHaveCount(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);
  const desktop = await tournament.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const rival = root.querySelector('.tournament-hall-rival')?.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      rivalWidth: rival?.width || 0,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      mastheadVisible: Boolean(document.querySelector('.masthead:not(.masthead-game-compact)')?.getClientRects().length),
    };
  });
  expect(desktop.overflow).toBe(false);
  expect(desktop.width).toBeGreaterThanOrEqual(1438);
  expect(desktop.height).toBeGreaterThanOrEqual(898);
  expect(desktop.rivalWidth).toBeGreaterThan(500);
  expect(desktop.mastheadVisible).toBe(false);
  await captureAt(page, 'tournament', { width: 1440, height: 900, variant: 'desktop' });

  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const playBox = await play.boundingBox();
  expect(playBox?.height || 0).toBeGreaterThanOrEqual(44);
  await captureAt(page, 'tournament', { width: 390, height: 844, variant: 'mobile' });
});

scopedTest('progress', 'Entrenar · Así juegas y Mi progreso', async ({ page }) => {
  test.setTimeout(70_000);
  await prepare(page);

  await page.evaluate(() => {
    localStorage.setItem('chess-study-career', JSON.stringify({
      byTimeControl: {
        rapid: { games: 18, wins: 9, draws: 3, losses: 6 },
        blitz: { games: 27, wins: 11, draws: 4, losses: 12 },
        bullet: { games: 8, wins: 2, draws: 1, losses: 5 },
      },
    }));
    // The visual contract for "Ahora" needs one real, playable personal position
    // so the actionable 5/15/30 picker is rendered instead of the honest
    // low-data empty state.
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      {
        id: 'visual-guided-session',
        kind: 'personal',
        source: 'autopsy',
        title: 'Posición real pendiente',
        description: 'Material de fixture para acreditar la sesión guiada.',
        fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
        solution: ['Ra8#'],
        incidentKeys: ['human:MISSED_MATE'],
        sourceGameId: 'visual-guided-source',
        loss: 420,
        createdAt: '2026-10-01T10:00:00Z',
        attempts: 0,
        solves: 0,
        cleanSolves: 0,
      },
    ]));
  });
  await page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
  await page.getByRole('menuitem', { name: /Mi progreso/ }).click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  const trainingRoom = page.locator('[data-insights-room="training-room-v1"]');
  await expect(trainingRoom).toBeVisible();
  await expect(trainingRoom.locator('[data-insights-training-room-3d]')).toHaveAttribute(
    'data-insights-training-room-3d',
    'ready',
    { timeout: 20_000 },
  );
  await assertInsightsActionableFold(trainingRoom, 'insights-desktop');
  await captureAt(page, 'insights', { width: 1440, height: 900, variant: 'desktop' });
  await captureAt(page, 'insights', { width: 1800, height: 900, variant: 'wide' });
  await captureAt(page, 'insights', { width: 390, height: 844, variant: 'mobile' });
  await assertInsightsActionableFold(trainingRoom, 'insights-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);

  const recommendedSession = trainingRoom.getByRole('button', { name: /^Empezar sesión recomendada de (5|15|30) min$/ });
  await expect(recommendedSession).toBeVisible();
  await recommendedSession.click();

  const immediateAction = trainingRoom.getByRole('button', { name: /Abrir Acciones inmediatas|Entrenar esta deuda/ }).first();
  await expect(immediateAction).toBeVisible();
  await immediateAction.click();

  const focusedTraining = page.locator('.puzzle-screen[data-training-origin="insights-action"]');
  await expect(focusedTraining).toBeVisible();
  await expect(focusedTraining.getByRole('group', { name: 'Tipo de puzzle' })).toHaveCount(0);
  await expect(focusedTraining.getByRole('button', { name: '← Volver a Así juegas', exact: true })).toBeVisible();
  await expect(focusedTraining.locator('[data-board3d-room-profile="insights-training-room"]')).toBeVisible({ timeout: 20_000 });
  await expect(focusedTraining.locator('.board3d-main-canvas')).toHaveAttribute('data-training-room-scene', 'insights-training-room-v3-copy-safe-study');
  await captureAt(page, 'immediate-actions', { width: 1440, height: 900, variant: 'desktop' });
  await captureAt(page, 'immediate-actions', { width: 390, height: 844, variant: 'mobile' });

  const focusedBack = page.locator('.puzzle-screen > .back-link');
  await expect(focusedBack).toHaveText('← Volver a Así juegas');
  await focusedBack.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);
  const archive1 = page.locator('details[data-insights-archive]');
  await expect(archive1).toBeVisible();
  if (await archive1.getAttribute('open') === null) {
    await archive1.locator('summary').click();
  }
  await page.getByRole('button', { name: 'Mi progreso', exact: true }).click();

  const career = page.locator('.career-screen');
  await expect(page.getByRole('heading', { name: 'Mi progreso', exact: true })).toBeVisible();
  await expect(career).toBeVisible();
  await expect(career.locator('.career-hero-grid')).toBeVisible();
  await expect(career.locator('.career-mini-grid').first()).toBeVisible();
  await captureAt(page, 'career', { width: 1440, height: 900, variant: 'desktop' });
  await captureAt(page, 'career', { width: 390, height: 844, variant: 'mobile' });

  const trainingHeading = career.getByRole('heading', { name: 'Entrenamiento personalizado', exact: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await trainingHeading.scrollIntoViewIfNeeded();
  await expect(trainingHeading).toBeVisible();
  await expect(career.locator('.career-action-grid').first()).toBeVisible();
  await captureAt(page, 'career-actions', { width: 1440, height: 900, variant: 'desktop' });
  await captureAt(page, 'career-actions', { width: 390, height: 844, variant: 'mobile' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await career.getByRole('button', { name: 'Archivo', exact: true }).click();
  const rhythmHeading = career.getByRole('heading', { name: 'Rivalidad por ritmo', exact: true });
  await rhythmHeading.scrollIntoViewIfNeeded();
  await expect(rhythmHeading).toBeVisible();
  await expect(career.locator('.career-rhythm-grid')).toBeVisible();
  await captureAt(page, 'career-rhythm', { width: 1440, height: 900, variant: 'desktop' });
  await captureAt(page, 'career-rhythm', { width: 390, height: 844, variant: 'mobile' });
});


scopedTest('progress', 'Entrenar · Expediente de Matthias', async ({ page }) => {
  test.setTimeout(45_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await prepare(page, {
    profileSeed: {
      'chess-study-game-history': JSON.stringify(INSIGHTS_DOSSIER_HISTORY),
      'chess-study-reduced-motion': '0',
    },
  });

  await page.locator('.illustrated-home__matthias').click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  const archiveDrawer = page.locator('details[data-insights-archive]');
  await expect(archiveDrawer).toBeVisible();
  if (await archiveDrawer.getAttribute('open') === null) {
    await archiveDrawer.locator('summary').click();
  }
  await page.getByRole('button', { name: 'Expediente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Expediente', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Consulta diaria con Matthias' })).toBeVisible();
  await expect(page.locator('[data-insights-matthias-motion="true"]')).toBeVisible();

  await captureAt(page, 'insights-dossier', { width: 1440, height: 900, variant: 'desktop' });
  await captureAt(page, 'insights-dossier', { width: 390, height: 844, variant: 'mobile' });

  // The overall mobile frame proves the room hierarchy, but the consultation
  // intentionally sits below the first fold. Capture the repaired surface too:
  // this is the visual acceptance proof for the 48px Matthias rig on mobile.
  const consultation = page.getByRole('region', { name: 'Consulta diaria con Matthias' });
  await consultation.scrollIntoViewIfNeeded();
  await expect(consultation).toBeVisible();
  await expect(page.locator('[data-insights-matthias-motion="true"]')).toBeVisible();
  await settle(page);
  await assertNoHorizontalOverflow(page, 'insights-dossier-consult-mobile');
  await page.screenshot({
    path: `${ARTIFACT_DIR}/training-insights-dossier-consult-mobile-390x844.png`,
    fullPage: false,
    animations: 'disabled',
  });
});
