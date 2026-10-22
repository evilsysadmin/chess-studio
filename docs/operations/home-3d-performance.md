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

## Profiler-only real main/depth draw census

The Home now instruments the **existing** `renderer.shadowMap.render` and
`renderer.renderBufferDirect` only behind `?homeGpuProfile=1`. A successful
`renderer.render(scene, camera)` publishes the read-only canvas field
`data-home-blender-draw-pass`, with actual Three `renderer.info.render.calls`
split into `shadowCalls`, `mainCalls`, `shadowPasses`, and (when every draw
is attributed) `families.main/shadow.castle|matthias|runtime`. Authored scene
GLB and separately loaded Matthias GLB are classified by **object ancestry**,
not material count or potentially ambiguous names. Other runtime meshes,
sprites, particles and effects are `runtime`.

If a Three API cannot be hooked or counters disagree, the pass split is absent
or `families: null`: neither unknown draws nor missing data become zero.
`data-home-blender-first-frame-draw-pass` retains the initial snapshot before
Matthias loads; it is **not** a sustained-frame baseline. There are no extra
draws, shadow refreshes, scene traversals, queries, or layout changes. Hooks
restore original renderer methods on cleanup. Normal sessions do not install
any hooks or publish these additional fields.

The local physical GPU benchmark includes `drawPass` and
`firstFrameDrawPass` per visit, plus main/depth medians in its non-light
summary. Existing JSON files predate the probe and **cannot** be retrofitted
with an inferred shadow fraction. Home normally uses
`shadowMap.autoUpdate = false`, refreshing shadows when explicitly requested
(for example when the imported model or Matthias moves), so expect most
steady-state frames to have zero *depth-pass submissions*; the profiler records
the observed value instead of assuming that. A pass's draw count is not GPU
milliseconds; this census identifies **which subsequent render experiment** to
measure on physical hardware.

### Per-object WebGL draw submission hotspots (profiling only)

The opt-in Home draw census now also exports `drawPass.hotspots.main`
and `drawPass.hotspots.shadow`, including the initial first-frame snapshot.
Each pass has `uniqueObjects`, the top twelve individual Three mesh objects
ranked by **real successful draw submissions** (`family`, `name`, `calls`),
and `otherCalls`. The top rows plus `otherCalls` must equal the exact
pass count. Aggregation uses **object identity**, not Blender mesh names:
two distinct meshes may share a display name, and labels are deliberately
bounded. Missing names show `(unnamed mesh)`.

Read the per-visit `visits[].drawPass.hotspots` in
`.artifacts/home-gpu-benchmark/home-3d-hardware.json`.
A high call count may indicate repeated material groups or draw submissions,
but these are **not GPU milliseconds**. Many objects with one draw each
means a material/scene-wide analysis is more useful than removing one prop.
The reporting list is limited to twelve rows **per pass** to avoid bloating
DOM datasets and JSON; counts outside it remain accurately represented by
`otherCalls`. On invalid/partial census, hotspots are `null`, not zero.
No scene traversal, new render, light change or production-session overhead
is introduced.

### One-command physical GPU draw census (no lighting removal)

After the real-browser CI gate is green, run the fixed three-cold-visit
**normal production Home** without toggling any lights. The command below
requires an actual hardware WebGL renderer, a fresh asynchronous GPU timer
sample in each visit, and a valid per-pass/per-family draw census. It fails
instead of writing a misleading zero when Three cannot attribute draws:

```bash
make home-gpu-draw-census HOME_GPU_NVIDIA_PRIME=0 HOME_GPU_EXPECT_VENDOR=intel
```

Use `HOME_GPU_NVIDIA_PRIME=1 HOME_GPU_EXPECT_VENDOR=nvidia` when validating
NVIDIA PRIME instead. Every run rebuilds the local frontend and uses the same
real Home GLB plus Matthias. It writes
`.artifacts/home-gpu-benchmark/home-3d-hardware.json`: look for
`medians.mainDrawCalls`, `shadowDrawCalls` and exact family contributions
`mainCastleDrawCalls`, `mainMatthiasDrawCalls`, `mainRuntimeDrawCalls`,
plus the corresponding `shadow*` fields. Inspect the per-visit
`drawPass` and `firstFrameDrawPass` as well.

