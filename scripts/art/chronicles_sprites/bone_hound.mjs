// Bone hound — Chronicles 2.5D billboard sprite, MM3-flavoured.
// Hand-authored vector art (no image model): bold dark outline, cel-shaded
// bone, ember core. One 256×256 cell per frame; the renderer packs them.

const INK = '#1b110b';
const BONE = 'url(#bh-bone)';
const BONE_DARK = '#9c8258';
const BONE_LIGHT = '#fbf1d8';

function boneStroke(d, width, { shade = true } = {}) {
  return `
    <path d="${d}" fill="none" stroke="${INK}" stroke-width="${width + 5}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#e6d5ad" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>
    ${shade ? `<path d="${d}" fill="none" stroke="${BONE_DARK}" stroke-width="${Math.max(1.5, width * 0.35)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(1.6 1.8)" opacity=".75"/>` : ''}
    <path d="${d}" fill="none" stroke="${BONE_LIGHT}" stroke-width="${Math.max(1, width * 0.22)}" stroke-linecap="round" transform="translate(-1 -1.2)" opacity=".85"/>`;
}

function joint(x, y, r) {
  return `<circle cx="${x}" cy="${y}" r="${r + 2.5}" fill="${INK}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${BONE}"/>
    <circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="${BONE_LIGHT}" opacity=".8"/>`;
}

