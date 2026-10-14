import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, gameStatus, openDuelHall } from './helpers.js';
import { stagingSyntheticHeaders } from './staging-synthetic.js';

const STAGING_URL = process.env.STAGING_URL || 'https://staging.chess-studio.shadowops.dpdns.org';
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://api-staging.chess-studio.shadowops.dpdns.org/api';
const EXPECTED_SHA = process.env.DEPLOY_SHA || '';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta ${name} para el smoke live de staging`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function frontendEntryAssets(html) {
  const assets = new Set();
  const pattern = /(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    try {
      assets.add(new URL(match[1], STAGING_URL).toString());
    } catch {
      // Una referencia inválida se reflejará como ausencia de assets válidos y
      // hará fallar el gate con un mensaje más útil que la excepción de URL.
    }
  }
  return [...assets];
}

function assetMimeIsValid(url, contentType) {
  const pathname = new URL(url).pathname.toLowerCase();
  const mime = String(contentType || '').toLowerCase();
  if (pathname.endsWith('.css')) return mime.includes('text/css');
  if (pathname.endsWith('.js')) return mime.includes('javascript');
  return false;
}

async function waitForFrontendAssetPropagation(request) {
  let lastProblem = 'sin respuesta del custom domain';

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const rootUrl = new URL(STAGING_URL);
      rootUrl.searchParams.set('staging-asset-gate', `${Date.now()}-${attempt}`);
      const root = await request.get(rootUrl.toString(), {
        headers: {
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
        },
      });

      if (!root.ok()) {
        lastProblem = `raíz HTTP ${root.status()}`;
      } else {
        const html = await root.text();
        const assets = frontendEntryAssets(html);
        if (!assets.length) {
          lastProblem = 'index.html no contiene JS/CSS versionados';
        } else {
          // Entry chunks are independent immutable URLs. Bound origin load to
          // four parallel GETs; still inspect every HTTP/MIME result, even if
          // another entry asset fails or times out.
          const failures = [];
          for (let offset = 0; offset < assets.length; offset += 4) {
            const batch = assets.slice(offset, offset + 4);
            const checked = await Promise.all(batch.map(async (assetUrl) => {
              const cacheBusted = new URL(assetUrl);
              cacheBusted.searchParams.set('staging-asset-gate', `${Date.now()}-${attempt}`);
              try {
                const response = await request.get(cacheBusted.toString(), {
                  headers: {
                    'Cache-Control': 'no-cache, no-store',
                    Pragma: 'no-cache',
                  },
                });
                const contentType = response.headers()['content-type'] || '';
                return response.ok() && assetMimeIsValid(assetUrl, contentType)
                  ? null
                  : `${new URL(assetUrl).pathname}: HTTP ${response.status()} · ${contentType || 'sin content-type'}`;
              } catch (error) {
                return `${new URL(assetUrl).pathname}: ${error instanceof Error ? error.message : String(error)}`;
              }
            }));
            failures.push(...checked.filter(Boolean));
          }

          if (!failures.length) return;
          lastProblem = failures.join(' | ');
        }
      }
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }

    if (attempt < 20) await sleep(2_000);
  }

  throw new Error(`Pages staging no propagó index + assets ejecutables tras 40s: ${lastProblem}`);
}

async function assertRegistrationIsGated(request, username, password) {
  const synthetic = stagingSyntheticHeaders(username);
  const blocked = await request.post(`${STAGING_API_URL}/auth/register`, {
    data: {
      username,
      password,
      email: `${username}@example.invalid`,
    },
    headers: { 'Cache-Control': 'no-cache', ...synthetic },
  });
  expect(blocked.status(), `staging debe rechazar altas sin invitación: ${await blocked.text()}`).toBe(403);
}

async function authenticateOrCreate(request, username, password, inviteCode) {
  const synthetic = stagingSyntheticHeaders(username);
  const login = await request.post(`${STAGING_API_URL}/auth/login`, {
    data: { username, password },
    headers: { 'Cache-Control': 'no-cache', ...synthetic },
  });
  if (login.ok()) return login.json();

  if (![401, 404].includes(login.status())) {
    throw new Error(`Login técnico staging devolvió HTTP ${login.status()}: ${await login.text()}`);
  }

  const register = await request.post(`${STAGING_API_URL}/auth/register`, {
    data: {
      username,
      password,
      email: `${username}@example.invalid`,
      invite_code: inviteCode,
    },
    headers: { 'Cache-Control': 'no-cache', ...synthetic },
  });
  if (register.status() === 201) return register.json();

  // Dos jobs jamás deberían compartir staging por concurrency, pero si una
  // reconciliación manual cruza justo la creación, el 409 puede ser una carrera
  // inocua. Reintentar login distingue eso de una contraseña realmente rota.
  if (register.status() === 409) {
    const retry = await request.post(`${STAGING_API_URL}/auth/login`, {
      data: { username, password },
      headers: { 'Cache-Control': 'no-cache', ...synthetic },
    });
    if (retry.ok()) return retry.json();
  }

  throw new Error(`No se pudo preparar usuario técnico staging: register HTTP ${register.status()} · ${await register.text()}`);
}

async function seedStableSmokeProfile(request, token) {
  const tutorialProgress = {
    'combat-basics': { seen: true },
    'combat-campaign': { seen: true },
    'combat-intelligence': { seen: true },
    'combat-deployment': { seen: true },
    'quick-match-rules': { seen: true },
    'war-room': { seen: true },
    tournament: { seen: true },
    practice: { seen: true },
    puzzles: { seen: true },
    spectator: { seen: true },
    lab: { seen: true },
    'rival-ghost': { seen: true },
  };
  const response = await request.put(`${STAGING_API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      data: {
        'chess-study-mechanic-tutorial-progress-v1': JSON.stringify(tutorialProgress),
        'chess-study-home-guide-dismissed-v1': '1',
        'matthias.onboarded': '2',
        'chess-study-onboarding-insights-seen-v1': '1',
        'chess-study-reduced-motion': '1',
        'chess-study-ui-language': 'es',
      },
    },
  });
  expect(response.status(), `seed de perfil staging: ${await response.text()}`).toBe(200);
}