These figures count actual **draw submissions**, not triangles-per-object,
GPU-duration-per-family, or FPS. The timer still measures the entire
`renderer.render`, not the individual pass GPU durations. No historical
unprofiled Home JSON can be used to assign these counts retrospectively.
Do not compare a different browser, driver, scene LOD or time of day
without collecting a new matching baseline.

### Real browser gate for the draw-pass census

The ordinary core-smoke CI lane runs `e2e/home-3d-draw-census.spec.js`
on the **real Three.js Home canvas** using hosted Chromium/SwiftShader,
full desktop layout and a loaded Matthias actor. Unlike mock renderer
unit tests, it requires nonzero actual WebGL draw submissions, verifies
`mainCalls + shadowCalls = totalCalls` and demands that family buckets
sum exactly to each pass (including visible castle and Matthias main draws).
It also validates the first-frame snapshot; this is not a GPU performance
benchmark and must never be interpreted as hardware FPS or GPU milliseconds.
For physical GPU numbers, rerun the existing Nobara benchmark on the same
revision and inspect its new per-visit `drawPass` fields.

## Runtime-only hearth flame geometry LOD

The 28 explicitly named camera-facing flame/hot/tongue/base spheres on the two Home fireplaces use an isolated **runtime GLB-only** 24×12 sphere instead of the authored 40×20 topology. The canonical Blender builder and its Eevee review render remain unchanged. The exporter fails closed unless the exact 28 known object names, expected original 1,520-triangle spheres, material identities, UV-free fire materials and local bounding boxes match. After replacement it verifies unchanged per-axis local bounds, vertex smoothing, and a minimum reduction of 25,000 triangles; GLTFLoader still finds the same animated mesh names and pivots.

The export metadata field `hearth_front_flame_lod` reports actual triangles before, after, saved and the number of modified nodes. This **reduces vertex/index geometry**, not the number of GLB primitive instances or the number of draw submissions: do not claim extra FPS without a physical GPU A/B test. Because fewer vertices can subtly alter shader flutter/silhouettes, the unpromoted candidate must pass the Home browser runtime gate and its captured PNG must be reviewed before enabling automerge; the old content-addressed GLB remains the rollback baseline.

## Stationary transform propagation

The Home scene root is an identity container that never moves. Three.js ordinarily calls `updateMatrix()` on it every render; this dirties the root world matrix and forces recomputation throughout the hall. On the loaded GLB, once fire and Klaus rigs have been prepared, `freezeHomeBlenderStaticTransforms` primes each stationary object's local TRS matrix once and disables its automatic rewrite. **Flame, ember, candle and steam nodes remain animated**, as does the full Klaus subtree; Matthias, lights, glows, dust and runtime particles are separate scene children and retain normal automatic transforms. This preserves shadow maps, lighting, materials, geometry, camera, GLB bytes and renderer policy.

This is a CPU-side matrix-propagation optimization, **not a measured GPU speedup**. Tests exercise stationary world-matrix equality under repeated animation, moving fire/Klaus/Matthias and manually managed matrices. The canvas attribute `data-home-blender-frozen-transforms` provides a bounded, startup-only sanity count; compare CPU draw cost with the established local benchmark rather than guessing frame-time savings.

## Flame pass eligibility before a physical GPU experiment

With `?homeGpuProfile=1`, the Home publishes
`data-home-blender-flame-pass-eligibility` as a JSON count of **actual
loaded GLB flame/hot/candle material slots**, split by `doubleSided`,
`frontSided` and `otherSided`, plus the currently transparent slots.
The counts are collected once after fire-rig preparation, **before**
the separate animation can make flames transparent. Neither materials nor
runtime rendering are changed by the probe.

A `DoubleSide` slot is only a potential target for Three.js transparent
front/back rendering *once the real GPU flame loop makes it transparent*.
The initial count now additionally reports `transparentDoubleSidedNow` and
`singlePassTransparentDoubleSidedNow` (both read-only, per material slot).
On a real non-software renderer with animated fire, the profiler also captures
`data-home-blender-flame-pass-live-eligibility` **after** the existing fire
and candle material preparation. This separate one-shot snapshot uses the
same schema: only `transparentDoubleSidedNow` counts actual alpha-enabled
DoubleSide slots, and `singlePassTransparentDoubleSidedNow` counts those
already marked `forceSinglePass`. It never enables alpha or modifies any
material. The live census is intentionally **absent** under SwiftShader and
reduced-motion; missing is not zero. The physical `home-3d-hardware.json` now records both
`visits[].flamePassEligibility` (pre-animation) and
`visits[].flamePassLiveEligibility` (live alpha material slots).
Missing or invalid live data is `null`, **not zero**; software rendering
cannot manufacture live evidence. Counts are validated integer material slots,
not measured draw submissions or expected frame-time savings.

