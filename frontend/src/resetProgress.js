// resetProgress.js — Un solo "empezar de cero" respaldado por la misma
// clasificación de claves que usa el perfil. Esto evita el bug clásico de
// añadir una feature con progreso nuevo, olvidar su reset y aun así dejar los
// tests verdes porque el test mantenía una segunda lista desactualizada.
//
// A propósito NO toca: sesión de login, partida activa ni preferencias de UI
// puras (audio/voz, tutoriales ya vistos y modo zen). Sí reinicia presets de
// despliegue y tema de tablero porque forman parte del progreso sincronizado.

import { clearProfileProgress } from './profileKeys.js';

export function resetAllProgress() {
  clearProfileProgress();
}
