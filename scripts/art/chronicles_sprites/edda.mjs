// Edda, Rookwood's hooded villager — Chronicles 2.5D billboard sprite.
// Hand-authored vector art, MM3-flavoured: strong outline, flat painted
// planes, a warm lantern as the read-at-distance accent.

const INK = '#1a1009';

export const EDDA_FRAMES = Object.freeze([
  { id: 'idle-a', glow: 1, sway: 0, hand: 0 },
  { id: 'idle-b', glow: 0.78, sway: 1.2, hand: 1 },
  { id: 'speak', glow: 0.92, sway: -0.8, hand: 1, speak: true },
]);

export function eddaFrame(frame) {
  const s = frame.sway;
  return `
  <defs>
    <linearGradient id="ed-cloak" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7a6243"/><stop offset=".55" stop-color="#57432b"/><stop offset="1" stop-color="#33261a"/>
    </linearGradient>
    <linearGradient id="ed-shawl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b8443a"/><stop offset=".6" stop-color="#8e2f26"/><stop offset="1" stop-color="#5e1c17"/>
    </linearGradient>
    <linearGradient id="ed-skin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1cfa8"/><stop offset="1" stop-color="#c9946a"/>
    </linearGradient>
    <radialGradient id="ed-glow"><stop offset="0" stop-color="#ffe3a0"/><stop offset=".3" stop-color="#ffb04a" stop-opacity=".7"/><stop offset="1" stop-color="#ff8a1e" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="128" cy="240" rx="58" ry="9" fill="#000" opacity=".38"/>
  <circle cx="176" cy="164" r="${46 * frame.glow + 14}" fill="url(#ed-glow)" opacity="${0.75 * frame.glow}"/>
  <g transform="rotate(${s} 128 236)">
    <!-- cloak -->
    <path d="M100 96 C86 140 78 196 72 236 L184 236 C178 196 170 140 156 96 Z" fill="${INK}"/>
    <path d="M103 100 C90 142 83 196 78 232 L178 232 C173 196 166 142 153 100 Z" fill="url(#ed-cloak)"/>
    <path d="M118 120 C114 160 112 200 110 232 M140 118 C144 160 147 200 150 232" stroke="#2c2015" stroke-width="2.4" fill="none" opacity=".7"/>
    <path d="M84 222 l10 -6 l8 8 l10 -7 l9 8 l10 -7 l9 8 l10 -8 l9 8 l10 -7 l8 7" stroke="#2c2015" stroke-width="2" fill="none"/>
    <!-- shawl over the shoulders -->
    <path d="M94 98 C100 84 156 84 162 98 C170 116 160 130 128 136 C96 130 86 116 94 98 Z" fill="${INK}"/>
    <path d="M97 99 C103 88 153 88 159 99 C165 114 156 126 128 131 C100 126 91 114 97 99 Z" fill="url(#ed-shawl)"/>
    <path d="M106 104 C116 112 140 112 150 104" stroke="#d76a5a" stroke-width="2" fill="none" opacity=".8"/>
    <!-- hand clutching the shawl -->
    <ellipse cx="${118 + frame.hand}" cy="124" rx="7" ry="6" fill="${INK}"/>
    <ellipse cx="${118 + frame.hand}" cy="124" rx="5" ry="4.2" fill="url(#ed-skin)"/>
    <!-- hood and face -->
    <path d="M104 86 C100 54 156 54 152 86 C150 98 142 104 128 104 C114 104 106 98 104 86 Z" fill="${INK}"/>
    <path d="M107 85 C104 58 152 58 149 85 C147 95 140 100 128 100 C116 100 109 95 107 85 Z" fill="url(#ed-shawl)"/>
    <ellipse cx="128" cy="82" rx="14" ry="16.5" fill="${INK}"/>
    <ellipse cx="128" cy="82.5" rx="12" ry="14.5" fill="url(#ed-skin)"/>
    <path d="M116 72 C120 66 136 66 140 72 C136 69 120 69 116 72 Z" fill="#9a9086"/>
    <path d="M114 74 C116 68 122 66 126 67" stroke="#b9b0a4" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <!-- tired, grieving eyes and mouth -->
    <path d="M119 80 q3 -2 6 0 M131 80 q3 -2 6 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M120 84 q2.5 1.2 5 0 M132 84 q2.5 1.2 5 0" stroke="#a46e4e" stroke-width="1.2" fill="none" opacity=".8"/>
    <path d="M128 84 l-2 6 l3 1" stroke="#9b6747" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    ${frame.speak
      ? '<ellipse cx="128" cy="93.5" rx="3.4" ry="2.4" fill="#5b2b22"/>'
      : '<path d="M123 93 q5 -2 10 0" stroke="#5b2b22" stroke-width="2" fill="none" stroke-linecap="round"/>'}
    <!-- lantern arm -->
    <path d="M150 112 C162 124 168 136 170 148" stroke="${INK}" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M150 112 C161 124 166 136 168 147" stroke="#5f4a31" stroke-width="8.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="170" cy="150" rx="6.5" ry="6" fill="${INK}"/>
    <ellipse cx="170" cy="150" rx="4.6" ry="4.2" fill="url(#ed-skin)"/>
    <!-- lantern -->
    <path d="M170 154 L170 160" stroke="${INK}" stroke-width="2.5"/>
    <path d="M162 160 L178 160 L182 168 L182 186 L158 186 L158 168 Z" fill="${INK}"/>
    <rect x="161.5" y="168" width="17" height="15" fill="#ffd98a"/>
    <rect x="161.5" y="168" width="17" height="15" fill="#ffefb8" opacity="${0.45 * frame.glow}"/>
    <path d="M170 170 C166 176 168 180 170 181 C172 180 174 176 170 170 Z" fill="#ff8a2a" opacity="${frame.glow}"/>
    <path d="M161.5 175.5 L178.5 175.5 M170 168 L170 183" stroke="${INK}" stroke-width="1.6"/>
    <path d="M160 160 L170 152 L180 160 Z" fill="#3a2a1c" stroke="${INK}" stroke-width="2"/>
  </g>`;
}
