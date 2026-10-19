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

## Runtime-only hearth flame geometry LOD

The 28 explicitly named camera-facing flame/hot/tongue/base spheres on the two Home fireplaces use an isolated **runtime GLB-only** 24×12 sphere instead of the authored 40×20 topology. The canonical Blender builder and its Eevee review render remain unchanged. The exporter fails closed unless the exact 28 known object names, expected original 1,520-triangle spheres, material identities, UV-free fire materials and local bounding boxes match. After replacement it verifies unchanged per-axis local bounds, vertex smoothing, and a minimum reduction of 25,000 triangles; GLTFLoader still finds the same animated mesh names and pivots.

The export metadata field `hearth_front_flame_lod` reports actual triangles before, after, saved and the number of modified nodes. This **reduces vertex/index geometry**, not the number of GLB primitive instances or the number of draw submissions: do not claim extra FPS without a physical GPU A/B test. Because fewer vertices can subtly alter shader flutter/silhouettes, the unpromoted candidate must pass the Home browser runtime gate and its captured PNG must be reviewed before enabling automerge; the old content-addressed GLB remains the rollback baseline.

## Stationary transform propagation

The Home scene root is an identity container that never moves. Three.js ordinarily calls `updateMatrix()` on it every render; this dirties the root world matrix and forces recomputation throughout the hall. On the loaded GLB, once fire and Klaus rigs have been prepared, `freezeHomeBlenderStaticTransforms` primes each stationary object's local TRS matrix once and disables its automatic rewrite. **Flame, ember, candle and steam nodes remain animated**, as does the full Klaus subtree; Matthias, lights, glows, dust and runtime particles are separate scene children and retain normal automatic transforms. This preserves shadow maps, lighting, materials, geometry, camera, GLB bytes and renderer policy.

This is a CPU-side matrix-propagation optimization, **not a measured GPU speedup**. Tests exercise stationary world-matrix equality under repeated animation, moving fire/Klaus/Matthias and manually managed matrices. The canvas attribute `data-home-blender-frozen-transforms` provides a bounded, startup-only sanity count; compare CPU draw cost with the established local benchmark rather than guessing frame-time savings.

## Opt-in authored-GLB draw inventory

Open the Home with `?homeGpuProfile=1`. After the authored GLB is prepared, the canvas publishes `dataset.homeBlenderModelDrawInventory`, a compact JSON object. This adds **one scene-graph traversal only when profiling**, after the original first-ready time is recorded. The production Home does not do this work.

The inventory counts visible authored-GLB meshes, potential material-group draw slots, shadow-casting candidates, transparent slots, shared geometry references, unique geometries and unique materials. It is deliberately **not** actual GPU draw calls, shader GPU time or VRAM usage: frustum culling, invisible ancestors, material groups and shadow passes all affect the renderer's actual submissions. Matthias, runtime fire/candle particles, dust and glow sprites are loaded/added separately and are **excluded**. Use the existing `homeBlenderDrawCalls`/GPU timer to observe actual rendering cost, then use the GLB inventory only to locate plausible batching/shadow work.

The opt-in JSON also contains `topMaterials`, a bounded top-ten ranking by the authored material name and visible potential draw slots, with transparent and shadow-caster candidates per row. Separate material instances with the same name are intentionally grouped for diagnosis. This is a **lead for targeted batching**, not a measured WebGL submission count or a prediction of GPU speedup; check the actual renderer/GPU measurements first.

The same opt-in inventory reports `permutedStaticBatchGroups`: up to ten candidate groups of existing opaque `HOME_ARCH_BATCH_*` / `HOME_PROP_BATCH_*` meshes whose material **sets match but ordered slots differ**. The Blender exporter currently groups on an *ordered* material signature; this identifies a potential next export experiment without changing assets. It excludes hidden, transparent, non-batched, ambiguous and differently shadowed cases, and gives at most five example node names per group. An empty list means **no such candidates in this loaded GLB**, not that further batching is impossible. A reported match is **not** a guaranteed reduction in GPU draw calls: Blender slot remapping, geometry identity and the runtime render must still be validated independently before shipping any reordered mesh.

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


## Local auxiliary-light GPU isolation (A/B/B/A)

The Home always retains its authored lighting in normal play. For GPU diagnosis only, `?homeGpuProfile=1&homeLightProbe=aux-off` excludes **auxiliary non-shadow-casting torches, stairs lamps, chandelier and board spotlights** from Three.js light lists; the shadow-casting key, fireplace point lights, atmospheric/fill/environment light, and additive glow sprites are preserved. The experiment **intentionally changes the rendered lighting**: it is not an acceptable production look and must never be enabled as a performance policy without separate visual approval. The query flag is ignored unless `homeGpuProfile=1` is also present. The read-only canvas dataset exposes `homeBlenderLightProbe` and `homeBlenderLightProbeDisabled` for validation.

On an actual hardware GPU (not SwiftShader), run from the repo root on Nobara or another local Linux machine. The one-command entry point installs missing local dependencies/Chromium when needed, rebuilds the frontend, and isolates the benchmark from any pre-existing test server:

```bash
make home-gpu-light-probe
```

The default requests NVIDIA PRIME offload on Nobara **and requires the actual Chromium WebGL vendor to be NVIDIA**. PRIME environment variables alone are not proof of the GPU used. If Chrome still selects Intel, the test fails with the observed vendor: inspect `nvidia-smi`, `switcherooctl list` and local graphics offload before rerunning. To deliberately measure the native Intel/AMD GPU instead, use `make home-gpu-light-probe HOME_GPU_NVIDIA_PRIME=0` (optionally `HOME_GPU_EXPECT_VENDOR=intel` or `amd` to pin its identity). The native GPU is valid *hardware* but cannot be compared to NVIDIA results. For a GPU-only headless environment add `HOME_GPU_HEADLESS=1`.