These slots still are **not observed
draw calls**: compare the real main-pass draw census and asynchronous physical
GPU times before drawing any performance conclusions.
If `doubleSided === 0`, the proposed `forceSinglePass` experiment has
**no eligible authored flame materials** under current GLB siding, and
should not be promoted to production. Never change material sidedness just
to manufacture a benchmark win; that would alter appearance/culling.
If candidates exist, the gain still requires **real Intel/NVIDIA physical
GPU A/B/B/A timer samples, measured draw-pass counts and review of two
runtime PNGs**. Hosted Chromium uses SwiftShader and intentionally leaves
fire off, so its censes can verify scene data but **cannot** prove physical
GPU benefit. `materialSlots` is not a draw-call count.

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


## Single-source accent lighting GPU isolation

A physical Intel GPU A/B/B/A on the **current two-fill production Home** measured 23.34 ms with all accents vs. 19.255 ms without the 3 `accent` shading lights: **4.085 ms / 17.50% lower GPU time**, paired +3.77 / +4.40 ms with no drift flags (night, full LOD, Matthias in reading-chair, 329 draws / 492,298 triangles). This was a **group** contrast; it does not identify which of the three lights caused the shader cost or imply an FPS benefit.

The runtime identifies the three sources accurately by authored position: `accent-dungeon` is the fire-pit uplight at the foot of the stairs, `accent-table` is the tabletop candle at (-2.72, 1.9, -1.4), and `accent-reading` is the reading/library desk light at (-3.1, 1.5, -3.76). Their positions, intensity, glows, flicker and shading in normal play **do not change**. Read-only diagnostic `userData.homeLightProbeAccent` labels are attached to just these three light objects.

Run **one** physical trial at a time in a clean up-to-date checkout:

```bash
make home-gpu-light-probe \
  HOME_GPU_NVIDIA_PRIME=0 HOME_GPU_EXPECT_VENDOR=intel \
  HOME_GPU_AMBIENT=night HOME_GPU_BASELINE=production \
  HOME_GPU_LIGHT_GROUP=accent-dungeon
# Then run the same command with accent-table and accent-reading.
```

Each trial produces a distinct file: `.artifacts/home-gpu-benchmark/home-3d-light-probe-accent-dungeon-production-hardware.json` (or `accent-table` / `accent-reading`). It compares `pair-normal` with `pair-aux-accent-dungeon-off`, using A/B/B/A and the same strict GPU-timer, WebGL hardware/vendor, full-LOD, shadow key, actor, time-of-day, scene-inventory and renderer-fingerprint guards. **A always disables four old wall shaders and adds two fills; B additionally disables exactly one named accent, not the other two.** Modes are double-opt-in under the existing `homeGpuProfile=1&homeLightProbe=...` flags. The pure report aggregator rejects any mixed baseline, missing timing, unknown light-mode or group/individual mismatch. All historical report filenames and `HOME_GPU_LIGHT_GROUP=accent` keep their existing meaning.

These are exploratory timing contrasts of deliberately different lighting. A single low-cost accent may explain little of the 4.085 ms group gap, and costs need not add linearly. **Do not remove a production light from these measurements alone.** If one is a convincing hotspot, prepare a separate reversible visual experiment and review real WebGL before/after PNGs before promotion.

## Production-pair GPU lighting baseline — after PR #5850

The canonical full-LOD Home now ships the **two-fill wall-torch layout** (4 original wall shader lights hidden, 2 wider fills added, independent torch glows preserved). Older lighting-family experiments explicitly used a **four-torch** baseline; reusing their `normal` comparator would overstate or misattribute subsequent gains to the remaining families.

To benchmark the cost of the board, stairs or accent lights **on the current production-lit scene**, on the same native Intel hardware:

