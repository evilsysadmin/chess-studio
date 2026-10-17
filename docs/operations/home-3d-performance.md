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

## Opt-in GPU timer (physical device)

Open the Home with `?homeGpuProfile=1` on a capable non-software WebGL2 browser. The profiler samples at most one `EXT_disjoint_timer_query_webgl2` elapsed query per 30 **rendered** frames, without `gl.finish` or blocking for the result. Queries cover `renderer.render(scene, camera)`, including any shadow-map work within that invocation. Do **not** claim that these values include browser layout, JavaScript animation updates or final screen composition.

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
