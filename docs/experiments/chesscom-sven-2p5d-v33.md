# CHESSCOM · Sven 2.5D A/B V33

A runtime **experiment**, not a finished animation atlas. Open CHESSCOM using `?chesscomSven=sprite` to compare Sven's static NE prerendered pose against the unchanged 3D default. The rest of the game and Matthias are untouched.

The 100×141 transparent WebP is a small derivative cutout from the existing Sven concept sheet approved in chat on 2026-10-12. No new generated images. Residual floor/shadow pixels and fixed baked lighting make it an imperfect experimental source; do not market it as production sprite art. A real 8-way idle/walk/shoot/damage pipeline must share a reproducible master, aligned foot pivot and weapon sockets.

The billboard uses Babylon depth testing and the original unit root, retains the old geometry at zero visibility, and preserves unit metadata/pick semantics. Failure to load retains the 3D fallback. The visual artifact test opts in to this path and captures 1600×900 and 390×844; the standard gameplay smoke still tests the default 3D path.

Do not ship this path by default until visual acceptance confirms alpha edges, footline/cover occlusion, movement/select/recoil, reduced motion and mobile. Compare against the current production runtime at the same SHA.


## V35 — futuro reproductor de bancos auténticos

`?chesscomSven=atlas` activa **sólo como experimento** el renderer de bancos direccionales. Busca `/chesscom/sven-bank-v1.json` y el WebP asociado, comprueba el manifiesto V34 **y verifica SHA-256 sobre los bytes reales del atlas** antes de ocultar el modelo 3D. No existe todavía un banco con ocho vistas y animaciones limpias aceptadas: por tanto, el resultado esperado actualmente es `data-chesscom-sven-atlas=fallback` y el 3D sigue visible. El selector anterior `?chesscomSven=sprite` permanece intacto.

Cuando el banco esté aprobado, el renderer cambiará orientación según la proyección de la rotación real de Sven sobre la cámara, animará con los FPS de cada clip y conservará el último fotograma de muerte. El pivote de pies viene del manifiesto; no se generan ni duplican direcciones. Los frames de la lámina experimental tienen fondo y botas/armas mal segmentados: **se rechazan**, no se publican como atlas de producción.
