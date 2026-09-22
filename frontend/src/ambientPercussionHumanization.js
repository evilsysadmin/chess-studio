import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { stableThemeSeed } from './ambientStructuredArrangement.js';
import { structuredMasterTrim } from './ambientThemeProfile.js';

export function percussionHumanization(feel, localStep, code) {
  const period = Math.max(1, feel?.percussion?.period || 16);
  const pos = ((localStep % period) + period) % period;
  const half = Math.floor(period / 2);
  const seed = stableThemeSeed(`${feel?.family || 'legacy'}:${localStep}:${code}`);
  const signed = (shift) => (((seed >>> shift) % 2001) / 1000) - 1;
  const performance = feel?.percussion?.performance || {};
  const anchorVariance = Math.max(0, Math.min(0.12, Number(performance.anchorVariance) || 0.035));
  const secondaryVariance = Math.max(0.04, Math.min(0.32, Number(performance.secondaryVariance) || 0.18));
  const phraseLift = Math.max(0, Math.min(0.18, Number(performance.phraseLift) || 0.08));
  const stereoMotion = Math.max(0, Math.min(0.18, Number(performance.stereoMotion) || 0.08));

  const isAnchor = code === 'K' || code === 'S' || code === 'A';
  const isHat = code === 'H';
  const isTexture = code === 'B';
  const isFill = code === 'W' || code === 'M' || code === 'T';

  let accent = (pos === 0 ? 1.18 : pos === half ? 1.08 : 1) * structuredMasterTrim(feel);
  if (isHat) {
    // Los hats respiran alrededor del backbeat: acento reconocible, pero no una
    // fila de 16ths idénticos. No tocamos el reloj, sólo interpretación.
    accent *= pos % 4 === 0 ? 0.90 : pos % 2 === 0 ? 0.82 : 0.74;
  } else if (isTexture) {
    accent *= 0.86;
  } else if (isFill) {
    accent *= 0.94;
  }

  // Anclas clavadas; vida alrededor. Kick/snare conservan el grid y una
  // dinámica estrecha. Hats, brushes y fills reciben más timbre, panorama y
  // velocidad, de forma determinista para que una misma canción mantenga su
  // interpretación entre reproducciones.
  const variance = isAnchor ? anchorVariance : secondaryVariance;
  const microDynamics = 1 + (signed(5) * variance);
  const phrasePhase = period <= 1 ? 0 : pos / (period - 1);
  const lift = isAnchor ? 1 : 1 + (Math.max(0, phrasePhase - 0.55) / 0.45) * phraseLift;
  const toneRange = isAnchor ? 0.14 : isHat ? 0.58 : isTexture ? 0.72 : 0.42;
  const tone = signed(7) * toneRange;
  const decayRange = isAnchor ? 0.04 : isHat ? 0.16 : isTexture ? 0.22 : 0.14;
  const decay = 1 + (signed(9) * decayRange);
  const panRange = isAnchor ? stereoMotion * 0.20 : stereoMotion;
  const pan = signed(11) * panRange;

  // No inventamos golpes fantasma duplicados: las B/W/M/T ya son las
  // articulaciones secundarias escritas. La vida viene de dinámica, timbre,
  // decay y panorama, no de añadir un segundo ataque que pueda sonar a flam.
  const ghost = false;

  return {
    velocity: accent * microDynamics * lift * (feel?.percussion?.punch || 1),
    delayMs: 0,
    tone,
    decay: Math.max(0.72, Math.min(1.28, decay)),
    pan,
    ghost,
  };
}

export function getPercussionHumanizationPreview(themeId, localStep, code = 'K') {
  const theme = AMBIENT_THEMES[themeId];
  const feel = structuredFeel(theme);
  if (!theme || theme.engine !== 'structured' || !feel?.percussion) return null;
  return percussionHumanization(feel, Number(localStep) || 0, code);
}
