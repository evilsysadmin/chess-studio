# Home Blender 3D · reproducible performance diagnostics

Goal: compare a candidate against the same baseline on **physical GPU hardware**, without treating the GitHub Actions SwiftShader screenshots as real-device benchmarks.

## Everyday diagnostics (no profiling overhead)

On a ready Home canvas, inspect `document.querySelector('.illustrated-home__castle-3d.is-ready')?.dataset` in browser DevTools. The relevant `data-home-*` counters are:

| Field (dataset key) | Meaning |
| --- | --- |
| `homeBlenderSoftware` | `true` means software renderer (not a hardware GPU benchmark) |
| `homeBlenderFirstFrameDrawCalls`, `homeBlenderFirstFrameTriangles` | Initial renderer submissions (can include a shadow pass) |
| `homeBlenderDrawCalls`, `homeBlenderTriangles` | Last animated room render |
| `homeBlenderGpuTextures`, `homeBlenderGpuGeometries`, `homeBlenderGpuPrograms` | Three.js renderer **GPU allocation counts**, not bytes of VRAM |
| `homeFireCostMs` | EWMA of CPU-side `renderer.render()` wall-clock duration; **not GPU execution time** |
| `homeBlenderCpuP95Ms` | P95 CPU-side full scene render submission, last 120 frames |
| `homeBlenderVsyncP95Ms` | P95 of *adjacent* observed RAF gaps after warmup, excluding deliberate timer sleeps |
| `homeBlenderDrawnFps` | **Scheduled** animated scene draws/sec; **not** physical monitor FPS |
| `homeBlenderGpuStatus` | `disabled`, `software`, `unsupported`, `sampling`, `ready`, `disjoint` or `error` |
| `homeBlenderGpuMs` | Last async elapsed WebGL GPU-timer sample in milliseconds; **only** with status `ready` |
| `homeBlenderGpuSampleCount` | Monotonic number of **valid completed GPU queries**, used to distinguish newly measured values from a still-published previous result |

## Opt-in authored-GLB draw inventory

Open the Home with `?homeGpuProfile=1`. After the authored GLB is prepared, the canvas publishes `dataset.homeBlenderModelDrawInventory`, a compact JSON object. This adds **one scene-graph traversal only when profiling**, after the original first-ready time is recorded. The production Home does not do this work.

The inventory counts visible authored-GLB meshes, potential material-group draw slots, shadow-casting candidates, transparent slots, shared geometry references, unique geometries and unique materials. It is deliberately **not** actual GPU draw calls, shader GPU time or VRAM usage: frustum culling, invisible ancestors, material groups and shadow passes all affect the renderer's actual submissions. Matthias, runtime fire/candle particles, dust and glow sprites are loaded/added separately and are **excluded**. Use the existing `homeBlenderDrawCalls`/GPU timer to observe actual rendering cost, then use the GLB inventory only to locate plausible batching/shadow work.

The local hardware benchmark includes this inventory per cold visit and medians for `modelDrawSlots`, `modelShadowCasterSlots`, `modelTransparentSlots`, `modelUniqueGeometries` and `modelUniqueMaterials`. The A/B comparator displays these as **GLB candidates** separately from real GPU calls. Older schema-2 reports without an inventory show `n/a`; never interpret missing inventory as zero. To compare inventory, rebuild both revisions with the instrumented harness.

## Opt-in GPU timer (physical device)

Open the Home with `?homeGpuProfile=1` on a capable non-software WebGL2 browser. The profiler samples at most one `EXT_disjoint_timer_query_webgl2` elapsed query per 30 **rendered** frames, without `gl.finish` or blocking for the result. Its most recent value can remain unchanged between query completions; use `homeBlenderGpuSampleCount` to avoid counting repeated reads of that same result as fresh samples. Queries cover `renderer.render(scene, camera)`, including any shadow-map work within that invocation. Do **not** claim that these values include browser layout, JavaScript animation updates or final screen composition.

Sample after initial shader compilation/asset loading. Reduced-motion or offscreen paused scenes may not render enough frames to produce any GPU sample. `unsupported`, `disjoint`, `software` and `error` mean **no valid hardware GPU measurement**. Queries are disposed when the Home unmounts or its WebGL context is lost.

Convenient DevTools snapshot:

```js
const d = document.querySelector('.illustrated-home__castle-3d.is-ready')?.dataset;
console.table(d && {
  softwareRenderer: d.homeBlenderSoftware,
  lod: d.homeCastleLod,
  gpuStatus: d.homeBlenderGpuStatus,
  gpuElapsedMs: d.homeBlenderGpuMs ?? null,
  drawCalls: d.homeBlenderDrawCalls,
  triangles: d.homeBlenderTriangles,
  gpuTextures: d.homeBlenderGpuTextures,
  gpuGeometries: d.homeBlenderGpuGeometries,
  gpuPrograms: d.homeBlenderGpuPrograms,
  cpuP95Ms: d.homeBlenderCpuP95Ms,
  adjacentRafGapP95Ms: d.homeBlenderVsyncP95Ms,
  drawnFps: d.homeBlenderDrawnFps,
});
```

