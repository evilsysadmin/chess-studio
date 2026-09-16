export const FILES = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
export const DISPLAY_RANKS = Object.freeze(['8', '7', '6', '5', '4', '3', '2', '1']);

// Desktop and mobile both use a longer virtual lens than the historical 40°
// camera. On phones the old wide-angle view exaggerated near/far piece scale
// and made the front rank dominate the room. Mobile keeps its own framing
// profile, but now uses a restrained 34° lens so the castle reads as a scene
// instead of a board with a decorative strip glued behind it.
export const BOARD3D_CAMERA_FOV = Object.freeze({
  wide: 22,
  compact: 32,
  mobile: 34,
});

export function resolveBoard3DCameraFov(aspect, { mobile = false } = {}) {
  if (mobile) return BOARD3D_CAMERA_FOV.mobile;
  const safeAspect = Math.max(0.35, Number(aspect) || 1);
  return safeAspect >= 1.42 ? BOARD3D_CAMERA_FOV.wide : BOARD3D_CAMERA_FOV.compact;
}

export const BOARD_THEME_3D = Object.freeze({
  // Canonical War Room: warm limestone against deeper walnut. The previous
  // palette compressed both values into the same mid-range once ACES and the
  // practical lights were applied, so expensive material work barely read at
  // gameplay distance. Keep the warm identity, but give the board a deliberate
  // value/chroma hierarchy that survives the final render.
  classic: { light: 0xc2ad91, dark: 0x50372c, frame: 0x271710, felt: 0x0d1219, glow: 0xd1a844 },
  midnight: { light: 0xaab2bd, dark: 0x263244, frame: 0x111824, felt: 0x080d16, glow: 0x6f9fc5 },
  blood: { light: 0xc9b5a6, dark: 0x5d2926, frame: 0x2b1515, felt: 0x12090a, glow: 0xb4483a },
  royal: { light: 0xd8c990, dark: 0x493564, frame: 0x221b32, felt: 0x0d0b15, glow: 0xe0b84e },
  forensic: { light: 0xc6d2ce, dark: 0x40515a, frame: 0x1c262b, felt: 0x0a1013, glow: 0x63c0ba },
  obsidian: { light: 0xb5b0a8, dark: 0x202225, frame: 0x0c0d0f, felt: 0x050607, glow: 0xc7a34a },
  // Combat Campaign used these ids already in the 2D board. Keep the same
  // public ids in Three.js so changing renderer never changes the battlefield.
  'combat-jungle': { light: 0xb9bea6, dark: 0x354738, frame: 0x1c281d, felt: 0x09110c, glow: 0x86a968 },
  'combat-urban': { light: 0xb9bab6, dark: 0x3b4145, frame: 0x202529, felt: 0x0a0d0f, glow: 0xb4a06c },
  'combat-desert': { light: 0xd5c39c, dark: 0x765436, frame: 0x3b291b, felt: 0x171008, glow: 0xd6a05b },
  'combat-citadel': { light: 0xc7c9ca, dark: 0x34383d, frame: 0x171a1e, felt: 0x080a0d, glow: 0xbda76b },
});

export function resolveBoard3DThemeId(candidate, fallback = 'classic') {
  const requested = String(candidate || '').trim();
  if (requested && BOARD_THEME_3D[requested]) return requested;
  const fallbackId = String(fallback || '').trim();
  return BOARD_THEME_3D[fallbackId] ? fallbackId : 'classic';
}

export const SKIN_3D = Object.freeze({
  default: {
    // The legacy/default palette used to land almost exactly on the light-square
    // luminance after ACES + room lighting. Keep it recognisably warm, but give the
    // piece body a real value gap so silhouettes survive on cream squares.
    white: 0xd0b37e, black: 0x2b2d31, whiteAccent: 0xb68a38, blackAccent: 0x9b342f,
    metalness: 0.18, roughness: 0.62, emissive: 0x000000, emissiveIntensity: 0,
  },
  studio: {
    // Canonical War Room finish. Treat the black body as lacquered ebony rather
    // than dark metal: very low base metalness lets the strong clearcoat/specular
    // layer describe the polished surface instead of flattening it into plastic.
    // Ivory moves a little cleaner and lighter, while still staying warm under ACES.
    white: 0xdac7a2, black: 0x15181c, whiteAccent: 0xd0a64e, blackAccent: 0xa83f36,
    metalness: 0.06, roughness: 0.42, emissive: 0x000000, emissiveIntensity: 0,
  },
  regimiento: {
    white: 0xf2e1bd, black: 0x313238, whiteAccent: 0xc79b43, blackAccent: 0xa62e2a,
    metalness: 0.44, roughness: 0.38, emissive: 0x000000, emissiveIntensity: 0,
  },
  azul: {
    white: 0xd8e2e8, black: 0x1f3344, whiteAccent: 0x6f9fc5, blackAccent: 0x366c94,
    metalness: 0.32, roughness: 0.44, emissive: 0x000000, emissiveIntensity: 0,
  },
  shogunate: {
    white: 0xe9e0cf, black: 0x162236, whiteAccent: 0xc33d45, blackAccent: 0x305ea8,
    metalness: 0.5, roughness: 0.32, emissive: 0x142f70, emissiveIntensity: 0.12,
  },
  esmeralda: {
    white: 0xd9dcc9, black: 0x23372e, whiteAccent: 0x759b68, blackAccent: 0x36634d,
    metalness: 0.28, roughness: 0.5, emissive: 0x000000, emissiveIntensity: 0,
  },
  cyber: {
    white: 0xcbd6df, black: 0x151b23, whiteAccent: 0x53b7d8, blackAccent: 0x7f3dcc,
    metalness: 0.72, roughness: 0.24, emissive: 0x297ea7, emissiveIntensity: 0.18,
  },
  marines: {
    white: 0xc9c5ad, black: 0x2d352f, whiteAccent: 0x9f8b52, blackAccent: 0x526b4e,
    metalness: 0.34, roughness: 0.64, emissive: 0x000000, emissiveIntensity: 0,
  },
  delta: {
    white: 0xbfc2c3, black: 0x151718, whiteAccent: 0x922c2a, blackAccent: 0x721f20,
    metalness: 0.5, roughness: 0.34, emissive: 0x641414, emissiveIntensity: 0.12,
  },
});