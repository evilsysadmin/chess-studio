#!/usr/bin/env bash
set -euo pipefail

lane="${1:-}"
playwright=./node_modules/.bin/playwright

case "$lane" in
  regression)
    "$playwright" test regression-journeys.spec.js \
      --grep "sesión · dos contextos de navegador|deploy · una release nueva no fuerza reload|admin · presencia distingue|Matthias · saluda una vez tras login y no repite el saludo con F5|Home · el avatar residente de Matthias abre Así juegas|Matthias · el briefing persistente aparece antes de una partida rápida|Matthias · banco de personalidad Admin usa sólo datos sintéticos|Escuela de Matthias · el primer movimiento se aprende hands-on y persiste tras F5|Escuela de Matthias · el examen básico bloquea la promoción hasta aprobar" \
      --grep-invert "y cierra el loop jugar → entrenar → volver a jugar|entrenamiento → segunda observación real no sobreafirma mejora" \
      --workers=1 --retries=0 --timeout=75000
    ;;
  learning-golden)
    "$playwright" test learning-golden-path.spec.js --workers=1 --retries=0
    ;;
  learning-observation)
    "$playwright" test learning-second-observation.spec.js --workers=1 --retries=0
    ;;
  smoke)
    "$playwright" test smoke.spec.js \
      --grep "login → menú|Partida rápida · una partida activa|Torneo · una partida activa|Partida rápida · un 503 al restaurar|Combat Chess · Campaña permite jugar con defaults|Combat Chess · salir al menú conserva campaña" \
      --workers=1 --retries=0
    "$playwright" test mobile-final-interactions.spec.js --workers=1 --retries=0
    ;;
  *)
    echo "::error::Lane Playwright desconocida: ${lane:-<vacía>}" >&2
    exit 2
    ;;
esac
