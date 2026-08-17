# Renderizado headless — cómo se pudo *ver* el arte antes de entregarlo

Limitación real de este entorno: no hay navegador, no hay forma de
renderizar WebGL ni de "mirar" una imagen generada de la manera obvia.
Durante buena parte de la sesión eso significó diseñar arte a ciegas —
código que en teoría debía verse de una forma, sin poder confirmarlo.

Eso cambió a mitad de camino. El pipeline:

1. **`headless-gl`** (paquete npm) crea un contexto WebGL real sin
   navegador — pero necesita librerías gráficas del sistema
   (Mesa/OpenGL) que no estaban instaladas por defecto.
2. Se instalaron con `apt-get`: `libgl1-mesa-dev`, `libglu1-mesa-dev`,
   `xvfb` (un framebuffer virtual, para que Mesa tenga dónde "dibujar"
   sin una pantalla real detrás).
3. **Three.js moderno (r185) no es compatible con WebGL1** —
   `headless-gl` solo da WebGL1. Se resolvió instalando una versión vieja
   de Three.js (0.140) *aparte*, solo para este pipeline de verificación
   — el proyecto real sigue en la versión moderna, esto es una
   herramienta de trabajo, no una dependencia del código final.
4. El canvas se renderiza a un buffer de píxeles crudo (`gl.readPixels`),
   que se voltea verticalmente (OpenGL da las filas de abajo hacia
   arriba) y se guarda como PNG con el paquete `canvas`.
5. El PNG resultante se mira con la herramienta de visualización nativa
   del entorno — la misma que se usaría para ver cualquier imagen.

Con esto se pudo iterar de verdad en vez de adivinar: diseñar, renderizar,
mirar, corregir, repetir — el mismo ciclo que usaría cualquiera con un
navegador a mano. Se usó tanto para las piezas del
[experimento 3D](./3d-experiment.md) (el peón y el caballero geométricos)
como, con la misma técnica pero en 2D puro (sin necesidad de WebGL, solo
`PIL`/Pillow), para el [pixel art de las 12 piezas](./pixel-art-pieces.md)
del tablero real.

## Lo que esto NO resuelve

Esta técnica verifica **arte estático** — una imagen, una pieza, una
escena en un instante fijo. No reemplaza probar la app corriendo de
verdad: interacción, animaciones, sonido, y la experiencia completa en un
navegador real siguen sin poder confirmarse desde este entorno. El
[experimento 3D](./3d-experiment.md) en particular sigue teniendo esa
limitación para la escena INTERACTIVA completa (cámara, clics, resaltados
en contexto), aunque las piezas que la componen sí se vieron de verdad
antes de integrarlas.