function attachUxAuditProbe(page) {
  const runtime = { consoleErrors: [], pageErrors: [], serverErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') runtime.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtime.pageErrors.push(String(error?.message || error)));
  page.on('response', (response) => {
    if (response.status() >= 500) runtime.serverErrors.push({
      status: response.status(),
      method: response.request().method(),
      url: response.url(),
    });
  });
  return runtime;
}

function isPvpApiPath(rawUrl, suffix) {
  try {
    const url = new URL(rawUrl);
    return url.origin + url.pathname === `${STAGING_API_URL}/pvp${suffix}`;
  } catch {
    return false;
  }
}

function assertPvpBrowserResponse(response, { suffix, native }) {
  expect(response.status(), `GET ${suffix} debe ser browser-visible`).toBe(200);
  const headers = response.headers();
  expect(
    headers['access-control-allow-origin'],
    `GET ${suffix} debe exponer el ACAO canónico al Chromium real`,
  ).toBe(new URL(STAGING_URL).origin);
  expect(headers['x-chess-pvp-edge'], `GET ${suffix} debe atravesar Go`).toBe('go');
  expect(headers['x-chess-pvp-native'], `GET ${suffix} debe acreditar la ruta nativa`).toBe(native);
}

// DevTools samples are diagnostic only: never log complete URLs, tokens, DOM,
// response bodies, usernames or the unsanitized CPU profile.
function summarizePvpOpenCpuProfile(profile) {
  const frames = new Map((profile?.nodes || []).map((node) => [node.id, node.callFrame]));
  const costs = new Map();
  let sampledMs = 0;
  for (let i = 0; i < (profile?.samples || []).length; i += 1) {
    const frame = frames.get(profile.samples[i]);
    const ms = Math.max(0, Number(profile.timeDeltas?.[i]) || 0) / 1000;
    sampledMs += ms;
    let moduleName = 'browser';
    try {
      moduleName = new URL(frame?.url).pathname.split('/').pop() || 'browser';
    } catch {
      // V8 built-ins / idle / anonymous frames are not loaded scripts.
    }
    const functionName = String(frame?.functionName || '(anonymous)')
      .replace(/[^\w.$()<> -]/g, '').slice(0, 55);
    const key = moduleName.slice(0, 72) + ':' + functionName;
    costs.set(key, (costs.get(key) || 0) + ms);
  }
  const top = [...costs].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, ms]) => name + '=' + Math.round(ms)).join(',');
  return 'sampled_ms=' + Math.round(sampledMs) +
    ' samples=' + (profile?.samples?.length || 0) +
    ' top_self_ms=' + (top || 'none');
}

