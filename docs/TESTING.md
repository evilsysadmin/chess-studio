# Test strategy

La suite está separada por **señal**, no por fecha de incorporación. El objetivo
es que un fallo diga rápidamente qué capa se rompió y que ningún fichero Vitest
se ejecute dos veces en el quality gate normal.

## Frontend

| Capa | Comando | Qué protege |
| --- | --- | --- |
| Smoke | `make test-frontend-smoke` / `npm run test:smoke` | auth/API, invariantes, puzzles y núcleo Combat; falla rápido |
| Unit | `make test-frontend-unit` / `npm run test:unit` | lógica y comportamiento restante |
| Contract | `make test-frontend-contract` / `npm run test:contract` | wiring React/JSX/source que todavía no merece E2E |
| Todas | `make tests-fe` / `npm test` | smoke → unit → contract y build |

Los grupos se declaran en `scripts/frontend_test_groups.mjs`. `unit` se calcula
como el resto, así que un test nuevo entra automáticamente en unit salvo que se
promueva explícitamente a smoke o contract. `scripts/test_suite_audit.mjs`
comprueba que la partición sea completa y sin solapamientos.

## Backend

| Capa | Comando | Qué protege |
| --- | --- | --- |
| Smoke | `make test-backend-smoke` | motor e IA (`test_chess_ai.py`, `test_core_game.py`) |
| Integration/API | `make test-backend-integration` | resto de `test_*.py`, auth, API, servicios y persistencia |
| Todas | `make tests-be` | smoke → integration/API → `pip check` |

## Navegador e integración real

- `make e2e`: Playwright/Chromium para flujos de usuario reales; `e2e/package-lock.json` fija el runner y la instalación usa `npm ci`.
- `make e2e-combat-dom`: regresiones DOM específicas de Mesa de Guerra.
- `make compose-smoke`: nginx + FastAPI + Mongo + auth/perfil reales.
- `make release-gate`: tests + coverage informativo + security + imágenes + E2E.

## Tests históricos retirados al crear las capas

- `combatFreeze.test.js`: snapshot histórico redundante con campaign/deployment/session/tutorial tests actuales.
- `releaseContinuity.test.js`: contrato acumulativo de releases antiguas, duplicado por tests específicos y `release_consistency_check.mjs`.
- `combatRegressionContract.test.js`: duplicaba contratos actuales de Combat y casos Playwright reales.

No se elimina el comportamiento protegido: se elimina la **segunda copia del
mismo contrato**.
