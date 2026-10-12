# CHESSCOM · Sven 2.5D A/B V33

A runtime **experiment**, not a finished animation atlas. Open CHESSCOM using `?chesscomSven=sprite` to compare Sven's static NE prerendered pose against the unchanged 3D default. The rest of the game and Matthias are untouched.

The 100×141 transparent WebP is a small derivative cutout from the existing Sven concept sheet approved in chat on 2026-10-12. No new generated images. Residual floor/shadow pixels and fixed baked lighting make it an imperfect experimental source; do not market it as production sprite art. A real 8-way idle/walk/shoot/damage pipeline must share a reproducible master, aligned foot pivot and weapon sockets.

The billboard uses Babylon depth testing and the original unit root, retains the old geometry at zero visibility, and preserves unit metadata/pick semantics. Failure to load retains the 3D fallback. The visual artifact test opts in to this path and captures 1600×900 and 390×844; the standard gameplay smoke still tests the default 3D path.

Do not ship this path by default until visual acceptance confirms alpha edges, footline/cover occlusion, movement/select/recoil, reduced motion and mobile. Compare against the current production runtime at the same SHA.
