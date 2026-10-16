# Hall GPU benchmark (opt-in)

This local-only Playwright benchmark compares the same Duel Hall GLB in two browser modes. Set CHESS_PVP_GPU_MODE to `hardware` or `software` and invoke `e2e/pvp-hall-gpu-benchmark.spec.js` using `e2e/playwright.pvp-gpu.config.js`. Run both modes on the same workstation, with built frontend and E2E dependencies installed. The local E2E API is mocked; the 3D Hall remains real.

Each mode measures three 1440x900 visits and logs `PVP_HALL_GPU_BENCH`. Compare medians of `maxAfterReadyMs`. Chromium's actual WebGL context must identify a physical GPU for the hardware mode and SwiftShader/llvmpipe for the software mode; flags are not enough. In desktop Linux this defaults to headed Chrome; explicitly set `CHESS_PVP_GPU_HEADLESS=1` to investigate a headless-capable driver. Unsupported hardware, unavailable GLB, or a fallback scene are a failed test, not proof of improvement. No real identities or raw renderer strings are logged.

The regular CI configuration excludes this file. Do not attribute a staging-SwiftShader slowdown to physical GPUs without a verified hardware measurement.