The measured Intel A/B/B/A report (`revision 6bf7b4f4`, `ambient=night`, `full` LOD, 1423×680 canvas) showed medians **28.04 ms** with all twelve lights, **15.15 ms** with all twelve auxiliaries excluded (12.89 ms, about 46% less GPU elapsed time), with **329 draw submissions and the same geometry** in each condition. These are observed GPU timer samples from **four short visits**, not a verified FPS increase or a safe production-lighting change. A repeat run and group-level isolation are needed before deciding what to keep, merge or approximate.

To isolate one family without sacrificing the other lighting, choose:

```bash
# On native Intel (the renderer already observed in the report):
make home-gpu-light-probe HOME_GPU_NVIDIA_PRIME=0 HOME_GPU_EXPECT_VENDOR=intel HOME_GPU_LIGHT_GROUP=board
# Other options: wall (4), stairs (3), accent (3), all (12; default)
```

**Board-family field report (Intel hardware; revision `4fb5de32`, night/full, Matthias at `sofa-nap`):** the four visits actually measured normal **28.90 / 28.31 ms**, and board-off **28.01 / 23.35 ms**. Thus the median of visit medians is **28.605 vs 25.68 ms** (2.925 ms, **10.23% lower GPU time**). The first report's `gpuMedianMs.auxOff=null` and 100% contrast were **an aggregation bug**: the report filtered only literal `aux-off`, ignoring `aux-board-off`. Those printed summary fields are invalid, but its individual visit samples are still available for post-hoc recalculation. The aggregator now keys the B visits to the selected light-family mode and fails closed on missing/nonfinite timings. Do not interpret 10.23% as production FPS gain: the diagnostic renders the board without two lights, and a second run plus visual acceptance would be needed before changing actual lighting.

**Local repeatability control (all-light / per-family A/B/B/A):** by default, `make home-gpu-light-probe` fixes the in-browser local hour to 23:00 so every one of its four visits uses the **same `night` ambient**, independent of when the operator runs it. This happens only inside the browser's opt-in Playwright test context (overrides `Date.prototype.getHours`, not system time, `performance.now` or `Date.now`); ordinary Chess Studio sessions are unchanged. Override with `HOME_GPU_AMBIENT=day` for 13:00, `dawn` for 07:00 or `dusk` for 19:00. Each sampled visit must report the expected period and full LOD. **Do not directly rank GPU ms from older day and night reports**; repeat all families under the same ambient for a comparison.

The JSON now includes `benchmarkAmbient` and `stability`: signed paired A-vs-B GPU differences, normal-baseline and aux-off visit-to-visit drift percentages, and caution flags when either condition drifts **over 15%** or the paired differences disagree in direction. These flags are diagnostics, **not statistical significance tests**. For example, the earlier stairs report had paired differences -0.57/+8.34 ms (opposite signs), and the accent report had ~23% drift between the two normal visits; their aggregate savings must remain exploratory. Even without flags, repeat the run before acting. No power state, drivers, GPU throttling or browser compositor behavior is asserted from these short samples.

The experimental family names preserve existing glow sprites and all key/fireplace/environment lights. The four auxiliary groups are: `wall` = four wall-torch point lights; `board` = the chandelier point light plus narrow board spotlight; `stairs` = three stair-railing lanterns; `accent` = dungeon pit, desk and reading lights. Each mode disables **exactly** its intended group and fails closed if the authored light count changes. Each group gets its own report `.artifacts/home-gpu-benchmark/home-3d-light-probe-<family>-hardware.json`; default `all` retains the original filename. Do not sum group-level savings: GPU cost and shader specialization are nonlinear, and disabling real lights intentionally changes the picture. Use the results to choose a **smaller visually validated production change** later.

Both A and B URLs are explicitly marked as the physical **lighting trial**, and only during this trial the Home's adaptive governor is suspended to retain the initial full-LOD scene. This is necessary because a slow GPU may otherwise degrade only some of the four visits to lite and make the shader-light comparison meaningless. **The normal Home and ordinary `?homeGpuProfile=1` retain their original adaptive behavior**; hardware A/B may feel slower than regular gameplay. The benchmark asserts every sampled frame is full-LOD and has the same actor state and shadows.

If `127.0.0.1:4173` is occupied, the benchmark **fails** rather than sampling a stale build. Stop the old e2e/dev server first. Software/unknown renderers and absent hardware GPU timer results also fail closed.

The same local benchmark creates **four fresh browser contexts** in fixed order normal/aux-off/aux-off/normal, keeps 1440×900 at DPR 1, waits for the actual Home GLB **and Matthias's independently loaded actor to report ready**, then collects distinct asynchronous `EXT_disjoint_timer_query_webgl2` samples. It takes a post-settle query-completion watermark and ignores older results; the A/B/B/A light trial also discards the first fresh asynchronous query, because it may overlap the actor-ready boundary. The actor's station must match between visits. It **fails** if hardware or GPU timers are missing; if the LOD is not full; if the shadow-casting key is missing; if no auxiliary lights were excluded; or if the renderer fingerprint, browser context dimensions, ambient period, initial triangle count or other comparison invariants differ. The only output is `.artifacts/home-gpu-benchmark/home-3d-light-probe-hardware.json` with two observed GPU medians and their exploratory contrast. No individual raw renderer name is logged.

**Interpretation:** the A/B/B/A gap bounds the potential fragment-lighting cost of this *visually different scene*, **not** FPS savings or a safe estimate for removing lights. Re-run multiple sessions under the same driver/power conditions. If GPU differences are small or unstable, stop rather than trading away the canonical castle lighting; if consistently large, test a narrower light selection and review visual runtime evidence before any production change.

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