For a comparison, record baseline and candidate on the **same machine, browser, window size, device-pixel ratio, camera, Home time-of-day, LOD and power profile**. Repeat runs; allow the hall and Matthias to settle, and distinguish first-ready startup from steady-state. Keep screenshots and note whether `softwareRenderer` is false. Neither `renderer.info.memory` nor `drawnFps` alone proves an FPS improvement or VRAM saving.

GitHub App Visual captures the allocation counts at its canonical viewports but intentionally **does not** enable GPU-timer queries. It runs under SwiftShader, so it remains a regression/geometry gate, not a physical GPU benchmark.

## Local physical-GPU benchmark (Nobara / workstation)

The dedicated Playwright benchmark validates the actual Home GLTF canvas (not a dummy context) and performs **three independent cold-context visits** at 1440×900 / DPR 1. It writes `.artifacts/home-gpu-benchmark/home-3d-hardware.json` (or `...-software.json`), reporting model requests, time-to-first-ready, draw calls, Three allocation counts, CPU p95 and—**only when the WebGL2 extension responds**—asynchronous GPU elapsed milliseconds. GPU medians use distinct completed query IDs seen in the scheduled snapshots, not repeated reads of a previous result. If multiple queries complete between snapshots, the harness observes only the latest; it never fabricates the missed values.

This is deliberately **not** in the hosted CI matrix. It needs a working graphical session, built frontend, npm dependencies and access to the actual Home runtime GLB. On Nobara with NVIDIA PRIME offload:

```bash
npm --prefix frontend ci
npm --prefix e2e ci
npm --prefix frontend run build
cd e2e
__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia \
  CHESS_HOME_GPU_MODE=hardware CHESS_HOME_GPU_REVISION="$(git rev-parse HEAD)" \
  ./node_modules/.bin/playwright test --config=playwright.home-gpu.config.js
```

To **require** a valid GPU timestamp result (rather than just collecting device-verified draw/CPU/memory data), add `CHESS_HOME_GPU_REQUIRE_TIMER=1`. If the extension is unsupported or reports disjoint results, the JSON will show null GPU timing; do not substitute CPU timing. Some drivers may require a headed Chromium; the benchmark defaults to headed, with `CHESS_HOME_GPU_HEADLESS=1` reserved for experiments.

Optional separate software diagnostic (not an apples-to-apples GPU comparison, as Home intentionally disables animated fire on SwiftShader):

```bash
CHESS_HOME_GPU_MODE=software CHESS_HOME_GPU_REVISION="$(git rev-parse HEAD)" \
  ./node_modules/.bin/playwright test --config=playwright.home-gpu.config.js
```

The script fails closed if it cannot prove the requested renderer family from the existing WebGL canvas, if the GLB fails to mount, or if the first-frame geometry/texture counters are empty. The raw hardware renderer string, user credentials and GLB URLs are never printed.

For meaningful before/after numbers: check out a known baseline SHA, rebuild, run in hardware mode, preserve the JSON; then build the candidate SHA and repeat on the **same workstation**, with the same NVIDIA/AMD driver, Chromium build, power state, viewport, time-of-day and network conditions. Repeat the experiment more than once. Compare median GPU time where available and CPU/RAF p95; do not interpret Home's intentionally throttled animated draws/sec as monitor FPS. An opt-in software run is for compatibility diagnosis, not proof of real-GPU gains.


## Fail-closed hardware A/B comparison

The local benchmark now writes **schema 2** with the Chromium version, a fingerprint of the renderer name (an 8-digit *non-cryptographic hash*, **not** a physical GPU ID), the actual canvas dimensions, LOD and the four possible authored Home lighting periods. No raw GPU model string is written to the report. Because older reports lack these fields, collect **both baseline and candidate again** after updating the harness.

At the baseline SHA, run the hardware benchmark shown above, then preserve its output **before** rebuilding the candidate; the next run overwrites the same JSON:

```bash
cp .artifacts/home-gpu-benchmark/home-3d-hardware.json /tmp/home-3d-baseline.json
# Rebuild and benchmark the candidate SHA on the same GPU, driver, browser, power profile and viewport.
python3 -S scripts/compare_home_3d_gpu.py \
  /tmp/home-3d-baseline.json \
  .artifacts/home-gpu-benchmark/home-3d-hardware.json
```

This offline comparison **rejects** software/unknown renderers, missing exact SHAs, mismatched Chromium versions, GPU-model fingerprints, LOD, lighting period, canvas sizes or viewport/DPR, and incomplete visits/GLB evidence. It shows differences in reported medians; lower is better for GPU/CPU times, but **a three-visit delta is not proof of a general performance gain**. Rerun A/B more than once to see whether the sign and magnitude are stable. When real GPU elapsed queries are missing, the GPU row is explicitly `n/a`: CPU-submit p95 is never substituted for GPU timing. A matching hash **cannot verify** that two runs were on the same physical GPU or driver; keep those controls yourself. Draw calls and Three.js resource counts are not FPS, VRAM bytes or total memory usage.

Regression checks for invalid/noncomparable benchmark reports run in CI preflight via stdlib `unittest`.

