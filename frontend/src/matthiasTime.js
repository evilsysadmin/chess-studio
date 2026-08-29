function normalizedHour(hour) {
  const numeric = Number(hour);
  if (!Number.isFinite(numeric)) return 12;
  const wrapped = Math.trunc(numeric) % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

const SCENES = Object.freeze({
  morning: Object.freeze({
    key: 'morning-coffee',
    label: 'Café de campaña',
    greeting: 'Guten Morgen',
    loginText: 'Guten Morgen. Café fuerte, mente clara. A ver si hoy no regalas nada.',
  }),
  lunch: Object.freeze({
    key: 'lunch-bocata',
    label: 'Bocata táctico',
    greeting: 'Guten Tag',
    loginText: 'Guten Tag. Me pillas con el bocata. Tú juega; ya masticaré entre blunders.',
  }),
  afternoon: Object.freeze({
    key: 'afternoon-ops',
    label: 'En plena operación',
    greeting: 'Guten Tag',
    loginText: 'Guten Tag. En plena operación. Mantén la presión y procura no financiar al rival.',
  }),
  night: Object.freeze({
    key: 'night-coffee',
    label: 'Turno nocturno',
    greeting: 'Guten Abend',
    loginText: 'Guten Abend. Turno nocturno. Menos excusas, más cálculo.',
  }),
  sleep: Object.freeze({
    key: 'late-sleep',
    label: 'Sobando',
    greeting: 'Guten… was?',
    loginText: '¿Qué haces jugando a estas horas? Has despertado al alto mando. Ya que estamos, mueve bien.',
  }),
});

export function matthiasTimeScene(hour = new Date().getHours()) {
  const h = normalizedHour(hour);
  if (h >= 1 && h < 6) return SCENES.sleep;
  if (h >= 6 && h < 11) return SCENES.morning;
  if (h >= 11 && h < 15) return SCENES.lunch;
  if (h >= 15 && h < 20) return SCENES.afternoon;
  return SCENES.night;
}

export { normalizedHour as normalizeMatthiasHour };