async function assertLivePvpBrowserPath(page) {
  // Read-only phase diagnostics: preserve real lobby/pulse cadence and counts.
  // Never log credentials, tokens, roster contents, or response bodies.
  const started = Date.now();
  let phaseStart = started;
  const logPhase = (name) => {
    const now = Date.now();
    console.log(`STAGING_PVP_PHASE ${name} duration_ms=${now - phaseStart} total_ms=${now - started}`);
    phaseStart = now;
  };
  const failed = [];
  const onRequestFailed = (request) => {
    if (request.url().includes('/api/pvp/')) {
      failed.push({
        method: request.method(),
        url: request.url(),
        failure: request.failure()?.errorText || 'requestfailed',
      });
    }
  };
  page.on('requestfailed', onRequestFailed);

  const waitLobby = () => page.waitForResponse(
    (response) => response.request().method() === 'GET' && isPvpApiPath(response.url(), '/lobby'),
    { timeout: 25_000 },
  );
  const waitPulse = () => page.waitForResponse(
    (response) => response.request().method() === 'GET' && isPvpApiPath(response.url(), '/lobby/pulse'),
    { timeout: 25_000 },
  );

  // Observe the actual browser sequence rather than timing a mocked API.
  // Diagnostics are one-shot and contain only timing, not URLs or identities.
  const openedAt = Date.now();
  const openMs = () => Date.now() - openedAt;
  // Measure DOM milestones from *inside* Chromium. Playwright's own locator
  // commands can be delayed by a busy main thread, even after React has
  // inserted the dialog. Keep the observer read-only and stop it after open.
  const browserOriginMs = await page.evaluate(() => {
    const origin = performance.now();
    const marks = { dialogMountMs: null, sceneMountMs: null, sceneReadyMs: null, sceneFallbackMs: null };
    const longTasks = { count: 0, totalMs: 0, maxMs: 0 };
    const longFrames = {
      supported: PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') || false,
      top: [],
    };
    const elapsed = () => Math.round(performance.now() - origin);
    const captureDom = () => {
      if (marks.dialogMountMs === null && document.querySelector('.pvp-lobby[role="dialog"]')) {
        marks.dialogMountMs = elapsed();
      }
      const scene = document.querySelector('[data-pvp-duel-hall-3d]');
      if (!scene) return;
      if (marks.sceneMountMs === null) marks.sceneMountMs = elapsed();
      const state = scene.getAttribute('data-pvp-duel-hall-3d');
      if (state === 'ready' && marks.sceneReadyMs === null) marks.sceneReadyMs = elapsed();
      if (state?.startsWith('fallback') && marks.sceneFallbackMs === null) marks.sceneFallbackMs = elapsed();
    };
    const domObserver = new MutationObserver(captureDom);
    domObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-pvp-duel-hall-3d'],
    });
    let taskObserver = null;
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      taskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.count += 1;
          longTasks.totalMs += entry.duration;
          longTasks.maxMs = Math.max(longTasks.maxMs, entry.duration);
        }
      });
      taskObserver.observe({ type: 'longtask' });
    }
    let frameObserver = null;
    if (longFrames.supported) {
      frameObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 100) continue;
          const scripts = Array.from(entry.scripts || [])
            .sort((a, b) => b.duration - a.duration).slice(0, 2)
            .map((script) => ({
              // Basename and function only. Never leak CDN URLs / query params.
              module: String(script.sourceURL || '').split(/[?#]/)[0].split('/').pop()
                .replace(/[^\w.-]/g, '').slice(0, 60) || 'browser',
              function: String(script.sourceFunctionName || '(native)')
                .replace(/[^\w.$()-]/g, '').slice(0, 45),
              ms: Math.round(script.duration || 0),
              layoutMs: Math.round(script.forcedStyleAndLayoutDuration || 0),
            }));
          longFrames.top.push({
            startMs: Math.round(entry.startTime - origin),
            durationMs: Math.round(entry.duration),
            blockingMs: Math.round(entry.blockingDuration || 0),
            scripts,
          });
        }
        // Keep only five worst frames in memory for bounded safe telemetry.
        longFrames.top.sort((a, b) => b.durationMs - a.durationMs);
        longFrames.top.length = Math.min(longFrames.top.length, 5);
      });
      frameObserver.observe({ type: 'long-animation-frame' });
    }
    captureDom();
    window.__stagingDuelHallTiming = {
      marks, longTasks, longFrames,
      close: () => { domObserver.disconnect(); taskObserver?.disconnect(); frameObserver?.disconnect(); },
    };
    return Date.now();
  });
  const browserMs = (value) => value === null ? 'not-seen' : Math.round(browserOriginMs - openedAt + value);
  const openTimeline = {
    firstLobbyRequestMs: null,
    firstLobbyResponseMs: null,
    hallSceneChunkRequestMs: null,
    hallSceneChunkResponseMs: null,
    modelRequestMs: null,
    modelHeadersMs: null,
    modelFinishedMs: null,
    modelRequests: 0,
  };
  const isModelGlb = (url) => {
    try { return new URL(url).pathname.toLowerCase().endsWith('.glb'); }
    catch { return false; }
  };
  const isHallSceneChunk = (url) => /(?:PvPDuelHallScene3D|PvpDuelHallShell)[^/]*\.js(?:[?#]|$)/i.test(url);
  const onOpenRequest = (request) => {
    if (request.method() === 'GET' && isPvpApiPath(request.url(), '/lobby') && openTimeline.firstLobbyRequestMs === null) {
      openTimeline.firstLobbyRequestMs = openMs();
    }
    if (isHallSceneChunk(request.url()) && openTimeline.hallSceneChunkRequestMs === null) {
      openTimeline.hallSceneChunkRequestMs = openMs();
    }
    if (request.method() === 'GET' && isModelGlb(request.url())) {
      openTimeline.modelRequests += 1;
      if (openTimeline.modelRequestMs === null) openTimeline.modelRequestMs = openMs();
    }
  };
  const onOpenResponse = (response) => {
    if (response.request().method() === 'GET' && isPvpApiPath(response.url(), '/lobby') && openTimeline.firstLobbyResponseMs === null) {
      openTimeline.firstLobbyResponseMs = openMs();
    }
    if (isHallSceneChunk(response.url()) && openTimeline.hallSceneChunkResponseMs === null) {
      openTimeline.hallSceneChunkResponseMs = openMs();
    }
    if (response.request().method() === 'GET' && isModelGlb(response.url()) && openTimeline.modelHeadersMs === null) {
      openTimeline.modelHeadersMs = openMs();
    }
  };
  const onOpenFinished = (request) => {
    if (request.method() === 'GET' && isModelGlb(request.url()) && openTimeline.modelFinishedMs === null) {
      openTimeline.modelFinishedMs = openMs();
    }
  };
  page.on('requestfinished', onOpenFinished);
  page.on('request', onOpenRequest);
  page.on('response', onOpenResponse);

  // Best-effort, short-lived CPU sampling on this Chromium smoke only.
  // LongTask says *when* the main thread stalls; V8 frames reveal *where*.
  let cpuSession = null;
  let cpuSampling = false;
  try {
    cpuSession = await page.context().newCDPSession(page);
    await cpuSession.send('Profiler.enable');
    await cpuSession.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cpuSession.send('Profiler.start');
    cpuSampling = true;
  } catch {
    console.log('STAGING_PVP_CPU unavailable=cdp-start');
  }
  const stopCpuSampling = async () => {
    if (!cpuSession || !cpuSampling) return;
    cpuSampling = false;
    try {
      const { profile } = await cpuSession.send('Profiler.stop');
      console.log('STAGING_PVP_CPU ' + summarizePvpOpenCpuProfile(profile));
    } catch {
      console.log('STAGING_PVP_CPU unavailable=cdp-stop');
    }
  };

  try {
    const firstLobby = waitLobby();
    await openDuelHall(page);
    const homeNavigationDoneMs = openMs();
    assertPvpBrowserResponse(await firstLobby, { suffix: '/lobby', native: 'lobby-read' });
    await stopCpuSampling();

    const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
    await expect(lobby).toBeVisible();
    await expect(lobby.getByRole('heading', { name: 'Sala de Duelos' })).toBeVisible();
    await expect(lobby.locator('.pvp-lobby__error')).toHaveCount(0);
    const dialogReadyMs = openMs();
    const sceneStatus = await page.evaluate(() =>
      document.querySelector('[data-pvp-duel-hall-3d]')?.getAttribute('data-pvp-duel-hall-3d') || 'not-mounted'
    );
    console.log(
      `STAGING_PVP_OPEN home_navigation_ms=${homeNavigationDoneMs}` +
      ` native_request_ms=${openTimeline.firstLobbyRequestMs ?? 'not-seen'}` +
      ` native_response_ms=${openTimeline.firstLobbyResponseMs ?? 'not-seen'}` +
      ` scene_chunk_request_ms=${openTimeline.hallSceneChunkRequestMs ?? 'not-seen'}` +
      ` scene_chunk_response_ms=${openTimeline.hallSceneChunkResponseMs ?? 'not-seen'}` +
      ` dialog_ready_ms=${dialogReadyMs} scene_state=${sceneStatus}`,
    );
    const timing = await page.evaluate(() => {
      const probe = window.__stagingDuelHallTiming;
      return probe ? { marks: { ...probe.marks }, longTasks: { ...probe.longTasks } } : null;
    });
    if (timing) {
      const { marks, longTasks } = timing;
      console.log(
        `STAGING_PVP_RENDER dialog_mount_ms=${browserMs(marks.dialogMountMs)}` +
        ` scene_mount_ms=${browserMs(marks.sceneMountMs)}` +
        ` scene_ready_ms=${browserMs(marks.sceneReadyMs)}` +
        ` scene_fallback_ms=${browserMs(marks.sceneFallbackMs)}` +
        ` glb_requests=${openTimeline.modelRequests}` +
        ` glb_start_ms=${openTimeline.modelRequestMs ?? 'not-seen'}` +
        ` glb_headers_ms=${openTimeline.modelHeadersMs ?? 'not-seen'}` +
        ` glb_finished_ms=${openTimeline.modelFinishedMs ?? 'not-seen'}` +
        ` longtask_count=${longTasks.count}` +
        ` longtask_total_ms=${Math.round(longTasks.totalMs)}` +
        ` longtask_max_ms=${Math.round(longTasks.maxMs)}`,
      );
    }
    // Keep the passive observer alive through the existing real PvP pulses:
    // 3D may still be loading when the first lobby response becomes visible.
    logPhase('open-lobby');

    // Enrolarnos fuerza el mismo polling que usa una sesión humana real:
    // pulse nativo + reconciliación full-lobby. El antiguo gate con curl podía
    // quedar verde aunque Chromium terminara viendo exactamente estos GET como
    // CORS/network error.
    const join = page.waitForResponse(
      (response) => response.request().method() === 'POST' && isPvpApiPath(response.url(), '/roster'),
      { timeout: 25_000 },
    );
    const firstPulse = waitPulse();
    const reconciledLobby = waitLobby();
    await lobby.getByRole('button', { name: 'Recibir retos', exact: true }).click();

    expect((await join).status(), 'POST /roster debe confirmar disponibilidad').toBe(200);
    assertPvpBrowserResponse(await firstPulse, { suffix: '/lobby/pulse', native: 'lobby-pulse' });
    assertPvpBrowserResponse(await reconciledLobby, { suffix: '/lobby', native: 'lobby-read' });
    logPhase('join-and-first-pulse');

    // Dos ciclos adicionales evitan acreditar sólo la primera respuesta feliz
    // del sidecar y reproducen el patrón repetido que ve el navegador.
    for (let cycle = 0; cycle < 2; cycle += 1) {
      assertPvpBrowserResponse(await waitPulse(), { suffix: '/lobby/pulse', native: 'lobby-pulse' });
      logPhase(`repeat-pulse-${cycle + 1}`);
    }
    await expect(lobby.locator('.pvp-lobby__error')).toHaveCount(0);
    expect(failed, `PvP browser requestfailed: ${JSON.stringify(failed)}`).toEqual([]);

    // Product gate: begin the *authoritative* roster request before any
    // decorative GLB. This is an ordering assertion, not a time budget:
    // a slow runner must never make the result flaky.
    if (openTimeline.modelRequestMs !== null) {
      expect(
        openTimeline.firstLobbyRequestMs,
        'PvP lobby network must begin before decorative model work',
      ).not.toBeNull();
      expect(openTimeline.firstLobbyRequestMs).toBeLessThanOrEqual(openTimeline.modelRequestMs);
    }

    // Do not wait for a 3D frame. Sample the state achieved while running
    // the same two mandatory browser-visible native polling cycles as before.
    const settled = await page.evaluate(() => {
      const probe = window.__stagingDuelHallTiming;
      if (!probe) return null;
      probe.close();
      return {
        marks: { ...probe.marks },
        longTasks: { ...probe.longTasks },
        longFrames: { supported: probe.longFrames.supported, top: [...probe.longFrames.top] },
        sceneState: document.querySelector('[data-pvp-duel-hall-3d]')?.getAttribute('data-pvp-duel-hall-3d') || 'not-mounted',
      };
    });
    if (settled) {
      console.log(
        'STAGING_PVP_LOAF supported=' + settled.longFrames.supported +
        ' top_frames=' + JSON.stringify(settled.longFrames.top),
      );
      console.log(
        `STAGING_PVP_RENDER_SETTLED scene_ready_ms=${browserMs(settled.marks.sceneReadyMs)}` +
        ` scene_fallback_ms=${browserMs(settled.marks.sceneFallbackMs)}` +
        ` scene_state=${settled.sceneState}` +
        ` glb_requests=${openTimeline.modelRequests}` +
        ` glb_finished_ms=${openTimeline.modelFinishedMs ?? 'not-seen'}` +
        ` longtask_count=${settled.longTasks.count}` +
        ` longtask_total_ms=${Math.round(settled.longTasks.totalMs)}` +
        ` longtask_max_ms=${Math.round(settled.longTasks.maxMs)}`,
      );
    }

    const leave = page.waitForResponse(
      (response) => response.request().method() === 'DELETE' && isPvpApiPath(response.url(), '/roster'),
      { timeout: 25_000 },
    );
    await lobby.getByRole('button', { name: 'Dejar de estar disponible', exact: true }).click();
    expect((await leave).status(), 'DELETE /roster debe limpiar la identidad técnica').toBe(204);
    await lobby.getByRole('button', { name: 'Cerrar ventana de rivales', exact: true }).click();
    await expect(lobby).toBeHidden();
    logPhase('leave-lobby');
  } finally {
    await stopCpuSampling();
    if (cpuSession) await cpuSession.detach().catch(() => {});
    if (!page.isClosed()) {
      await page.evaluate(() => {
        window.__stagingDuelHallTiming?.close();
        delete window.__stagingDuelHallTiming;
      }).catch(() => {});
    }
    page.off('requestfinished', onOpenFinished);
    page.off('request', onOpenRequest);
    page.off('response', onOpenResponse);
    page.off('requestfailed', onRequestFailed);
  }
}

async function captureUxCheckpoint(page, testInfo, report, name) {
  await page.waitForTimeout(350);
  const metrics = await page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const label = (node) => String(node.innerText || node.getAttribute('aria-label') || '')
      .replace(/\s+/g, ' ').trim().slice(0, 120);
    const actions = [...document.querySelectorAll('button,a[href],[role="button"],[role="menuitem"],[role="tab"]')]
      .filter(visible)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { label: label(node), width: Math.round(rect.width), height: Math.round(rect.height), aboveFold: rect.top >= 0 && rect.top < innerHeight };
      })
      .filter((row) => row.label);
    const counts = new Map();
    for (const row of actions) counts.set(row.label, (counts.get(row.label) || 0) + 1);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      verticalScreens: Number((document.documentElement.scrollHeight / Math.max(innerHeight, 1)).toFixed(2)),
      headings: [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible).map(label).filter(Boolean).slice(0, 20),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(label).filter(Boolean).slice(0, 10),
      visibleActions: actions.length,
      aboveFoldActions: actions.filter((row) => row.aboveFold).length,
      duplicateActions: [...counts.entries()].filter(([, count]) => count > 1).map(([text, count]) => ({ text, count })).slice(0, 20),
      compactTargets: actions.filter((row) => row.width < 32 || row.height < 32).slice(0, 20),
    };
  });
  await page.screenshot({ path: testInfo.outputPath(`ux-${name}.png`), fullPage: true, timeout: 60_000 });
  report.checkpoints.push({ name, ...metrics });
  return metrics;
}

