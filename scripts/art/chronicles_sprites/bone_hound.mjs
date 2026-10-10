// Bone hound — Chronicles 2.5D billboard sprite, MM3-flavoured (v2).
// Hand-authored vector art: wolf skull with a heavy fang, scapula and a
// sternum-closed ribcage, zig-zag hind legs, hooked claws and an ember mane
// that flares with its mood. One 256×256 cell per frame.
import { INK, bone, knob, paintFilter } from './common.mjs';

function emberMane(phase, flare) {
  // Flame tongues rising from the dorsal spines, neck to mid-back.
  const roots = [[104, 104], [116, 100], [128, 99], [140, 100], [152, 103], [164, 107]];
  return roots.map(([x, y], index) => {
    const sway = Math.sin(phase + index * 1.3) * 4;
    const height = (16 + (index % 3) * 6) * flare;
    const tip = `${x - 6 + sway} ${y - height}`;
    return `<path d="M${x - 7} ${y + 2} C${x - 9} ${y - height * 0.45} ${x - 2 + sway} ${y - height * 0.7} ${tip} C${x + 3 + sway * 0.5} ${y - height * 0.6} ${x + 8} ${y - height * 0.35} ${x + 7} ${y + 2} Z" fill="url(#bh-flame)" opacity=".92"/>`;
  }).join('');
}

