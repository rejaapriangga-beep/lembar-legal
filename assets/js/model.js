// Model catatan Lembar versi web. Bentuk data dan format JSON-nya sama dengan aplikasi Android
// (data/Note.kt dan data/NoteStore.kt), supaya berkas cadangan .lembar bisa dipakai bolak-balik.

export const INK_WIDTH = 1000;
export const INK_HEIGHT = 1333;
export const DEFAULT_SPACES = ['Kerja', 'Belajar', 'Pribadi'];

export const CARD_COLORS = [
  { key: 'krem', label: 'Krem' },
  { key: 'kuning', label: 'Kuning' },
  { key: 'hijau', label: 'Hijau' },
  { key: 'biru', label: 'Biru' },
  { key: 'peach', label: 'Peach' },
  { key: 'ungu', label: 'Ungu' },
  { key: 'merah', label: 'Merah muda' },
];
const COLOR_KEYS = CARD_COLORS.map((c) => c.key);
const PAPERS = ['garis', 'titik', 'polos'];
const INK_COLORS = ['tinta', 'hijau', 'biru', 'peach', 'kuning', 'stabilo_hijau', 'stabilo_biru', 'stabilo_pink', 'stabilo_oranye'];

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

export const newCard = (x = 40, y = 40) => ({ id: uid(), x, y, title: '', items: [{ t: '', d: false }] });
export const blankPage = () => ({ strokes: [], cards: [] });
export const pageIsBlank = (p) => !p.strokes.length && !p.cards.length;

export function newNote(space = 'Pribadi') {
  return {
    id: uid(), title: '', body: '', space, color: 'krem', pinned: false,
    mode: 'ketik', paper: 'garis', pages: [blankPage()], updatedAt: Date.now(),
  };
}

export const allChecks = (n) => n.pages.flatMap((p) => p.cards.flatMap((c) => c.items));
export const hasInk = (n) => n.pages.some((p) => p.strokes.length);

export function isEmpty(n) {
  return !n.title.trim() && !n.body.trim() && !allChecks(n).some((i) => i.t.trim()) && !hasInk(n);
}

export function matches(n, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) ||
    allChecks(n).some((i) => i.t.toLowerCase().includes(q)) ||
    n.pages.some((p) => p.cards.some((c) => c.title.toLowerCase().includes(q)));
}

/** Rapikan sebelum disimpan: item kosong dan kartu kosong dibuang, lembar kosong di akhir dibuang. */
export function cleaned(n) {
  const pages = n.pages.map((p) => ({
    strokes: p.strokes,
    cards: p.cards
      .map((c) => ({ ...c, items: c.items.filter((i) => i.t.trim()) }))
      .filter((c) => c.items.length || c.title.trim()),
  }));
  while (pages.length > 1 && pageIsBlank(pages[pages.length - 1])) pages.pop();
  return { ...n, title: n.title.trim(), body: n.body.replace(/\s+$/, ''), pages: pages.length ? pages : [blankPage()] };
}

// ---------- JSON (format sama dengan Android) ----------

const round1 = (v) => Math.round(v * 10) / 10;

export function noteToJson(n) {
  return {
    id: n.id, title: n.title, body: n.body, space: n.space, color: n.color, pinned: n.pinned,
    mode: n.mode, paper: n.paper, updatedAt: n.updatedAt,
    pages: n.pages.map((p) => ({
      strokes: p.strokes.map((s) => ({ tool: s.tool, color: s.color, pts: s.pts.map(round1) })),
      cards: p.cards.map((c) => ({ id: c.id, x: c.x, y: c.y, title: c.title, items: c.items.map((i) => ({ t: i.t, d: i.d })) })),
    })),
  };
}

const checksFrom = (arr) => (Array.isArray(arr) ? arr.map((c) => ({ t: String(c?.t ?? ''), d: !!c?.d })) : []);

