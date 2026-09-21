# Render local con GPU — skill

Regla: **en local, si hay GPU disponible, se usa de extremo a extremo** (Blender para renderizar y exportar, y Chromium/Playwright para probar la app real). **CI renderiza por software**, y eso es intencionado. No confundir las dos cosas: un resultado en software no demuestra cómo se ve en GPU, ni al revés.

Aplica a Home 3D, War Room v2 y cualquier trabajo que renderice con Blender o cargue WebGL. Contexto por área: `skills/home-blender/SKILL.md` y `docs/operations/war-room-blender-pipeline.md`.

## Cuándo y cuánto

- Usar la GPU sin frenarla artificialmente: **no envolver Blender en `nice`** ni bajar muestras "por cortesía". Muestras normales de preview (`--samples 32`–`48`) y el ancho que pide el caso.
- Esto no contradice "no saturar la máquina con renders innecesariamente caros": la idea es no repetir renders sin necesidad, no ralentizar los que hacen falta.
- Si no hay GPU (o el proceso cae a software), el trabajo sigue valiendo, pero hay que decirlo en la PR porque cambia lo que se puede afirmar.

## Blender (render y export)

Portátil NVIDIA híbrido (probado con una RTX 5070 Ti): pedir el offload y **no** definir `LIBGL_ALWAYS_SOFTWARE`.

```bash
__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia __VK_LAYER_NV_optimus=NVIDIA_only \
blender --background --python-exit-code 1 \
  --python scripts/blender/configure_eevee_premium.py \
  --python scripts/blender/<script>.py -- <args>
```

- Home, render de review: `build_home_v2_blockout.py -- --reference scripts/blender/references/home_canon_20260918.webp.b64 --out-dir <dir> --samples 48 --max-width 1920 --engine eevee`.
- Home, GLB de runtime: `export_home_v2_runtime.py` con los mismos `--reference/--out-dir`.
- Para comprobar que usa la GPU: `nvidia-smi --query-compute-apps=name,used_memory --format=csv` debe listar `blender` con memoria. El cálculo de la escena en Python es CPU; el render Eevee es lo que sube la GPU.
- En otras GPUs (AMD/Intel con Mesa) el equivalente es `DRI_PRIME=1`; el principio es el mismo: nunca forzar software en local.

### Diferencias local ↔ CI que no son regresiones

- **Meshopt**: el Blender de la distro (Fedora, 5.2.0) no trae la librería. `export_home_v2_runtime.py` exporta el GLB sin comprimir; `build_war_room_premium.py` sale con código 1 tras escribir preview y GLB ("runtime GLB missing EXT_meshopt_compression"). El preview y el GLB siguen siendo válidos para revisar. CI usa el Blender portátil, comprime, y el workflow del runtime de Home exige compresión con `HOME_RUNTIME_REQUIRE_MESHOPT=1`.
- **Determinismo**: dos renders Eevee del mismo `main` difieren (~1,2/255 de media en la Home); no usar el diff global como veredicto, evaluar por recortes. En cambio la **app con `prefers-reduced-motion`** es determinista (ruido base 0,000) y sirve para comparar dos GLB.
- **Color**: OCIO local puede avisar de que la config es más nueva que la librería; el render sale igualmente.

## Chromium / Playwright (app real)

El Chromium headless de Playwright usa **SwiftShader (software) por defecto**, igual que CI. Para probar en GPU hay que pedirlo:

```js
chromium.launch({
  args: ['--use-angle=gl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia' },
})
```

(`--use-angle=vulkan` no dio WebGL2 y `--use-gl=egl` cayó a SwiftShader en esta máquina.)

**Comprobar siempre qué renderizador se obtuvo** antes de sacar conclusiones:

```js
const gl = document.createElement('canvas').getContext('webgl2');
gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
// GPU real: "ANGLE (NVIDIA ... GeForce RTX ...)"   software: "... SwiftShader ..."
```

En la Home, `data-home-fire-motion` lo delata: `live` con GPU real, `off-software` con SwiftShader (por diseño, para no ahogar la página).

Para reproducir CI (por ejemplo, tiempos de las specs) sí conviene lanzar **sin** esos flags o con `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.

## Trampas que cuestan horas

- **Servidor de e2e viejo ocupando el puerto 4173.** `e2e/playwright.config.js` usa `reuseExistingServer: !CI`. Un `e2e_dist_server.py` de una sesión anterior sigue vivo y sirve un `dist` antiguo: todas las pruebas "pasan" o "fallan" contra código que no es el tuyo (en una sesión esto hizo que la escena de Blender nunca se montara). Antes de probar: `ps -o pid,lstart,cmd -C python3 | grep e2e_dist_server`, y comprobar que el `index-*.js` que sirve coincide con `frontend/dist/assets`.
- **Usar un puerto propio** en vez de matar procesos ajenos: levantar `python3 -S scripts/e2e_dist_server.py --root frontend/dist --base /chess-studio/ --host 127.0.0.1 --port 4180` y una config temporal (`{ ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:4180/chess-studio/' }, webServer: undefined }`). No dejar esa config ni el servidor en el repo.
- **Build correcto**: `npm run build` (aplica la CSP con `apply_frontend_csp.mjs`), no `npx vite build` a secas.
- **Probar un GLB local en la app**: interceptar la URL del R2 con `page.route(/home-v2-runtime-[0-9a-f]+\.glb/, ...)` y servir el fichero local (con `access-control-allow-origin: *`). Es lo que permite validar cambios de Blender sin publicar nada.
- **`pkill -f "<patrón>"` se mata a sí mismo** si el patrón aparece en su propia línea de comandos. Parar servidores por PID (`ss -ltnp | grep :4180`).
- **Vitest y build son locales y rápidos**: `npm ci` en `frontend/` y `e2e/`, `npx vitest run`. No hace falta esperar a CI para saber si compilan.

## Checklist rápido

1. ¿Blender corre con la GPU (sin `nice`, sin `LIBGL_ALWAYS_SOFTWARE`)?
2. ¿El navegador de prueba obtuvo un renderizador de GPU real (no SwiftShader)?
3. ¿Sirvo mi `dist` actual, en mi puerto, con el `index-*.js` correcto?
4. ¿Comparo con `prefers-reduced-motion` cuando quiero un diff fiable?
5. ¿Anoto en la PR qué se validó en GPU y qué queda para CI (software, Blender portátil con meshopt)?