function spine() {
  const path = 'M100 110 C122 101 150 103 172 112 C186 118 198 119 208 114';
  const processes = [[112, 104], [124, 101], [136, 101], [148, 103], [160, 107], [172, 111], [186, 115], [198, 115]]
    .map(([x, y], index) => {
      const h = 9 - index * 0.6;
      return `<path d="M${x - 3.5} ${y + 1} L${x - 1} ${y - h} L${x + 3.5} ${y + 1} Z" fill="url(#bone-fill)" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
    }).join('');
  return `${bone(path, 7.5)}${processes}`;
}

function tail(phase) {
  const sway = Math.sin(phase) * 5;
  const d = `M206 114 C216 108 224 ${98 + sway * 0.3} 230 ${86 + sway} C234 ${78 + sway} 238 ${72 + sway} 241 ${66 + sway}`;
  const beads = [[214, 110], [222, 102 + sway * 0.3], [229, 90 + sway * 0.7], [236, 77 + sway]]
    .map(([x, y], index) => knob(x, y, 3.4 - index * 0.5)).join('');
  return `${bone(d, 4.4)}${beads}
    <circle cx="${241}" cy="${64 + sway}" r="7" fill="url(#bh-ember)" opacity=".9"/>`;
}

function ribcage(breath, glow) {
  const ribs = [108, 120, 132, 144, 156, 167].map((x, index) => {
    const depth = 56 - Math.abs(index - 1.8) * 6 + breath;
    const d = `M${x} 116 C${x - 16} ${126 + depth * 0.2} ${x - 15} ${118 + depth * 0.8} ${x + 2} ${116 + depth}`;
    return bone(d, 6 - index * 0.35);
  }).join('');
  const sternum = `M104 ${170 + breath} C120 ${176 + breath} 146 ${174 + breath} 168 ${162 + breath}`;
  return `<ellipse cx="138" cy="${146 + breath * 0.5}" rx="${30 + glow * 6}" ry="${24 + glow * 5}" fill="url(#bh-core)" opacity="${0.35 + glow * 0.65}"/>
    ${ribs}${bone(sternum, 4.2)}`;
}

function scapula() {
  return `<path d="M96 112 L124 104 L114 146 Z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M99 113 L120 107 L112 140 Z" fill="url(#bone-fill)"/>
    <path d="M102 114 L118 109" stroke="#fff6dc" stroke-width="2" opacity=".8"/>
    <path d="M108 112 L113 136" stroke="#957a4e" stroke-width="2" opacity=".7"/>`;
}

function pelvis() {
  return `<path d="M170 106 C184 98 204 104 208 118 C210 132 196 142 182 140 C170 138 164 122 170 106 Z" fill="${INK}"/>
    <path d="M173 109 C185 102 201 107 204 119 C205 129 194 136 182 135 C174 133 168 121 173 109 Z" fill="url(#bone-fill)"/>
    <ellipse cx="188" cy="122" rx="6.5" ry="5.5" fill="#2a170c"/>
    <path d="M176 108 C186 104 196 106 202 112" stroke="#fff6dc" stroke-width="2" fill="none" opacity=".8"/>`;
}

function claws(x, y, flip = 1) {
  const toes = [-9, -3, 3, 9].map((dx, index) => {
    const tx = x + dx * flip;
    return `<path d="M${tx} ${y - 3} C${tx - 2 * flip} ${y + 1} ${tx - 4 * flip} ${y + 3} ${tx - 7 * flip} ${y + 6}" stroke="${INK}" stroke-width="${index === 0 ? 3.2 : 2.6}" fill="none" stroke-linecap="round"/>`;
  }).join('');
  return `<path d="M${x - 12} ${y} C${x - 12} ${y - 8} ${x + 12} ${y - 8} ${x + 12} ${y} L${x + 13} ${y + 2} L${x - 13} ${y + 2} Z" fill="${INK}"/>
    <path d="M${x - 10} ${y - 1} C${x - 9} ${y - 6} ${x + 9} ${y - 6} ${x + 10} ${y - 1} Z" fill="url(#bone-fill)"/>
    ${toes}`;
}

function frontLeg(x, top, crouch, width) {
  const elbow = [x - 10, 168 - crouch];
  const wrist = [x - 3, 204 - crouch * 0.5];
  const foot = [x - 8, 230];
  const d = `M${x} ${top} L${elbow[0]} ${elbow[1]} L${wrist[0]} ${wrist[1]} L${foot[0]} ${foot[1]}`;
  return `${bone(d, width)}${knob(elbow[0], elbow[1], width * 0.7)}${knob(wrist[0], wrist[1], width * 0.55)}${claws(foot[0], foot[1], 1)}`;
}

function hindLeg(x, top, crouch, width) {
  const knee = [x + 14, 166 - crouch];
  const hock = [x - 2, 198 - crouch * 0.6];
  const foot = [x + 6, 230];
  const d = `M${x} ${top} L${knee[0]} ${knee[1]} L${hock[0]} ${hock[1]} L${foot[0]} ${foot[1]}`;
  return `${bone(d, width)}${knob(knee[0], knee[1], width * 0.75)}${knob(hock[0], hock[1], width * 0.55)}${claws(foot[0], foot[1], 1)}`;
}

function skull({ jaw, eyes }) {
  return `
    <!-- lower jaw, hinged under the ear -->
    <g transform="rotate(${jaw} 98 104)">
      <path d="M100 100 C86 110 62 114 40 113 C33 113 30 118 35 121 C56 126 86 122 104 110 Z" fill="${INK}"/>
      <path d="M97 103 C84 111 62 115 42 115 C38 116 38 118 41 119 C58 122 84 118 99 108 Z" fill="url(#bone-fill)"/>
      <path d="M44 115 l2.5 -7 l3 7 M56 115 l2.5 -8 l3 8 M68 114 l2 -6 l2.5 6 M80 112 l2 -5 l2 4.5" fill="#fff6dc" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M90 108 l1 -11 l5 11" fill="#fff6dc" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    </g>
    <!-- cranium with sagittal crest and long muzzle -->
    <path d="M114 86 C116 62 96 50 78 54 C66 57 58 66 52 76 C42 80 26 86 23 95 C21 103 30 106 42 105 C62 104 84 106 100 104 C111 102 114 96 114 86 Z" fill="${INK}"/>
    <path d="M110 86 C111 66 95 56 80 58 C69 60 61 68 55 78 C46 82 31 88 28 95 C27 100 34 101 42 101 C62 100 84 102 98 100 C107 98 110 93 110 86 Z" fill="url(#bone-fill)"/>
    <path d="M80 57 C94 53 108 62 110 76" fill="none" stroke="#fff6dc" stroke-width="3" stroke-linecap="round" opacity=".9"/>
    <path d="M70 60 C84 54 102 56 112 68" fill="none" stroke="${INK}" stroke-width="2.4" opacity=".7"/>
    <path d="M52 90 C66 86 86 88 104 92" fill="none" stroke="#957a4e" stroke-width="3" opacity=".75"/>
    <path d="M36 98 C56 99 78 100 98 98" fill="none" stroke="#957a4e" stroke-width="2.2" opacity=".75"/>
    <!-- upper teeth and the big canine -->
    <path d="M36 100 l2 7 l3 -7 M48 100.5 l2.5 8 l3 -8 M62 101 l2 6 l2.5 -6 M76 101 l2 5 l2 -5" fill="#fff6dc" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M86 100 C87 108 89 116 91 121 C93 114 95 106 96 100 Z" fill="#fff6dc" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <!-- nose -->
    <path d="M24 90 C26 86 33 86 33 91 C32 94 26 95 24 90 Z" fill="${INK}"/>
    <!-- deep orbit with ember eye -->
    <path d="M64 70 C70 62 86 62 92 70 C92 80 82 86 74 85 C66 84 62 78 64 70 Z" fill="${INK}"/>
    <g opacity="${eyes}">
      <circle cx="78" cy="75" r="14" fill="url(#bh-ember)"/>
      <ellipse cx="78" cy="75" rx="5.5" ry="4.2" fill="#ffd27a"/>
      <ellipse cx="78" cy="75" rx="2.2" ry="3.4" fill="#fffbe8"/>
    </g>
    <path d="M60 66 C70 58 88 58 98 64" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M96 58 l-4 7 l5 4" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
}

export const BONE_HOUND_FRAMES = Object.freeze([
  { id: 'idle-a', head: [0, 0, 0], jaw: 4, glow: 0.7, breath: 0, crouch: 0, phase: 0, flare: 0.9, lunge: 0 },
  { id: 'idle-b', head: [0, 2, -2], jaw: 2, glow: 0.5, breath: 2, crouch: 1, phase: 2.2, flare: 0.75, lunge: 0 },
  { id: 'menace', head: [-8, 15, 15], jaw: 30, glow: 1, breath: -1, crouch: 10, phase: 4, flare: 1.25, lunge: 0 },
  { id: 'attack', head: [-22, 8, 6], jaw: 42, glow: 1, breath: -2, crouch: 6, phase: 5.1, flare: 1.4, lunge: -10 },
  { id: 'hurt', head: [8, -6, -12], jaw: 16, glow: 0.2, breath: 1, crouch: -2, phase: 1, flare: 0.4, lunge: 6, hurt: true },
  { id: 'dead', dead: true },
]);

function bonePile() {
  // Collapsed remains: the ember is out, the skull rests on the ribs.
  return `
    <ellipse cx="130" cy="236" rx="80" ry="9" fill="#000" opacity=".35"/>
    ${bone('M44 228 L104 232', 6)}${bone('M112 233 L170 228', 6)}${bone('M60 220 L126 214', 5)}
    ${[58, 72, 86, 100, 114].map((x) => bone(`M${x} 224 C${x - 8} 206 ${x + 6} 196 ${x + 14} 204`, 4.2)).join('')}
    ${bone('M120 222 C140 212 160 210 176 216', 5)}
    <circle cx="96" cy="214" r="10" fill="url(#bh-ember)" opacity=".35"/>
    <g transform="translate(112 128) rotate(-10 90 90) scale(.82)">
      <path d="M110 86 C111 66 95 56 80 58 C69 60 61 68 55 78 C46 82 31 88 28 95 C27 100 34 101 42 101 C62 100 84 102 98 100 C107 98 110 93 110 86 Z" fill="url(#bone-fill)" stroke="${INK}" stroke-width="4"/>
      <path d="M64 70 C70 62 86 62 92 70 C92 80 82 86 74 85 C66 84 62 78 64 70 Z" fill="${INK}"/>
      <path d="M86 100 C87 108 89 116 91 121 C93 114 95 106 96 100 Z" fill="#fff6dc" stroke="${INK}" stroke-width="2"/>
    </g>
    <path d="M60 230 q8 -10 18 -2 M196 228 q8 -9 16 0" stroke="#5b4a3a" stroke-width="3" fill="none" opacity=".6"/>`;
}

export function boneHoundFrame(frame, { bands = 0 } = {}) {
  const defs = `
  <defs>
    <linearGradient id="bone-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f8edd2"/><stop offset=".55" stop-color="#dcc699"/><stop offset="1" stop-color="#a1845a"/>
    </linearGradient>
    <radialGradient id="bh-core"><stop offset="0" stop-color="#ffd27a"/><stop offset=".35" stop-color="#ff7a1e" stop-opacity=".85"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
    <radialGradient id="bh-ember"><stop offset="0" stop-color="#ffcf6a"/><stop offset=".45" stop-color="#ff5a1f" stop-opacity=".7"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
    <linearGradient id="bh-flame" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#7a1406"/><stop offset=".35" stop-color="#e2470f"/><stop offset=".75" stop-color="#ffa02a"/><stop offset="1" stop-color="#ffe7a0"/>
    </linearGradient>
    <filter id="bh-hurt" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="1.25 .25 .1 0 .12  .1 .62 .05 0 0  .05 .05 .55 0 0  0 0 0 1 0"/>
    </filter>
    ${paintFilter('bh-paint', { bands, seed: 11 })}
  </defs>`;
  if (frame.dead) return `${defs}<g filter="url(#bh-paint)">${bonePile()}</g>`;
  const [hx, hy, hr] = frame.head;
  const c = frame.crouch;
  const lunge = frame.lunge || 0;
  return `${defs}
  <ellipse cx="${134 + lunge}" cy="238" rx="88" ry="10" fill="#000" opacity=".38"/>
  <g filter="url(#bh-paint)">
  <g transform="translate(${lunge} ${c * 0.4})"${frame.hurt ? ' filter="url(#bh-hurt)"' : ''}>
    <g opacity=".78">
      ${hindLeg(196, 124, c, 6.5)}
      ${frontLeg(126, 120, c, 6)}
    </g>
    ${emberMane(frame.phase, frame.flare)}
    ${tail(frame.phase)}
    ${spine()}
    ${ribcage(frame.breath, frame.glow)}
    ${pelvis()}
    ${hindLeg(182, 128, c, 8)}
    ${scapula()}
    ${frontLeg(108, 126, c, 8.5)}
    ${knob(108, 124, 6.5)}
    <g transform="translate(${hx} ${hy}) rotate(${hr} 104 100)">
      ${skull({ jaw: frame.jaw, eyes: frame.hurt ? 0.35 : 1 })}
    </g>
  </g>
  </g>
  <!-- emissive light sits on top of the lit body: embers never get shaded -->
  <g transform="translate(${lunge} ${c * 0.4})" style="mix-blend-mode:screen">
    <ellipse cx="138" cy="${146 + frame.breath * 0.5}" rx="${26 + frame.glow * 6}" ry="${20 + frame.glow * 5}" fill="url(#bh-core)" opacity="${0.15 + frame.glow * 0.45}"/>
    <g transform="translate(${hx} ${hy}) rotate(${hr} 104 100)"><circle cx="78" cy="75" r="9" fill="url(#bh-ember)" opacity="${frame.hurt ? 0.2 : 0.75}"/></g>
    ${emberMane(frame.phase, frame.flare).replace(/opacity=".92"/g, 'opacity=".45"')}
  </g>`;
}