function strokesFrom(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((s) => s && Array.isArray(s.pts)).map((s) => ({
    tool: s.tool === 'stabilo' ? 'stabilo' : 'pena',
    color: INK_COLORS.includes(s.color) ? s.color : 'tinta',
    pts: s.pts.map(Number),
  }));
}

function pageFrom(v) {
  if (Array.isArray(v)) return { strokes: strokesFrom(v), cards: [] };
  if (v && typeof v === 'object') {
    return {
      strokes: strokesFrom(v.strokes),
      cards: (Array.isArray(v.cards) ? v.cards : []).map((c) => ({
        id: c.id || uid(),
        x: Number.isFinite(+c.x) ? +c.x : 40,
        y: Number.isFinite(+c.y) ? +c.y : 40,
        title: String(c.title ?? ''),
        items: checksFrom(c.items),
      })),
    };
  }
  return blankPage();
}

export function noteFromJson(o) {
  let pages = Array.isArray(o.pages) ? o.pages.map(pageFrom) : [{ strokes: strokesFrom(o.ink), cards: [] }];
  while (pages.length && pageIsBlank(pages[pages.length - 1])) pages.pop();
  if (!pages.length) pages = [blankPage()];
  let mode = o.mode === 'tulis' ? 'tulis' : 'ketik';
  // Versi lama menyimpan checklist di bawah teks ("checks"); kini jadi kartu di lembar pertama.
  const legacy = checksFrom(o.checks).filter((i) => i.t.trim());
  if (legacy.length) {
    pages[0] = { ...pages[0], cards: [...pages[0].cards, { ...newCard(), items: legacy }] };
    if (!String(o.body ?? '').trim()) mode = 'tulis';
  }
  if (!o.id) throw new Error('Catatan tanpa id');
  return {
    id: String(o.id),
    title: String(o.title ?? ''),
    body: String(o.body ?? ''),
    space: String(o.space || 'Pribadi'),
    color: COLOR_KEYS.includes(o.color) ? o.color : 'krem',
    pinned: !!o.pinned,
    mode,
    paper: PAPERS.includes(o.paper) ? o.paper : 'garis',
    updatedAt: Number(o.updatedAt) || Date.now(),
    pages,
  };
}

export function backupJson(notes, spaces) {
  return JSON.stringify({ app: 'lembar', format: 1, exportedAt: Date.now(), spaces, notes: notes.map(noteToJson) });
}

/** Membaca cadangan yang sudah didekripsi. Melempar Error kalau bukan cadangan Lembar. */
export function parseBackup(text) {
  let root;
  try { root = JSON.parse(text); } catch { throw new Error('Berkas ini bukan cadangan Lembar.'); }
  if (!root || root.app !== 'lembar') throw new Error('Berkas ini bukan cadangan Lembar.');
  const notes = (Array.isArray(root.notes) ? root.notes : []).map(noteFromJson);
  const spaces = [...new Set((Array.isArray(root.spaces) ? root.spaces : []).map(String).filter((s) => s.trim()))];
  return { notes, spaces };
}

// ---------- Ekspor teks ----------