```bash
make home-gpu-light-probe \
  HOME_GPU_NVIDIA_PRIME=0 HOME_GPU_EXPECT_VENDOR=intel \
  HOME_GPU_AMBIENT=night HOME_GPU_BASELINE=production HOME_GPU_LIGHT_GROUP=stairs
# Repeat with HOME_GPU_LIGHT_GROUP=accent or board after reviewing the report.
```

The physical A/B/B/A sequence is `pair-normal / pair-aux-stairs-off / pair-aux-stairs-off / pair-normal` (or the selected family), and **both** variants retain the two production wall fills. Baseline: four legacy wall shading lights hidden, two fills present. B: the same four hidden **plus exactly** 3 stairs, 3 accent or 2 board light contributions hidden. The harness demands the unchanged hardware renderer fingerprint, full LOD, night ambience, Matthias station, shadow key, scene geometry and fresh asynchronous GPU samples. It emits `.artifacts/home-gpu-benchmark/home-3d-light-probe-stairs-production-hardware.json` (or `-accent-` / `-board-`) so earlier reports are not overwritten. The JSON includes `baselineLayout: "production"` and `baselineMode: "pair-normal"`; the pure summary helper **rejects mixed** legacy and production mode labels.

**The old benchmark is intentionally still the default:** `HOME_GPU_BASELINE=legacy` uses its original four-wall-light baseline and original filenames. `HOME_GPU_BASELINE=production` supports only `board`, `stairs`, `accent`. Other production-group requests **fail rather than silently comparing a different layout**. All these modes require both opt-in query flags and exist for GPU profiling alone; no production UI or lights change. A reduction from switching off lights is **not** acceptable visual design or a measured FPS gain. Only after repeat GPU evidence and reviewed runtime PNGs should we explore a visual alternative in a separate Draft PR with rollback.

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

### Promotion plan — two-fill wall torches with legacy rollback

The physical Intel A/B/B/A test of `wall-pair`, at 1440×900, DPR 1, night, full LOD, Matthias in reading-chair and the same WebGL renderer, gave **30.465 vs 27.82 ms GPU** (2.645 ms, **8.68% lower**). Paired improvements were 3.31 and 1.98 ms; no drift warnings. The original four-torch layout and the two-fill layout were compared using actual runtime WebGL PNGs in the review conversation. The pair retains all four sconces/flames/glows and replaces **four nonshadowing wall light contributions** with **two wider midpoint contributions**. This is not a measured FPS uplift or a claim of visual equivalence at other times/viewports.

Promotion changes the **default full-LOD Home layout** to the pair. Lite/mobile without torch lighting remains unchanged. The old four-light layout is still compiled into the client and is immediately available **per URL and reload** using `?homeWallTorches=legacy` (with other URL parameters, append `&homeWallTorches=legacy`). Clearing the parameter restores the new default. This switch does not edit preferences or override the user's account. Operational global rollback is an ordinary commit revert / prior deployment, not an invented remote feature flag.

Physical A/B lighting probes keep comparing against their old **explicit four-light canonical baseline**: `?homeGpuProfile=1&homeLightProbe=normal` always uses legacy while `...&homeLightProbe=wall-pair` always uses the two fills. The read-only `data-home-wall-torches` on the 3D canvas reports `pair` or `legacy` for runtime verification. `?homeGpuProfile=1` without an explicit `homeLightProbe` retains the user's selected production layout and the normal adaptive governor.

Before promoting this visual PR out of Draft, run the updated physical `wall-pair` hardware benchmark on the **exact PR head**. In addition to the pre-existing A/B PNGs and JSON, it captures `home-3d-wall-pair-production-default-hardware.png` and `home-3d-wall-pair-production-legacy-rollback-hardware.png` from real non-profiling entry URLs, with the same viewport, frozen night ambient, full LOD and mounted Matthias. Review both against the previously inspected canonical and two-fill PNGs **in the same chat**, and repeat physical timings. Once visually approved and CI-green, use the normal exact-SHA main admission → staging deploy → staging accreditation → production promotion chain; inspect staging before declaring production ready. Keep the old route if a visual or WebGL regression appears.

### Experimental wall-torch pair (visual + physical GPU A/B)

The `wall` isolation report on Intel WebGL (`night`, full LOD, Matthias in reading-chair) measured **30.675 vs 25.775 ms** (4.90 ms / 15.97% lower GPU time) with four original wall torch lights excluded. Its paired differences were +5.59 / +4.21 ms and its stability flags were empty; this short test still requires replication and does **not** authorize removing four authored light sources.

