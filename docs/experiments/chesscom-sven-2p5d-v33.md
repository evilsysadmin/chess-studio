# CHESSCOM · Sven 2.5D A/B V33

A runtime **experiment**, not a finished animation atlas. Open CHESSCOM using `?chesscomSven=sprite` to compare Sven's static NE prerendered pose against the unchanged 3D default. The rest of the game and Matthias are untouched.

The 100×141 transparent WebP is a small derivative cutout from the existing Sven concept sheet approved in chat on 2026-10-12. No new generated images. Residual floor/shadow pixels and fixed baked lighting make it an imperfect experimental source; do not market it as production sprite art. A real 8-way idle/walk/shoot/damage pipeline must share a reproducible master, aligned foot pivot and weapon sockets.

The billboard uses Babylon depth testing and the original unit root, retains the old geometry at zero visibility, and preserves unit metadata/pick semantics. Failure to load retains the 3D fallback. The visual artifact test opts in to this path and captures 1600×900 and 390×844; the standard gameplay smoke still tests the default 3D path.

Do not ship this path by default until visual acceptance confirms alpha edges, footline/cover occlusion, movement/select/recoil, reduced motion and mobile. Compare against the current production runtime at the same SHA.


## V35 — futuro reproductor de bancos auténticos

`?chesscomSven=atlas` activa **sólo como experimento** el renderer de bancos direccionales. Busca `/chesscom/sven-bank-v1.json` y el WebP asociado, comprueba el manifiesto V34 **y verifica SHA-256 sobre los bytes reales del atlas** antes de ocultar el modelo 3D. No existe todavía un banco con ocho vistas y animaciones limpias aceptadas: por tanto, el resultado esperado actualmente es `data-chesscom-sven-atlas=fallback` y el 3D sigue visible. El selector anterior `?chesscomSven=sprite` permanece intacto.

Cuando el banco esté aprobado, el renderer cambiará orientación según la proyección de la rotación real de Sven sobre la cámara, animará con los FPS de cada clip y conservará el último fotograma de muerte. El pivote de pies viene del manifiesto; no se generan ni duplican direcciones. Los frames de la lámina experimental tienen fondo y botas/armas mal segmentados: **se rechazan**, no se publican como atlas de producción.


## V36 — orientación real en movimiento y maestro candidato

Se ha corregido un fallo del reproductor: el renderer táctico mantiene `root.rotation.y` prácticamente fijo por equipo, por lo que deducir siempre la dirección visual de ese ángulo hacía inútiles las ocho vistas durante el desplazamiento. La orientación del clip `walk` ahora se deriva del vector real `motion.start → motion.target`, proyectado por la cámara ortográfica, y se conserva al detenerse. El modelo 3D, la balística y el modo predeterminado no cambian.

**Candidato externo a maestro de arte, todavía sin integrar ni aprobar:** `quaternius-men/swat.glb` del pack Ultimate Modular Men de Quaternius, CC0-1.0, listado en `euuuuuuan/fatal-funnel-public`, commit `29a6bdfd01ad175c389cbd0bac80c30f926ff96b`, ruta `packages/renderer/assets/models/quaternius-men/swat.glb`, blob SHA Git `280b2776eee2af7e131db22dd7a32b1e99764a12`, tamaño 1.560.900 bytes. Referencia: https://github.com/euuuuuuan/fatal-funnel-public/tree/29a6bdfd01ad175c389cbd0bac80c30f926ff96b/packages/renderer/assets/models/quaternius-men. Autoría/licencia: https://quaternius.com/packs/ultimatemodularcharacters.html. **No se descarga, redistribuye ni usa en runtime con esta PR**, y su parecido con el Sven aprobado sigue pendiente de una comparación visual legítima; no se añade un binario grande al repositorio.


## V37 — pivote de apoyo real

El atlas es un plano Babylon centrado, mientras que el manifiesto declara el pivote en píxeles desde la esquina superior izquierda. El centro del plano se desplaza ahora exactamente lo necesario para situar **ese píxel en Y=0**, con independencia del padding transparente bajo las botas. Tests de geometría prueban matemáticamente X/Y y entradas corruptas. Sólo afecta al futuro modo opt-in `?chesscomSven=atlas`; mientras no exista un atlas validado, el fallback 3D y el sprite NE experimental no cambian. No es aprobación visual de un banco artístico.


## V38 — compilación de arte de ocho direcciones (sin assets ficticios)

El compilador `scripts/art/chesscom_sven_bank_v38.py` adapta **Sprite Forge schema 2** al manifiesto V34 que consume Babylon. Contrato fuente: `scripts/art/contracts/chesscom_sven_v38.json`; tests: `scripts/art/test_chesscom_sven_bank_v38.py`. Requiere 96 PNG RGBA **auténticos** (idle 2, walk 4, aim 1, shoot 2, hit 1, die 2 por cada una de ocho direcciones), authored como `frames/idle/N/000.png`, `frames/walk/SE/003.png`, etc., celdas 128×192 y pivote (64,180). Reutiliza los lint geométricos, alpha y continuidad temporal de Sprite Forge; rechaza archivos extra, ausencia de direcciones, cambio de pie y copia de poses entre direcciones.

Ejemplo, únicamente cuando exista un master canónico con fotogramas exportados y aprobados:

```bash
python3 scripts/art/chesscom_sven_bank_v38.py \\
  --frames-root /tmp/sven-authored-frames \\
  --output-dir /tmp/sven-bank-candidate
```

Entrega candidato `sven-bank-v1.webp` (WebP **lossless**, SHA-256 comprobado, máximo 8 MiB) y `sven-bank-v1.json`, no copia ni publica automáticamente bajo `frontend/public`, R2 o producción. La estructura de atlas dispone seis strips horizontales con ocho direcciones en filas, 1536×1536 en total; el manifiesto mantiene las coordenadas escritas desde arriba e incluye pivote exacto para V37. No equivale a validación visual, aceptación humana, trazabilidad de licencias ni benchmark GPU, y el maestro GLB Quaternius sigue siendo solo candidato externo.


## V39 · inspección visual de un maestro GLB existente (no aprobado)

El workflow `chesscom-sven-master-review.yml` descarga para análisis un GLB SWAT de la revisión inmóvil `29a6bdfd01ad175c389cbd0bac80c30f926ff96b` del repositorio `euuuuuuan/fatal-funnel-public` y valida el Git blob SHA `280b2776eee2af7e131db22dd7a32b1e99764a12`. Se declara como candidato del paquete Ultimate Modular Characters de Quaternius (CC0-1.0 según la referencia pública; comprobar licencia y procedencia antes de redistribuirlo).

Blender normaliza la estatura, mantiene el arte del GLB sin redibujarlo y renderiza ocho vistas isométricas/ortográficas estáticas, con iluminación de referencia azul nocturna y ámbar. Los PNG, sus hashes y las dimensiones del master quedan sólo como artifacts temporales de CI. La inspección humana de silueta, mochila, rostro, casco y arma contra la referencia de Dust Veil decidirá si el maestro es aceptable. **No hay 96 frames animados, ni atlas V38 generado, ni cambios de runtime, ni binarios nuevos en Git/R2**. Si el modelo es demasiado simple o falla procedencia/Blender, se descarta.