export function toText(n) {
  const out = [];
  out.push(n.title.trim() || 'Tanpa judul');
  out.push('');
  if (n.body.trim()) { out.push(n.body.trim()); out.push(''); }
  for (const p of n.pages) {
    for (const c of p.cards) {
      if (c.title.trim()) out.push(c.title.trim());
      for (const i of c.items) if (i.t.trim()) out.push(`${i.d ? '[x]' : '[ ]'} ${i.t.trim()}`);
      out.push('');
    }
  }
  if (hasInk(n)) out.push('(Catatan ini juga berisi tulisan tangan.)');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export const safeName = (title, fallback = 'Catatan Lembar') =>
  (title.trim() || fallback).replace(/[\\/:*?"<>|\n\r]+/g, ' ').slice(0, 60).trim();

// ---------- Contoh catatan (sama dengan Android) ----------

const HOUR = 3600000;

function wob(i, s) { return Math.sin(i * 1.7 + s) * 4; }
function line(x1, y1, x2, y2, s) {
  const out = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    out.push(x1 + (x2 - x1) * t + wob(i, s), y1 + (y2 - y1) * t + wob(i, s + 2), 0.4 + 0.4 * Math.sin(t * Math.PI));
  }
  return out;
}
const box = (x, y, w, h, s) => [
  ...line(x, y, x + w, y, s), ...line(x + w, y, x + w, y + h, s + 1),
  ...line(x + w, y + h, x, y + h, s + 2), ...line(x, y + h, x, y + 4, s + 3),
];
function ring(cx, cy, r, s) {
  const out = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2.1 - 1;
    out.push(cx + Math.cos(a) * (r + wob(i, s)), cy + Math.sin(a) * (r * 0.62 + wob(i, s + 1)), 0.5);
  }
  return out;
}
const pen = (color, pts) => ({ tool: 'pena', color, pts });

function sketch() {
  return [
    { tool: 'stabilo', color: 'kuning', pts: line(90, 190, 640, 190, 1) },
    pen('tinta', box(90, 300, 300, 170, 1)),
    pen('tinta', box(590, 300, 300, 170, 2)),
    pen('tinta', line(400, 385, 580, 385, 3)),
    pen('tinta', line(545, 355, 582, 385, 4)),
    pen('tinta', line(545, 415, 582, 385, 5)),
    pen('hijau', box(340, 640, 320, 180, 3)),
    pen('tinta', line(740, 480, 560, 630, 6)),
    pen('biru', ring(500, 730, 230, 2)),
    pen('hijau', line(140, 980, 200, 1040, 1)),
    pen('hijau', line(200, 1040, 320, 900, 2)),
    pen('tinta', line(380, 990, 860, 990, 4)),
    pen('tinta', line(380, 1070, 740, 1070, 5)),
  ];
}

export function sampleNotes(now = Date.now()) {
  const n = (o) => ({ ...newNote(), ...o });
  return [
    n({
      title: 'Tugas minggu ini', body: 'Yang penting dulu, sisanya menyusul.', space: 'Kerja', color: 'kuning',
      pinned: true, updatedAt: now - 2 * HOUR, mode: 'tulis',
      pages: [{ strokes: [], cards: [{ ...newCard(60, 80), title: 'Minggu ini', items: [
        { t: 'Bayar tagihan listrik', d: true }, { t: 'Servis motor', d: true }, { t: 'Telepon keluarga', d: false },
      ] }] }],
    }),
    n({ title: 'Coretan denah ruangan', space: 'Kerja', mode: 'tulis', updatedAt: now - 3 * HOUR, pages: [{ strokes: sketch(), cards: [] }] }),
    n({
      title: 'Jadwal belajar', space: 'Belajar', updatedAt: now - 5 * HOUR,
      body: 'Senin: Matematika. Rabu: Bahasa Inggris. Jumat: ulangan IPA, jangan lupa bawa kalkulator.',
    }),
    n({
      title: 'Belanja bulanan', space: 'Pribadi', color: 'hijau', mode: 'tulis', updatedAt: now - 26 * HOUR,
      pages: [{ strokes: [], cards: [{ ...newCard(60, 80), title: 'Belanja', items: [
        { t: 'Beras 5 kg', d: true }, { t: 'Kopi', d: false }, { t: 'Sabun cuci', d: false }, { t: 'Buah', d: false },
      ] }] }],
    }),
    n({
      title: 'Resep nasi goreng', space: 'Pribadi', color: 'biru', updatedAt: now - 50 * HOUR,
      body: 'Tumis bawang merah dan bawang putih, masukkan telur, lalu nasi. Tambahkan kecap, garam, dan sedikit merica.',
    }),
  ];
}