An opt-in **visual candidate**, `?homeGpuProfile=1&homeLightProbe=wall-pair`, leaves the original four sconces, flames, emission, additive halo sprites, shadow key, fireplaces and all other lights untouched. Only in this explicit diagnostic mode it excludes the four original *shading* point lights and replaces their wall illumination with **two slightly brighter and broader point fills**, placed midway between the two pairs of wall sconces (x≈-6.075 and x≈5.2). The existing lights keep their indices and independent flicker seeds; the extra fills are appended and animated separately, with no additional glow sprites or shadow passes. **The pair variant is intentionally NOT the default** and has no production quality-policy path.

Use this exact physical Intel command on the feature-PR branch, not on unmodified `main` before visual acceptance:

```bash
make home-gpu-light-probe HOME_GPU_NVIDIA_PRIME=0 \
  HOME_GPU_EXPECT_VENDOR=intel HOME_GPU_AMBIENT=night \
  HOME_GPU_LIGHT_GROUP=wall-pair
```

The harness saves `.artifacts/home-gpu-benchmark/home-3d-light-probe-wall-pair-hardware.json` plus two **actual WebGL-canvas screenshots** in the same directory:
`home-3d-wall-pair-baseline-hardware.png` and `home-3d-wall-pair-two-fill-candidate-hardware.png`. Both are captured after the actor has loaded and sampled, with the same viewport, camera, full LOD and frozen clock. It asserts that the candidate disables **exactly four original** wall lights and adds **exactly two** fills while the baseline adds none. **Review and show both real PNGs in the conversation** (full-frame and details of sconces, board, architecture and resident) before ever promoting the change to production or merging any visually changing PR; preserve a rollback. Differences in animated flame frames are expected and not a reason to do pixel-exact equality.

If the A/B lacks a repeatable hardware GPU benefit, or the original wall mood becomes too flat, **do not promote** the two-fill variant. The room's ordinary lighting remains unchanged even if this isolated diagnostic lands.

**Local repeatability control (all-light / per-family A/B/B/A):** by default, `make home-gpu-light-probe` fixes the in-browser local hour to 23:00 so every one of its four visits uses the **same `night` ambient**, independent of when the operator runs it. This happens only inside the browser's opt-in Playwright test context (overrides `Date.prototype.getHours`, not system time, `performance.now` or `Date.now`); ordinary Chess Studio sessions are unchanged. Override with `HOME_GPU_AMBIENT=day` for 13:00, `dawn` for 07:00 or `dusk` for 19:00. Each sampled visit must report the expected period and full LOD. **Do not directly rank GPU ms from older day and night reports**; repeat all families under the same ambient for a comparison.

The JSON now includes `benchmarkAmbient` and `stability`: signed paired A-vs-B GPU differences, normal-baseline and aux-off visit-to-visit drift percentages, and caution flags when either condition drifts **over 15%** or the paired differences disagree in direction. These flags are diagnostics, **not statistical significance tests**. For example, the earlier stairs report had paired differences -0.57/+8.34 ms (opposite signs), and the accent report had ~23% drift between the two normal visits; their aggregate savings must remain exploratory. Even without flags, repeat the run before acting. No power state, drivers, GPU throttling or browser compositor behavior is asserted from these short samples.

The experimental family names preserve existing glow sprites and all key/fireplace/environment lights. The four auxiliary groups are: `wall` = four wall-torch point lights; `board` = the chandelier point light plus narrow board spotlight; `stairs` = three stair-railing lanterns; `accent` = dungeon pit, desk and reading lights. Each mode disables **exactly** its intended group and fails closed if the authored light count changes. Each group gets its own report `.artifacts/home-gpu-benchmark/home-3d-light-probe-<family>-hardware.json`; default `all` retains the original filename. Do not sum group-level savings: GPU cost and shader specialization are nonlinear, and disabling real lights intentionally changes the picture. Use the results to choose a **smaller visually validated production change** later.

