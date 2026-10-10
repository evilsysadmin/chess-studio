// Edda, Rookwood's grieving villager — Chronicles 2.5D billboard (v2).
// Hand-authored vector art: hooded shawl, patched cloak with linen apron,
// a wooden name tag on a cord (the quest's motif) and a lantern that rim-
// lights her right side. Frames: idle ×2, speak, grateful.
import { INK, paintFilter } from './common.mjs';

export const EDDA_FRAMES = Object.freeze([
  { id: 'idle-a', glow: 1, sway: 0, mood: 'grief' },
  { id: 'idle-b', glow: 0.8, sway: 1.1, mood: 'grief', breath: 1 },
  { id: 'speak', glow: 0.92, sway: -0.8, mood: 'speak', raise: true },
  { id: 'grateful', glow: 1, sway: 0.4, mood: 'grateful', tag: true },
]);

function face(mood) {
  const eyes = mood === 'grateful'
    ? '<path d="M118 83 q4 3 8 0 M131 83 q4 3 8 0" stroke="#3b2418" stroke-width="2" fill="none" stroke-linecap="round"/>'
    : `<path d="M117 81 q4.5 -3 9 0" stroke="#3b2418" stroke-width="2" fill="none" stroke-linecap="round"/>
       <path d="M130 81 q4.5 -3 9 0" stroke="#3b2418" stroke-width="2" fill="none" stroke-linecap="round"/>
       <ellipse cx="121.5" cy="83" rx="2.2" ry="1.8" fill="#3b2418"/><ellipse cx="134.5" cy="83" rx="2.2" ry="1.8" fill="#3b2418"/>
       <path d="M117 76 q4 -3 9 -1 M131 75 q5 -2 9 1" stroke="#8a7f74" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const mouth = {
    grief: '<path d="M122 98 q6 -2.5 12 0" stroke="#6b3226" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
    speak: '<path d="M123 96 q5 -1.5 10 0 q-1 5 -5 5 q-4 0 -5 -5 Z" fill="#5b2318" stroke="#3b1a12" stroke-width="1.2"/>',
    grateful: '<path d="M122 96 q6 4 12 0" stroke="#6b3226" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  }[mood];
  return `
    <ellipse cx="128" cy="86" rx="15.5" ry="18.5" fill="${INK}"/>
    <ellipse cx="128" cy="86.5" rx="13.5" ry="16.5" fill="url(#ed-skin)"/>
    <path d="M116 92 C118 100 124 104 128 104 C132 104 138 100 140 92 C136 98 132 100 128 100 C124 100 120 98 116 92 Z" fill="#b97a55" opacity=".55"/>
    <path d="M139 80 C141 88 140 96 136 101" stroke="#ffd9a0" stroke-width="2" fill="none" opacity=".55"/>
    <!-- grey hair escaping the hood -->
    <path d="M114 78 C114 68 122 64 130 65 C136 66 142 70 142 78 C138 72 134 70 128 70 C122 70 117 73 114 78 Z" fill="#a39b91"/>
    <path d="M116 74 C120 68 128 67 134 69 M118 78 C121 72 127 70 131 71" stroke="#d6cfc4" stroke-width="1.4" fill="none"/>
    <path d="M113 80 C110 88 112 96 114 100" stroke="#a39b91" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    ${eyes}
    <!-- nose and the lines grief leaves -->
    <path d="M128 85 C127 89 126 92 128 94 C129 94.5 130.5 94 131 93" stroke="#8d5a3e" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <path d="M119 92 q-1 3 1 5 M138 92 q1 3 -1 5" stroke="#a46e4e" stroke-width="1.2" fill="none" opacity=".75"/>
    ${mouth}`;
}

function lanternGlow(glow, x, y) {
  return `<circle cx="${x}" cy="${y + 16}" r="${42 * glow + 18}" fill="url(#ed-glow)" opacity="${0.8 * glow}"/>`;
}

function lantern(glow, x, y) {
  return `
    <path d="M${x} ${y - 6} L${x} ${y + 1}" stroke="${INK}" stroke-width="2.6"/>
    <path d="M${x - 9} ${y + 1} L${x + 9} ${y + 1} L${x + 13} ${y + 10} L${x + 13} ${y + 30} L${x - 13} ${y + 30} L${x - 13} ${y + 10} Z" fill="${INK}"/>
    <rect x="${x - 10}" y="${y + 10}" width="20" height="17" fill="#ffd98a"/>
    <rect x="${x - 10}" y="${y + 10}" width="20" height="17" fill="#fff3c4" opacity="${0.5 * glow}"/>
    <path d="M${x} ${y + 12} C${x - 5} ${y + 19} ${x - 2} ${y + 24} ${x} ${y + 25} C${x + 2} ${y + 24} ${x + 5} ${y + 19} ${x} ${y + 12} Z" fill="#ff8a2a" opacity="${glow}"/>
    <path d="M${x - 10} ${y + 18.5} L${x + 10} ${y + 18.5} M${x} ${y + 10} L${x} ${y + 27}" stroke="${INK}" stroke-width="1.6"/>
    <path d="M${x - 11} ${y + 1} L${x} ${y - 8} L${x + 11} ${y + 1} Z" fill="#3a2a1c" stroke="${INK}" stroke-width="2"/>
    <path d="M${x - 13} ${y + 30} L${x + 13} ${y + 30} L${x + 11} ${y + 34} L${x - 11} ${y + 34} Z" fill="#3a2a1c" stroke="${INK}" stroke-width="1.6"/>`;
}

function hand(x, y, { open = false } = {}) {
  return open
    ? `<path d="M${x - 7} ${y + 6} C${x - 9} ${y - 2} ${x - 6} ${y - 12} ${x - 3} ${y - 12} C${x - 1} ${y - 15} ${x + 2} ${y - 15} ${x + 3} ${y - 11} C${x + 6} ${y - 12} ${x + 8} ${y - 8} ${x + 7} ${y - 3} C${x + 9} ${y} ${x + 8} ${y + 5} ${x + 5} ${y + 7} Z" fill="url(#ed-skin)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
       <path d="M${x - 2} ${y - 9} L${x - 2} ${y - 2} M${x + 2} ${y - 10} L${x + 2} ${y - 3}" stroke="#a46e4e" stroke-width="1.2"/>`
    : `<ellipse cx="${x}" cy="${y}" rx="7.5" ry="6.5" fill="${INK}"/><ellipse cx="${x}" cy="${y}" rx="5.5" ry="4.6" fill="url(#ed-skin)"/>
       <path d="M${x - 3} ${y - 2} l0 3 M${x} ${y - 3} l0 3 M${x + 3} ${y - 2} l0 3" stroke="#a46e4e" stroke-width="1"/>`;
}

export function eddaFrame(frame, { bands = 0 } = {}) {
  const s = frame.sway;
  const b = frame.breath || 0;
  return `
  <defs>
    <linearGradient id="ed-cloak" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2e2318"/><stop offset=".5" stop-color="#5a4630"/><stop offset=".85" stop-color="#7b6040"/><stop offset="1" stop-color="#a77c46"/>
    </linearGradient>
    <linearGradient id="ed-shawl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c24c3e"/><stop offset=".55" stop-color="#8e2f26"/><stop offset="1" stop-color="#4e1712"/>
    </linearGradient>
    <linearGradient id="ed-apron" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cdbf9e"/><stop offset="1" stop-color="#8f8166"/>
    </linearGradient>
    <linearGradient id="ed-skin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3d3ad"/><stop offset="1" stop-color="#c58d63"/>
    </linearGradient>
    <radialGradient id="ed-glow"><stop offset="0" stop-color="#ffe3a0"/><stop offset=".3" stop-color="#ffb04a" stop-opacity=".7"/><stop offset="1" stop-color="#ff8a1e" stop-opacity="0"/></radialGradient>
    ${paintFilter('ed-paint', { bands, seed: 23, relief: 2.8, sheen: 0.12, saturation: 1.35 })}
  </defs>
  <ellipse cx="128" cy="241" rx="60" ry="9" fill="#000" opacity=".38"/>
  <g transform="rotate(${s} 128 236)">${lanternGlow(frame.glow, 173, 160)}</g>
  <g filter="url(#ed-paint)">
  <g transform="rotate(${s} 128 236)">
    <!-- cloak -->
    <path d="M98 100 C84 144 76 198 70 238 L186 238 C180 198 172 144 158 100 Z" fill="${INK}"/>
    <path d="M101 104 C88 146 81 198 76 234 L180 234 C175 198 168 146 155 104 Z" fill="url(#ed-cloak)"/>
    <path d="M110 128 C104 170 100 206 98 234 M146 126 C152 168 156 204 160 234 M124 140 C122 180 121 210 120 234" stroke="#24190f" stroke-width="2.6" fill="none" opacity=".75"/>
    <path d="M160 130 C166 170 172 204 176 232" stroke="#ffb860" stroke-width="2.4" fill="none" opacity=".55"/>
    <path d="M150 196 l12 -2 l2 12 l-12 2 Z" fill="#6e5636" stroke="#24190f" stroke-width="1.6"/>
    <path d="M152 198 l8 8 M160 197 l-7 8" stroke="#24190f" stroke-width="1"/>
    <path d="M80 226 l9 -6 l8 8 l10 -7 l9 8 l10 -7 l9 8 l10 -8 l9 8 l10 -7 l9 7" stroke="#24190f" stroke-width="2" fill="none"/>
    <!-- linen apron -->
    <path d="M110 136 C106 170 106 200 108 226 L148 226 C150 200 150 170 146 136 Z" fill="${INK}"/>
    <path d="M112.5 139 C109 172 109 200 111 223 L145 223 C147 200 147 172 143.5 139 Z" fill="url(#ed-apron)"/>
    <path d="M118 150 C117 180 117 204 118 222 M134 150 C135 180 136 204 137 222" stroke="#8f8166" stroke-width="1.6" fill="none" opacity=".8"/>
    <path d="M112 216 l34 0" stroke="#7a6b52" stroke-width="2" stroke-dasharray="3 3"/>
    <!-- shawl over the shoulders -->
    <path d="M92 102 C98 86 158 86 164 102 C172 120 162 ${136 + b} 128 ${142 + b} C94 ${136 + b} 84 120 92 102 Z" fill="${INK}"/>
    <path d="M95 103 C101 90 155 90 161 103 C167 118 158 ${131 + b} 128 ${137 + b} C98 ${131 + b} 89 118 95 103 Z" fill="url(#ed-shawl)"/>
    <path d="M104 108 C114 118 142 118 152 108 M100 116 C112 128 144 128 156 116" stroke="#5e1c17" stroke-width="2" fill="none" opacity=".7"/>
    <path d="M150 104 C158 110 160 118 158 124" stroke="#ff9a6a" stroke-width="2" fill="none" opacity=".6"/>
    <!-- the name tag on its cord -->
    <path d="M118 112 C122 122 134 122 138 112" stroke="#3a2a1c" stroke-width="1.6" fill="none"/>
    <g transform="translate(${frame.tag ? -6 : 0} ${frame.tag ? -8 : 0})">
      <path d="M121 121 L135 121 L136 133 L120 133 Z" fill="#9c6a3a" stroke="${INK}" stroke-width="2"/>
      <path d="M123 125 L133 125 M123 129 L131 129" stroke="#4a2c14" stroke-width="1.4"/>
    </g>
    <!-- free hand: clutching the shawl, raised when she speaks -->
    ${frame.raise
      ? `<path d="M104 116 C96 112 90 102 92 92" stroke="${INK}" stroke-width="12" fill="none" stroke-linecap="round"/>
         <path d="M104 116 C97 112 92 103 93.5 93" stroke="#4e3c27" stroke-width="7.5" fill="none" stroke-linecap="round"/>
         ${hand(93, 86, { open: true })}`
      : hand(frame.tag ? 122 : 116, frame.tag ? 132 : 126)}
    <!-- hood and face -->
    <path d="M102 90 C96 56 160 56 154 90 C152 104 142 110 128 110 C114 110 104 104 102 90 Z" fill="${INK}"/>
    <path d="M105 89 C101 61 155 61 151 89 C149 100 140 106 128 106 C116 106 107 100 105 89 Z" fill="url(#ed-shawl)"/>
    <path d="M112 66 C120 60 138 60 146 68" stroke="#d76a5a" stroke-width="2" fill="none" opacity=".8"/>
    ${face(frame.mood)}
    <!-- lantern arm -->
    <path d="M152 114 C164 126 170 140 172 152" stroke="${INK}" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M152 114 C163 126 168 140 170 151" stroke="#5f4a31" stroke-width="8.5" fill="none" stroke-linecap="round"/>
    <path d="M160 124 C165 132 168 140 169 148" stroke="#ffb860" stroke-width="2" fill="none" opacity=".6"/>
    ${lantern(frame.glow, 173, 160)}
    ${hand(173, 154)}
  </g>
  </g>`;
}
