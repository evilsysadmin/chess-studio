# Chess Studio v16.6dm43 — recovery pack

IMPORTANTE
==========
El ZIP binario original v16.6dm43 fue creado en el intérprete del chat anterior
y ese filesystem ya no existe en este chat. Este paquete NO pretende hacerse
pasar por aquel ZIP perdido.

Lo que sí conserva este paquete:
- La identificación del último estado trabajado: v16.6dm43.
- Un bootstrap para bajar la baseline pública actual del repo.
- El handoff técnico recuperado de dm41, dm42 y dm43.
- Un manifiesto sencillo para continuar sin perder el hilo.

Baseline pública localizada:
  https://github.com/evilsysadmin/chess-studio
En el momento de la recuperación, su README encabezaba v16.6dm40f.

Estado recuperado posterior a esa baseline
==========================================

v16.6dm41
- Hardening/ajuste del PATCH de perfil.
- Endpoint /ready separado del health básico.
- Mantener la semántica de disponibilidad real sin convertir /health en una
  comprobación pesada de dependencias.

v16.6dm42
- Extracción de persistencia/continuidad de Combat Chess fuera del componente
  de orquestación principal.
- Objetivo: reducir acoplamiento, conservar snapshots/restauración existentes
  y no cambiar reglas ni gameplay.

v16.6dm43
- Refactor estructural grande sin cambio intencionado de gameplay.
- Más lógica/componentes extraídos del bloque principal.
- CSS modularizado para reducir el monolito de estilos.
- Detector/gate de ciclos de imports añadido al preflight/CI.
- Se mantuvo el foco en deuda estructural, continuidad y tests, no en features.

Notas
=====
No se incluyen secretos, tokens ni credenciales.
No se inventan diffs que no han podido recuperarse del intérprete anterior.
