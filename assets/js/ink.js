// Menampilkan tulisan tangan dari aplikasi Android (hanya tampil; menulis di web menyusul).
// Koordinat logis 1000 x 1333, sama dengan Android (ui/ink/InkDrawing.kt).

import { INK_WIDTH, INK_HEIGHT } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const HIGHLIGHTER_WIDTH = 34;
const penWidth = (p) => 3 + p * 10;

export const INK_VAR = {
  tinta: '--ink', hijau: '--leaf', biru: '--sky', peach: '--peach', kuning: '--highlight',
  stabilo_hijau: '--hl-green', stabilo_biru: '--hl-blue', stabilo_pink: '--hl-pink', stabilo_oranye: '--hl-orange',
};

const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

function strokeInto(g, s) {
  const color = `var(${INK_VAR[s.color] || '--ink'})`;
  const n = Math.floor(s.pts.length / 3);
  if (!n) return;
  const P = (i) => [s.pts[i * 3], s.pts[i * 3 + 1], s.pts[i * 3 + 2]];
  if (s.tool === 'stabilo') {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(P(i)[0] + ',' + P(i)[1]);
    if (n === 1) pts.push(P(0)[0] + 0.1 + ',' + P(0)[1]);
    g.append(el('polyline', {
      points: pts.join(' '), fill: 'none', stroke: color, 'stroke-opacity': 0.4,
      'stroke-width': HIGHLIGHTER_WIDTH, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
    return;
  }
  if (n === 1) {
    const [x, y, p] = P(0);
    g.append(el('circle', { cx: x, cy: y, r: penWidth(p) / 2, fill: color }));
    return;
  }
  // Setiap ruas punya tebal sendiri mengikuti tekanan pensil di kedua ujungnya.
  for (let i = 1; i < n; i++) {
    const [x1, y1, p1] = P(i - 1);
    const [x2, y2, p2] = P(i);
    g.append(el('line', {
      x1, y1, x2, y2, stroke: color, 'stroke-width': penWidth((p1 + p2) / 2), 'stroke-linecap': 'round',
    }));
  }
}

/** SVG satu lembar penuh (dengan kertas). */
export function pageSvg(page, paper) {
  const svg = el('svg', { viewBox: `0 0 ${INK_WIDTH} ${INK_HEIGHT}`, preserveAspectRatio: 'none', class: 'ink-page' });
  if (paper === 'garis') {
    for (let y = 84; y < INK_HEIGHT; y += 84) svg.append(el('line', { x1: 0, y1: y, x2: INK_WIDTH, y2: y, class: 'paper-line' }));
  } else if (paper === 'titik') {
    for (let y = 60; y < INK_HEIGHT; y += 60) for (let x = 60; x < INK_WIDTH; x += 60) svg.append(el('circle', { cx: x, cy: y, r: 3.2, class: 'paper-dot' }));
  }
  const g = el('g');
  page.strokes.forEach((s) => strokeInto(g, s));
  svg.append(g);
  return svg;
}

/** Pratinjau kecil di kartu daftar: goresan dipaskan ke kotak. */
export function previewSvg(strokes) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const s of strokes) for (let i = 0; i + 1 < s.pts.length; i += 3) {
    l = Math.min(l, s.pts[i]); r = Math.max(r, s.pts[i]);
    t = Math.min(t, s.pts[i + 1]); b = Math.max(b, s.pts[i + 1]);
  }
  const pad = 40;
  const svg = el('svg', { viewBox: `${l - pad} ${t - pad} ${r - l + 2 * pad} ${b - t + 2 * pad}`, class: 'ink-preview' });
  const g = el('g');
  strokes.forEach((s) => strokeInto(g, s));
  svg.append(g);
  return svg;
}