async function leaveCurrentGameThroughUi(page) {
  const roomExit = page.getByRole('button', { name: 'Salir de la partida', exact: true });
  const legacy2d = page.getByRole('button', { name: 'Abandonar partida', exact: true });
  if (await roomExit.isVisible().catch(() => false)) {
    await roomExit.click();
  } else {
    await expect(legacy2d).toBeVisible();
    await legacy2d.click();
  }
  const dialog = page.getByRole('dialog', { name: '¿Abandonar la partida?' });
  await expect(dialog).toBeVisible();
  const exit = dialog.getByRole('button', { name: /Cancelar sin penalización|Abandonar y asumir resultado/ });
  await expect(exit).toBeVisible();
  await exit.click();
}


test('staging live · auth real → War Room v2 → recovery 3D → jugada real', async ({ page, request }, testInfo) => {
  const username = requiredEnv('STAGING_E2E_USERNAME');
  const password = requiredEnv('STAGING_E2E_PASSWORD');
  const inviteCode = requiredEnv('STAGING_INVITE_CODE');
  const synthetic = stagingSyntheticHeaders(username);
  const uxRuntime = attachUxAuditProbe(page);
  const uxReport = { schema: 1, viewport: 'desktop-1440x900', checkpoints: [], runtime: uxRuntime };
  // Diagnostic only: no sleeps, no relaxed assertions, no credentials.
  // Separate real backend/browser/PvP/3D/screenshot costs in green CI logs.
  const smokeStarted = Date.now();
  let phaseStarted = smokeStarted;
  const phase = (label) => {
    const now = Date.now();
    console.log(`STAGING_LIVE_PHASE ${label} duration_ms=${now - phaseStarted} total_ms=${now - smokeStarted}`);
    phaseStarted = now;
  };
  test.setTimeout(210_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // v3 is the product default, but this smoke runs on software GL where the
  // Blender shell starves screenshots; pin v1 and exercise v2 explicitly below.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('chess-study-war-room-variant-v1', 'classic'); } catch { /* ignore */ }
  });

  if (EXPECTED_SHA) {
    const releaseResponse = await request.get(`${STAGING_API_URL}/release?sha=${encodeURIComponent(EXPECTED_SHA)}`, {
      headers: { 'Cache-Control': 'no-cache', ...synthetic },
    });
    expect(releaseResponse.status()).toBe(200);
    const release = await releaseResponse.json();
    expect(String(release.build || '').toLowerCase()).toBe(EXPECTED_SHA.toLowerCase());
  }

  // Pages puede acreditar release.json unos segundos antes de que todos los
  // assets hashed del nuevo index estén disponibles a través del custom domain.
  // En esa ventana el fallback SPA devuelve text/html para un .js y Chromium
  // deja la aplicación en blanco por MIME estricto. Esperamos únicamente esa
  // propagación concreta; cualquier asset roto de forma persistente sigue
  // haciendo fallar staging con diagnóstico explícito.
  await waitForFrontendAssetPropagation(request);
  phase('asset-propagation');

  // Guardarraíl de producto: el endpoint sigue disponible para CI, pero nunca
  // debe aceptar una cuenta pública sin el secreto generado por el bootstrap.
  await assertRegistrationIsGated(request, username, password);

  const session = await authenticateOrCreate(request, username, password, inviteCode);
  expect(session.token).toBeTruthy();
  await seedStableSmokeProfile(request, session.token);
  phase('api-auth-and-profile');

  let gameId = null;
  try {
    await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    await page.getByLabel('Usuario').fill(username);
    await page.getByLabel('Contraseña').fill(password);

    const browserLogin = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && response.url().startsWith(`${STAGING_API_URL}/auth/login`)
    ));
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    expect((await browserLogin).status()).toBe(200);

    await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('complementary', { name: 'Rincón de Matthias' })).toBeVisible({ timeout: 10_000 });

    // Home is atomically covered until its 3D first frame or safe static
    // illustration is ready. A visible menu under that curtain is NOT yet
    // clickable. On software GL, the gate's 6s preview / 30s safe fallback may
    // outlive Playwright's 15s click timeout. Wait for genuine readiness,
    // rather than forcing a click through the curtain and masking a real hang.
    await expect(
      page.locator('[data-home-loading="waiting-for-frame"]'),
      'Home readiness curtain must clear before PvP navigation (3D or safe 2D)',
    ).toHaveCount(0, { timeout: 45_000 });
    phase('chromium-login-and-home-ready');

    // P0 staging: acredita el 1v1 con fetch real de Chromium, no sólo curl.
    await assertLivePvpBrowserPath(page);
    phase('browser-pvp-pulses');

    await expect(buttonWithVisibleText(page, 'Partida rápida')).toBeVisible();
    await buttonWithVisibleText(page, 'Partida rápida').click();

    const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
    await expect(dialog).toBeVisible();
    const settings = dialog.locator('details.quick-match-settings');
    if (!(await settings.evaluate((node) => node.open))) await settings.locator(':scope > summary').click();
    await dialog.getByRole('radio', { name: 'Blancas', exact: true }).click();

    const createGame = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.origin + url.pathname === `${STAGING_API_URL}/games`;
    }, { timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
    const createdResponse = await createGame;
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    gameId = created.id || null;
    expect(gameId).toBeTruthy();

    const warRoom3d = page.locator('[data-board3d-war-room="true"]');
    const warRoomCanvas = warRoom3d.locator('canvas.board3d-main-canvas');
    const warRoomSignal = page.locator('[data-matthias-war-room-presence="king-piece"]');
    const warRoomGameStatus = warRoomSignal.getByRole('status', { name: 'Estado de la partida' });
    await expect(warRoom3d).toBeVisible({ timeout: 30_000 });
    await expect(warRoomCanvas).toBeVisible({ timeout: 30_000 });
    phase('create-game-and-3d-ready');

    // Staging is the deliberate A/B surface for the Blender shell. Keep the
    // experiment behind the canonical overflow menu so the room itself remains
    // visually clean, then prove the R2 shell can replace the classic scene.
    const variantUtilityMenu = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
    await expect(variantUtilityMenu).toBeVisible();
    await variantUtilityMenu.click();
    const classicWarRoomItem = page.getByRole('menuitemradio', { name: 'War Room v1', exact: true });
    const v2WarRoomItem = page.getByRole('menuitemradio', { name: 'War Room v2', exact: true });
    const v3WarRoomItem = page.getByRole('menuitemradio', { name: 'War Room v3', exact: true });
    await expect(classicWarRoomItem).toBeVisible();
    await expect(v2WarRoomItem).toBeVisible();
    await expect(v3WarRoomItem).toBeVisible();
    const initiallySelectedWarRooms = await Promise.all(
      [classicWarRoomItem, v2WarRoomItem, v3WarRoomItem]
        .map((item) => item.getAttribute('aria-checked')),
    );
    expect(initiallySelectedWarRooms.filter((value) => value === 'true')).toHaveLength(1);
    await v2WarRoomItem.click();
    await expect(warRoom3d).toHaveAttribute('data-board3d-variant', 'v2');
    await expect(warRoom3d).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: 30_000 });
    await expect(warRoomCanvas).toBeVisible();
    await variantUtilityMenu.click();
    await page.getByRole('menuitemradio', { name: 'War Room v1', exact: true }).click();
    await expect(warRoom3d).toHaveAttribute('data-board3d-variant', 'classic');
    await expect(warRoom3d).toHaveAttribute('data-board3d-variant-status', 'idle');
    await expect(warRoomCanvas).toBeVisible();

    await expect(page.locator('.game-layout-3d .status-line')).toBeHidden();
    await expect(warRoomSignal).toBeVisible();
    await expect(warRoomSignal).toContainText('Matthias');
    await expect(warRoomSignal).not.toContainText(/CPU nivel \d+/);
    await expect(warRoomGameStatus).toHaveText(/Tu turno/i);
    phase('war-room-v2-and-v1-switch');
    await captureUxCheckpoint(page, testInfo, uxReport, '01-quick-war-room');
    phase('full-page-3d-ux-screenshot');

    // La autoridad F5 ya se acredita en paralelo en staging-war-room-restore.
    // Aquí sólo hacemos el reload 2D que necesita el sabotaje para garantizar
    // que Board3D aún no existe en el runtime fresco antes del primer lazy import.
    const firstUtilityMenu = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
    await expect(firstUtilityMenu).toBeVisible();
    await firstUtilityMenu.click();
    await page.getByRole('menuitem', { name: 'Apariencia', exact: true }).click();
    let appearanceDialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(appearanceDialog).toBeVisible();
    await appearanceDialog.getByRole('radio', { name: /2D$/ }).click();
    await appearanceDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('.square[aria-label^="Casilla e2,"]')).toBeVisible({ timeout: 30_000 });

    const board3dChunkPattern = /\/assets\/Board3D-[^/]+\.js(?:\?.*)?$/;
    let failedBoard3DChunkOnce = false;
    await page.route(board3dChunkPattern, async (route) => {
      if (!failedBoard3DChunkOnce) {
        failedBoard3DChunkOnce = true;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    const restoreFresh2D = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'GET'
        && Boolean(gameId)
        && url.origin + url.pathname === `${STAGING_API_URL}/games/${gameId}`;
    }, { timeout: 60_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect((await restoreFresh2D).status()).toBe(200);
    await expect(page.locator('.square[aria-label^="Casilla e2,"]')).toBeVisible({ timeout: 30_000 });
    expect(failedBoard3DChunkOnce, '2D no debe cargar Board3D durante el reload fresco').toBe(false);
    phase('fresh-2d-reload');

    // Guardarraíl directo para #286: provocamos el primer import lazy de Board3D
    // y lo fallamos una sola vez. Puede recuperarse mediante reload automático o
    // mostrando el ErrorBoundary; reaccionamos a la primera señal útil en vez de
    // esperar ciegamente ocho segundos antes de mirar el boundary.
    const restoreAfterChunkFailure = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'GET'
        && Boolean(gameId)
        && url.origin + url.pathname === `${STAGING_API_URL}/games/${gameId}`;
    }, { timeout: 60_000 });
    // A successful lazy-import retry can recover the 3D board without an API reload.
    const chunkRetryResponse = page.waitForResponse((response) => (
      response.request().method() === 'GET'
      && board3dChunkPattern.test(new URL(response.url()).pathname)
      && response.status() === 200
    ), { timeout: 60_000 });
    const errorBoundaryHeading = page.getByRole('heading', { name: 'La pantalla ha tropezado', exact: true });

    await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
    appearanceDialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(appearanceDialog).toBeVisible();
    await appearanceDialog.getByRole('radio', { name: /3D$/ }).click();
    await appearanceDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

    await expect.poll(() => failedBoard3DChunkOnce, { timeout: 10_000 }).toBe(true);
    // A reload, explicit ErrorBoundary or successful same-page chunk retry
    // can all be valid; the rendered board and real move below must still pass.
    const recovery = await Promise.any([
      restoreAfterChunkFailure.then((response) => ({ kind: 'restored', response })),
      errorBoundaryHeading.waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => ({ kind: 'boundary', response: null })),
      chunkRetryResponse.then((response) => ({ kind: 'retry', response })),
    ]);

    let restoredAfterChunkFailure = recovery.response;
    if (recovery.kind === 'boundary') {
      const recoverRuntime = page.getByRole('button', { name: 'Recargar y recuperar', exact: true });
      await expect(recoverRuntime).toBeVisible();
      await recoverRuntime.click();
      restoredAfterChunkFailure = await restoreAfterChunkFailure;
    }

    if (recovery.kind === 'retry') {
      expect(recovery.response.status()).toBe(200);
    } else {
      expect(restoredAfterChunkFailure).toBeTruthy();
      expect(restoredAfterChunkFailure.status()).toBe(200);
    }
    await expect(warRoom3d).toBeVisible({ timeout: 30_000 });
    await expect(warRoomCanvas).toBeVisible({ timeout: 30_000 });
    await expect(warRoomSignal).toBeVisible();
    await expect(warRoomGameStatus).not.toHaveText('');
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
    await page.unroute(board3dChunkPattern);
    phase('board3d-chunk-failure-recovery');

    // Finalmente volvemos a 2D sólo para usar el helper accesible/determinista
    // de casillas y acreditar que la misma partida todavía acepta una jugada real.
    const secondUtilityMenu = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
    await expect(secondUtilityMenu).toBeVisible();
    await secondUtilityMenu.click();
    await page.getByRole('menuitem', { name: 'Apariencia', exact: true }).click();
    appearanceDialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(appearanceDialog).toBeVisible();
    await expect(appearanceDialog.getByRole('radiogroup', { name: 'Representación del tablero' })).toBeVisible();
    await expect(appearanceDialog.getByRole('radio', { name: /3D$/ })).toHaveAttribute('aria-checked', 'true');
    await appearanceDialog.getByRole('radio', { name: /2D$/ }).click();
    await appearanceDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.square[aria-label^="Casilla e2,"]')).toBeVisible();

    const moveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST'
        && Boolean(gameId)
        && url.origin + url.pathname === `${STAGING_API_URL}/games/${gameId}/move`;
    }, { timeout: 60_000 });
    await clickBoardMove(page, 'e2', 'e4');
    // HTTP 200 alone does not prove the CPU reply was actually presented.
    // Observe Matthias thinking and the authoritative return to the human turn.
    await expect(gameStatus(page).getByText('La CPU está pensando…', { exact: true })).toBeVisible({ timeout: 10_000 });
    const moveResponse = await moveResponsePromise;
    expect(moveResponse.status()).toBe(200);
    const moved = await moveResponse.json();
    expect(Array.isArray(moved.history)).toBe(true);
    expect(moved.history.length).toBeGreaterThanOrEqual(1);
    await expect(gameStatus(page).getByText('Tu turno', { exact: true })).toBeVisible({ timeout: 30_000 });
    phase('move-and-cpu-reply');

    await leaveCurrentGameThroughUi(page);
    await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible({ timeout: 30_000 });
    phase('leave-game-home');

    // Staging deploy admission stops here: tournament, insights and broader UX
    // journeys stay in Quality/full-browser coverage instead of extending every
    // coherent-generation deployment smoke.
    await testInfo.attach('golden-path-ux-report', {
      body: Buffer.from(`${JSON.stringify(uxReport, null, 2)}\n`, 'utf8'),
      contentType: 'application/json',
    });

    const overflow = uxReport.checkpoints.filter((checkpoint) => checkpoint.horizontalOverflow).map((checkpoint) => checkpoint.name);
    expect(overflow, `Overflow horizontal: ${overflow.join(', ')}`).toEqual([]);
    expect(uxRuntime.serverErrors, JSON.stringify(uxRuntime.serverErrors, null, 2)).toEqual([]);
  } finally {
    if (gameId && session.token) {
      const cleanup = await request.delete(`${STAGING_API_URL}/games/${encodeURIComponent(gameId)}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (![204, 404].includes(cleanup.status())) {
        throw new Error(`Cleanup de partida smoke devolvió HTTP ${cleanup.status()}: ${await cleanup.text()}`);
      }
    }
    phase('final-game-cleanup');
  }
});