function paw(x, y, flip = 1) {
  return `<g transform="translate(${x} ${y}) scale(${flip} 1)">
    <path d="M-11 0 C-11 -7 11 -7 11 0 L13 4 L-13 4 Z" fill="${INK}"/>
    <path d="M-9 -1 C-8 -5 8 -5 9 -1 L10 2 L-10 2 Z" fill="${BONE}"/>
    <path d="M-12 4 l-3 4 M-5 4 l-2 5 M3 4 l1 5 M10 4 l3 4" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

function leg(points, width) {
  const [a, b, c] = points;
  const d = `M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]}`;
  return `${boneStroke(d, width)}${joint(b[0], b[1], width * 0.75)}`;
}

function ribs(breath) {
  const xs = [108, 122, 136, 150, 163];
  return xs.map((x, index) => {
    const drop = 54 - Math.abs(index - 1.6) * 6 + breath;
    const d = `M${x} 122 C${x - 15} ${132 + drop * 0.25} ${x - 13} ${122 + drop * 0.85} ${x + 3} ${122 + drop}`;
    return boneStroke(d, 6.2 - index * 0.35);
  }).join('');
}

function spine() {
  const d = 'M96 112 C120 104 150 108 172 116 C186 121 196 122 206 116 C216 110 226 98 234 84';
  const vertebrae = [[108, 109], [122, 106], [136, 107], [150, 109], [164, 113], [178, 118], [192, 120], [206, 116], [218, 106], [228, 94]]
    .map(([x, y], index) => `<ellipse cx="${x}" cy="${y - 4}" rx="${4.4 - index * 0.2}" ry="${5.6 - index * 0.25}" fill="${INK}"/>
      <ellipse cx="${x}" cy="${y - 4}" rx="${2.8 - index * 0.15}" ry="${3.8 - index * 0.2}" fill="#efe1bd"/>`).join('');
  return `${boneStroke(d, 7)}${vertebrae}`;
}

function pelvis() {
  return `<path d="M168 112 C182 104 200 108 204 120 C206 132 194 142 180 140 C170 138 164 126 168 112 Z" fill="${INK}"/>
    <path d="M171 115 C183 108 197 111 200 121 C201 130 192 137 181 135 C173 133 168 125 171 115 Z" fill="${BONE}"/>
    <ellipse cx="186" cy="123" rx="6" ry="5" fill="#2a1a10"/>`;
}

function wisps(phase) {
  // Ragged spectral fur clinging to the spine: silhouette and menace.
  const shift = Math.sin(phase) * 3;
  return `<g opacity=".7" fill="url(#bh-wisp)">
    <path d="M100 104 C110 ${84 + shift} 124 ${90 - shift} 132 ${82 + shift} C140 ${94 - shift} 152 ${86 + shift} 160 ${92 - shift} C170 ${84 + shift} 182 ${96 - shift} 194 ${100 + shift} C180 112 150 104 120 110 Z"/>
  </g>`;
}

function skull({ jaw = 4, eyes = 1 }) {
  return `
  <g id="skull">
    <!-- lower jaw, hinged near the back of the skull -->
    <g transform="rotate(${jaw} 96 104)">
      <path d="M96 100 C84 108 64 112 46 112 C40 112 36 116 40 120 C56 124 82 122 100 112 Z" fill="${INK}"/>
      <path d="M94 103 C82 109 64 112.5 48 113 C44 114 44 116 46 117.5 C60 119.5 82 117 96 108 Z" fill="${BONE}"/>
      <path d="M50 113 l3 -6 l3 6 M60 113 l3 -6 l3 6 M70 112 l3 -6 l2.5 5.5 M80 110 l2.5 -5 l2 4.5" fill="${BONE_LIGHT}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    </g>
    <!-- cranium and long snout, three-quarter toward the viewer -->
    <path d="M110 84 C110 64 92 56 76 60 C64 63 56 72 50 80 C42 84 30 88 28 96 C26 104 34 106 44 105 C62 104 82 106 98 104 C108 102 112 94 110 84 Z" fill="${INK}"/>
    <path d="M106 84 C106 68 92 61 78 64 C67 66 59 74 53 82 C46 86 35 90 33 96 C32 101 38 101.5 45 101 C62 100 82 102 96 100 C104 98 107 92 106 84 Z" fill="${BONE}"/>
    <path d="M80 64 C90 62 100 66 104 76" fill="none" stroke="${BONE_LIGHT}" stroke-width="3" stroke-linecap="round" opacity=".9"/>
    <path d="M40 98 C56 99 78 100 98 98" fill="none" stroke="${BONE_DARK}" stroke-width="2.4" opacity=".8"/>
    <!-- upper fangs -->
    <path d="M42 101 l2 8 l3 -8 M54 101 l2.5 9 l3 -9 M68 101.5 l2 7 l2.5 -7 M84 101 l2 6 l2 -6" fill="${BONE_LIGHT}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <!-- nasal cavity -->
    <path d="M30 92 C32 88 38 88 38 92 C37 95 32 96 30 92 Z" fill="${INK}"/>
    <!-- sockets with ember eyes -->
    <ellipse cx="74" cy="78" rx="10" ry="8.5" fill="${INK}"/>
    <ellipse cx="94" cy="76" rx="7.5" ry="7.5" fill="${INK}"/>
    <g opacity="${eyes}">
      <circle cx="74" cy="78" r="11" fill="url(#bh-eye-glow)"/>
      <circle cx="94" cy="76" r="9" fill="url(#bh-eye-glow)"/>
      <ellipse cx="74" cy="78" rx="4.2" ry="3.4" fill="#ffd27a"/>
      <ellipse cx="94" cy="76" rx="3.2" ry="3" fill="#ffd27a"/>
      <circle cx="75" cy="77" r="1.4" fill="#fffbe8"/>
    </g>
    <!-- brow ridge and a crack -->
    <path d="M62 70 C70 64 86 64 100 68" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M90 62 l-3 6 l4 3" fill="none" stroke="${INK}" stroke-width="1.6"/>
  </g>`;
}

export const BONE_HOUND_FRAMES = Object.freeze([
  { id: 'idle-a', head: [0, 0, 0], jaw: 4, glow: 0.75, breath: 0, crouch: 0, phase: 0 },
  { id: 'idle-b', head: [0, 2, -2], jaw: 2, glow: 0.55, breath: 2, crouch: 1, phase: 2.2 },
  { id: 'menace', head: [-10, 14, 14], jaw: 34, glow: 1, breath: -1, crouch: 9, phase: 4 },
  { id: 'hurt', head: [7, -5, -11], jaw: 14, glow: 0.25, breath: 1, crouch: -2, phase: 1, hurt: true },
]);

export function boneHoundFrame(frame) {
  const [hx, hy, hr] = frame.head;
  const c = frame.crouch;
  return `
  <defs>
    <linearGradient id="bh-bone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6ead0"/><stop offset=".6" stop-color="#dcc79c"/><stop offset="1" stop-color="#a98d60"/>
    </linearGradient>
    <radialGradient id="bh-core"><stop offset="0" stop-color="#ffcf6a"/><stop offset=".35" stop-color="#ff7a1e" stop-opacity=".85"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
    <radialGradient id="bh-eye-glow"><stop offset="0" stop-color="#ffb347"/><stop offset=".5" stop-color="#ff5a1f" stop-opacity=".6"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
    <linearGradient id="bh-wisp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a4a" stop-opacity="0"/><stop offset="1" stop-color="#2a1d34"/></linearGradient>
    <!-- hurt flash: push the figure itself toward hot red, never the cell -->
    <filter id="bh-hurt" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="1.25 .25 .1 0 .12  .1 .62 .05 0 0  .05 .05 .55 0 0  0 0 0 1 0"/>
    </filter>
  </defs>
  <ellipse cx="132" cy="238" rx="86" ry="10" fill="#000" opacity=".38"/>
  <g transform="translate(0 ${c})"${frame.hurt ? ' filter="url(#bh-hurt)"' : ''}>
    <!-- far legs, in shadow -->
    <g opacity=".82">
      ${leg([[178, 132], [194, 186 - c], [200, 232 - c]], 7)}
      ${leg([[112, 126], [128, 176 - c], [134, 232 - c]], 6.5)}
      ${paw(200, 232 - c)}${paw(134, 232 - c)}
    </g>
    <circle cx="140" cy="150" r="${44 + frame.glow * 10}" fill="url(#bh-core)" opacity="${frame.glow}"/>
    ${wisps(frame.phase)}
    ${spine()}
    ${ribs(frame.breath)}
    ${pelvis()}
    <!-- near legs, foreground -->
    ${leg([[160, 128], [168, 186 - c], [160, 232 - c]], 8)}
    ${leg([[98, 118], [88, 172 - c], [90, 232 - c]], 8.5)}
    ${paw(160, 232 - c, -1)}${paw(90, 232 - c, -1)}
    ${joint(98, 118, 7)}
    <g transform="translate(${hx} ${hy}) rotate(${hr} 100 100)">
      ${skull({ jaw: frame.jaw, eyes: frame.hurt ? 0.4 : 1 })}
    </g>
  </g>
`;
}
