export const HOME_CASTLE_LIGHTING = Object.freeze({
  dawn: Object.freeze({
    exposure: 1.02,
    ambient: 0.74,
    key: 0.34,
    keyColor: 0xffc995,
    fill: 0.18,
    fillColor: 0x9bb7d2,
    torch: 0.12,
  }),
  day: Object.freeze({
    exposure: 1.04,
    ambient: 0.84,
    key: 0.3,
    keyColor: 0xffe0b8,
    fill: 0.24,
    fillColor: 0xc9d9e4,
    torch: 0.08,
  }),
  dusk: Object.freeze({
    exposure: 0.98,
    ambient: 0.66,
    key: 0.28,
    keyColor: 0xffa45e,
    fill: 0.13,
    fillColor: 0x7d89b8,
    torch: 0.2,
  }),
  night: Object.freeze({
    exposure: 0.92,
    ambient: 0.54,
    key: 0.18,
    keyColor: 0x8da8d6,
    fill: 0.1,
    fillColor: 0x5d6c9e,
    torch: 0.28,
  }),
});

export function homeCastleLightingProfile(ambient) {
  return HOME_CASTLE_LIGHTING[ambient] || HOME_CASTLE_LIGHTING.day;
}