Both A and B URLs are explicitly marked as the physical **lighting trial**, and only during this trial the Home's adaptive governor is suspended to retain the initial full-LOD scene. This is necessary because a slow GPU may otherwise degrade only some of the four visits to lite and make the shader-light comparison meaningless. **The normal Home and ordinary `?homeGpuProfile=1` retain their original adaptive behavior**; hardware A/B may feel slower than regular gameplay. The benchmark asserts every sampled frame is full-LOD and has the same actor state and shadows.

If `127.0.0.1:4173` is occupied, the benchmark **fails** rather than sampling a stale build. Stop the old e2e/dev server first. Software/unknown renderers and absent hardware GPU timer results also fail closed.

The same local benchmark creates **four fresh browser contexts** in fixed order normal/aux-off/aux-off/normal, keeps 1440×900 at DPR 1, waits for the actual Home GLB **and Matthias's independently loaded actor to report ready**, then collects distinct asynchronous `EXT_disjoint_timer_query_webgl2` samples. It takes a post-settle query-completion watermark and ignores older results; the A/B/B/A light trial also discards the first fresh asynchronous query, because it may overlap the actor-ready boundary. The actor's station must match between visits. It **fails** if hardware or GPU timers are missing; if the LOD is not full; if the shadow-casting key is missing; if no auxiliary lights were excluded; or if the renderer fingerprint, browser context dimensions, ambient period, initial triangle count or other comparison invariants differ. The only output is `.artifacts/home-gpu-benchmark/home-3d-light-probe-hardware.json` with two observed GPU medians and their exploratory contrast. No individual raw renderer name is logged.

**Interpretation:** the A/B/B/A gap bounds the potential fragment-lighting cost of this *visually different scene*, **not** FPS savings or a safe estimate for removing lights. Re-run multiple sessions under the same driver/power conditions. If GPU differences are small or unstable, stop rather than trading away the canonical castle lighting; if consistently large, test a narrower light selection and review visual runtime evidence before any production change.

### Guard opt-in para el experimento de llamas single-pass

El comparador físico normal **no** implica que se haya activado `forceSinglePass`. Para comprobar el experimento #5883, ejecutar con `--require-flame-single-pass`: exige muestras reales de timer GPU, censo sostenido de draw calls y censo animado de materiales en ambas revisiones. Además comprueba `singlePassTransparentDoubleSidedNow=0` en baseline, un valor positivo en candidate y un valor estable durante las tres visitas. El modo experimental exige además identidad exacta de las cantidades de materiales por caras (`DoubleSide`/`FrontSide`/otras) y transparencia, tanto entre las tres visitas como entre las dos revisiones: **únicamente puede variar `forceSinglePass`**. Si cambia el sidedness o el número de materiales transparentes elegibles, se rechaza la atribución de ganancias al flag. El informe muestra los slots activados, **no interpreta los slots como draw calls ahorradas** ni reemplaza la revisión visual de PNG runtime.

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

The A/B provenance contract requires **full 40-character hexadecimal commit SHAs** for *both* revisions. Abbreviated Git refs are ambiguous and rejected even if a prior schema-2 report included them; rerun the original hardware capture with `CHESS_HOME_GPU_REVISION` populated by the Makefile. Neither short refs nor synthetic values identify a reproducible build.

This offline comparison **rejects** software/unknown renderers, missing exact SHAs, mismatched Chromium versions, GPU-model fingerprints, LOD, lighting period, canvas sizes or viewport/DPR, and incomplete visits/GLB evidence. It shows differences in reported medians; lower is better for GPU/CPU times, but **a three-visit delta is not proof of a general performance gain**. Rerun A/B more than once to see whether the sign and magnitude are stable. For reports that set `requireTimer=true`, comparison now demands actual positive finite `visits[].gpuSamplesMs`, validates `visits[].gpuMedianMs` against those query samples, and recomputes the overall `medians.gpuMs` from the three per-visit medians. It rejects stale or fabricated summaries rather than treating CPU timing as GPU evidence. This validates report **internal consistency**, not hardware identity or GPU performance improvements; sampling uniqueness remains guarded by the browser harness.

When real GPU elapsed queries are missing, the GPU row is explicitly `n/a`: CPU-submit p95 is never substituted for GPU timing. A matching hash **cannot verify** that two runs were on the same physical GPU or driver; keep those controls yourself. Draw calls and Three.js resource counts are not FPS, VRAM bytes or total memory usage.

Regression checks for invalid/noncomparable benchmark reports run in CI preflight via stdlib `unittest`.

