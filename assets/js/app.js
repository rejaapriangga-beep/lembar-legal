// Lembar versi web: daftar catatan, editor mode Ketik dengan kartu checklist, kategori,
// cadangan/pulihkan (kompatibel dengan aplikasi Android), dan ekspor teks/PDF.

import * as db from './db.js';
import {
  CARD_COLORS, DEFAULT_SPACES, INK_HEIGHT, INK_WIDTH, allChecks, backupJson, blankPage, cleaned, hasInk,
  isEmpty, matches, newCard, newNote, parseBackup, safeName, sampleNotes, toText,
} from './model.js';
import { WrongPassword, decrypt, encrypt, isEncrypted } from './crypto.js';
import { pageSvg, previewSvg } from './ink.js';
import { mountAd } from './ads.js';
import {
  confirmDialog, download, greeting, h, icon, menuItem, openDialog, openMenu, shareFile, timeAgo, toast,
} from './ui.js';

const ALL = 'Semua';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=id.my.lembar.app';
const CARD_W = 240;           // lebar kartu checklist (px), sama dengan Android (dp)
const LINE_H = 30;            // tinggi baris mode Ketik
const TOP_PAD = 24;
const PAGE_GAP = 20;
const MAX_TYPE_PAGES = 60;
const DAY = 86400000;

const state = {
  notes: [],
  spaces: [...DEFAULT_SPACES],
  filter: ALL,
  query: '',
  draft: null,        // salinan catatan yang sedang dibuka
  isNew: false,
  dirty: false,       // draft berubah sejak dibuka
  view: 'ketik',      // tampilan editor: 'ketik' atau 'tulis'
};
let installPrompt = null;

// ---------- data ----------

const findNote = (id) => state.notes.find((n) => n.id === id);

async function persistSpaces() { await db.setMeta('spaces', state.spaces); }

/** Kategori yang dipakai catatan tapi belum terdaftar (misalnya dari cadangan lama) ditambahkan. */
async function ensureSpaces() {
  const missing = [...new Set(state.notes.map((n) => n.space).filter((s) => s && !state.spaces.includes(s)))];
  if (missing.length) { state.spaces = [...state.spaces, ...missing]; await persistSpaces(); }
}

async function saveNote(note) {
  const exists = !!findNote(note.id);
  if (isEmpty(note)) {
    if (exists) { await db.deleteNote(note.id); state.notes = state.notes.filter((n) => n.id !== note.id); }
    return exists ? 'deleted' : 'discarded';
  }
  const clean = { ...cleaned(note), updatedAt: Date.now() };
  await db.putNote(clean);
  state.notes = exists ? state.notes.map((n) => (n.id === clean.id ? clean : n)) : [clean, ...state.notes];
  await ensureSpaces();
  return exists ? 'updated' : 'created';
}

async function editNote(id, change) {
  const n = findNote(id);
  if (!n) return;
  if (state.draft?.id === id) await closeEditor({ silent: true });
  const updated = { ...change(findNote(id) || n), updatedAt: Date.now() };
  await db.putNote(updated);
  state.notes = state.notes.map((x) => (x.id === id ? updated : x));
  renderList();
}

async function deleteNoteById(id) {
  if (state.draft?.id === id) { state.draft = null; showEditor(false); }
  await db.deleteNote(id);
  state.notes = state.notes.filter((n) => n.id !== id);
  renderList();
  toast('Catatan dihapus');
}

// ---------- daftar ----------

const listPane = document.querySelector('.pane-list');
const listScroll = h('div', { class: 'list-scroll' });
const pillsBox = h('div', { class: 'pills' });
const notesBox = h('div');
const bannerBox = h('div');
const adbar = h('div', { class: 'adbar', 'aria-label': 'Iklan' });

function buildListPane() {
  const searchIn = h('input', {
    type: 'search', placeholder: 'Cari judul, isi, atau checklist', 'aria-label': 'Cari catatan',
    oninput: (e) => { state.query = e.target.value; renderList(); },
  });
  const menuBtn = h('button', { class: 'iconbtn', 'aria-label': 'Menu', onclick: (e) => mainMenu(e.currentTarget) }, icon('more'));
  listScroll.append(
    h('div', { class: 'list-head' },
      h('div', { style: { flex: '1' } }, h('div', { class: 'hello' }, greeting()), h('h1', { class: 'big' }, 'Catatanmu')),
      menuBtn),
    bannerBox,
    h('label', { class: 'search' }, icon('search'), searchIn),
    pillsBox,
    notesBox,
  );
  const fabs = h('div', { class: 'fabs' },
    h('button', { class: 'fab hard', onclick: () => openEditor(null) }, icon('plus'), 'Catatan baru'));
  listPane.append(h('div', { class: 'list-wrap' }, listScroll, fabs), adbar);
  mountAd(adbar);
}

function renderList() {
  // Kategori
  pillsBox.replaceChildren(
    ...[ALL, ...state.spaces].map((s) => {
      const n = s === ALL ? state.notes.length : state.notes.filter((x) => x.space === s).length;
      return h('button', { class: 'pill' + (s === state.filter ? ' on' : ''), onclick: () => { state.filter = s; renderList(); } }, `${s} · ${n}`);
    }),
    h('button', { class: 'pill', 'aria-label': 'Kelola kategori', title: 'Kelola kategori', onclick: manageSpaces }, icon('tune')),
  );

  // Pengingat cadangan
  bannerBox.replaceChildren();
  if (shouldRemindBackup()) {
    bannerBox.append(h('div', { class: 'banner' },
      h('span', {}, 'Sudah lebih dari seminggu belum dicadangkan.'),
      h('button', { onclick: () => startBackup(false) }, 'Cadangkan'),
      h('button', { 'aria-label': 'Ingatkan nanti', onclick: () => { localStorage.setItem('lembar.snooze', Date.now() + 3 * DAY); renderList(); } }, icon('close'))));
  }

  const visible = state.notes
    .filter((n) => (state.filter === ALL || n.space === state.filter) && matches(n, state.query))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const pinned = visible.filter((n) => n.pinned);
  const rest = visible.filter((n) => !n.pinned);
  notesBox.replaceChildren();
  if (!visible.length) {
    notesBox.append(h('div', { class: 'empty' }, state.query.trim()
      ? `Tidak ada catatan yang cocok dengan "${state.query.trim()}".\nCoba kata lain atau pilih kategori "Semua".`
      : 'Belum ada catatan di sini.\nKetuk "Catatan baru" untuk mulai menulis.'));
    return;
  }
  if (pinned.length) notesBox.append(h('div', { class: 'label' }, 'Disematkan'), ...pinned.map(noteCard));
  if (rest.length) notesBox.append(pinned.length ? h('div', { class: 'label' }, 'Lainnya') : null, ...rest.map(noteCard));
}

function noteCard(n) {
  const checks = allChecks(n).filter((i) => i.t.trim());
  const done = checks.filter((i) => i.d).length;
  const preview = n.body.trim() || checks.map((i) => (i.d ? '✓ ' : '○ ') + i.t).join('   ');
  const firstInk = n.pages.find((p) => p.strokes.length);
  const meta = [n.space];
  if (hasInk(n)) { meta.push('tulis tangan'); if (n.pages.length > 1) meta.push(`${n.pages.length} lembar`); }
  if (checks.length) meta.push(`${done}/${checks.length} selesai`);
  const more = h('button', {
    class: 'iconbtn more', 'aria-label': 'Menu catatan',
    onclick: (e) => { e.stopPropagation(); cardMenu(e.currentTarget, n); },
  }, icon('more'));
  return h('article', {
    class: `note hard c-${n.color}` + (state.draft?.id === n.id ? ' sel' : ''),
    tabindex: 0,
    onclick: () => openEditor(n.id),
    onkeydown: (e) => { if (e.key === 'Enter') openEditor(n.id); },
    oncontextmenu: (e) => { e.preventDefault(); cardMenu(more, n); },
  },
  h('h3', {}, h('span', {}, n.title.trim() || 'Tanpa judul'), n.pinned ? icon('pin') : null, more),
  firstInk ? h('div', { class: 'prev' }, previewSvg(firstInk.strokes)) : null,
  preview ? h('p', {}, preview) : null,
  checks.length ? h('div', { class: 'prog' }, h('i', { style: { width: `${(done / checks.length) * 100}%` } })) : null,
  h('div', { class: 'meta' }, h('span', {}, meta.join(' · ')), h('span', {}, timeAgo(n.updatedAt))));
}

function cardMenu(anchor, n) {
  openMenu(anchor, (m, close) => {
    const page = (fn) => { m.replaceChildren(); fn(); };
    const main = () => m.append(
      menuItem('Ekspor', 'share', () => { close(); exportDialog(n); }),
      menuItem(n.pinned ? 'Lepas sematan' : 'Sematkan', 'pin', () => { close(); editNote(n.id, (x) => ({ ...x, pinned: !x.pinned })); }),
      menuItem('Pindah kategori', 'folder', () => page(() => {
        m.append(h('div', { class: 'cap' }, 'Pindah ke kategori'),
          ...state.spaces.map((s) => menuItem((s === n.space ? '✓ ' : '') + s, null, () => {
            close();
            if (s !== n.space) { editNote(n.id, (x) => ({ ...x, space: s })); toast(`Dipindah ke ${s}`); }
          })));
      })),
      h('button', { role: 'menuitem', onclick: () => page(() => {
        m.append(h('div', { class: 'cap' }, 'Warna kartu'), h('div', { class: 'swatches' },
          ...CARD_COLORS.map((c) => h('button', {
            class: `swatch c-${c.key}` + (c.key === n.color ? ' on' : ''), title: c.label, 'aria-label': `Warna ${c.label}`,
            onclick: () => { close(); if (c.key !== n.color) editNote(n.id, (x) => ({ ...x, color: c.key })); },
          }))));
      }) }, h('span', { class: `c-${n.color}`, style: { width: '22px', height: '22px', borderRadius: '6px', border: '1.5px solid var(--ink)', flex: 'none' } }), 'Warna kartu'),
      h('hr'),
      menuItem('Hapus', 'trash', () => {
        close();
        confirmDialog('Hapus catatan ini?', `"${n.title.trim() || 'Tanpa judul'}" akan dihapus dan tidak bisa dikembalikan.`, 'Hapus', () => deleteNoteById(n.id));
      }, 'danger'),
    );
    main();
  });
}

function mainMenu(anchor) {
  openMenu(anchor, (m, close) => {
    const last = Number(localStorage.getItem('lembar.lastBackup') || 0);
    m.append(
      menuItem('Kelola kategori', 'tune', () => { close(); manageSpaces(); }),
      h('hr'),
      h('div', { class: 'cap' }, 'Cadangkan & pulihkan'),
      menuItem('Cadangkan ke file', 'save', () => { close(); startBackup(false); }),
      navigator.canShare ? menuItem('Bagikan cadangan', 'share', () => { close(); startBackup(true); }) : null,
      menuItem('Pulihkan dari file', 'restore', () => { close(); pickRestoreFile(); }),
      h('div', { class: 'note-line' }, last ? 'Terakhir dicadangkan: ' + new Date(last).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum pernah dicadangkan'),
      h('hr'),
      installPrompt ? menuItem('Pasang aplikasi', 'install', async () => {
        close();
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
      }) : null,
      h('a', { href: PLAY_URL, target: '_blank', rel: 'noopener' }, icon('phone'), 'Lembar untuk Android'),
      h('a', { href: 'privacy/' }, icon('shield'), 'Kebijakan privasi'),
    );
  });
}

// ---------- kategori ----------

function nameError(name, except) {
  const n = name.trim();
  if (!n) return 'Nama kategori belum diisi.';
  if (n.length > 24) return 'Nama kategori maksimal 24 huruf.';
  if (n.toLowerCase() === ALL.toLowerCase()) return '"Semua" sudah dipakai untuk menampilkan semua catatan.';
  if (state.spaces.some((s) => s.toLowerCase() === n.toLowerCase() && s.toLowerCase() !== (except || '').toLowerCase())) return `Kategori "${n}" sudah ada.`;
  return null;
}

async function moveNotes(from, to) {
  const changed = state.notes.filter((n) => n.space === from).map((n) => ({ ...n, space: to }));
  if (!changed.length) return;
  await db.putMany(changed);
  state.notes = state.notes.map((n) => changed.find((c) => c.id === n.id) || n);
}

function manageSpaces() {
  openDialog((box, close) => {
    const render = () => {
      const counts = Object.fromEntries(state.spaces.map((s) => [s, state.notes.filter((n) => n.space === s).length]));
      const rows = state.spaces.map((s, i) => h('div', { class: 'space-row' },
        h('div', {}, h('b', {}, s), h('small', {}, `${counts[s]} catatan`)),
        h('button', { class: 'iconbtn', disabled: i === 0, 'aria-label': `Naikkan ${s}`, onclick: () => swap(i, i - 1) }, icon('up')),
        h('button', { class: 'iconbtn', disabled: i === state.spaces.length - 1, 'aria-label': `Turunkan ${s}`, onclick: () => swap(i, i + 1) }, icon('down')),
        h('button', { class: 'iconbtn', 'aria-label': `Ganti nama ${s}`, onclick: () => rename(s) }, icon('edit')),
        h('button', { class: 'iconbtn', disabled: state.spaces.length <= 1, style: { color: 'var(--danger)' }, 'aria-label': `Hapus ${s}`, onclick: () => remove(s, counts[s]) }, icon('trash'))));
      const input = h('input', { placeholder: 'Misalnya: Kuliah', maxLength: 24, onkeydown: (e) => { if (e.key === 'Enter') add(); } });
      const err = h('div', { class: 'err' });
      const add = async () => {
        const e = nameError(input.value);
        if (e) { err.textContent = e; return; }
        state.spaces = [...state.spaces, input.value.trim()];
        await persistSpaces(); renderList(); render();
      };
      box.replaceChildren(
        h('h2', {}, 'Kelola kategori'), ...rows,
        h('div', { class: 'label' }, 'Tambah kategori'),
        h('div', { class: 'field' }, input, h('button', { class: 'btn-primary', style: { padding: '10px', fontWeight: 700 }, onclick: add }, 'Tambah')),
        err,
        h('div', { class: 'btns' }, h('button', { class: 'btn-primary', onclick: close }, 'Selesai')),
      );
    };
    const swap = async (i, j) => {
      const s = [...state.spaces];
      [s[i], s[j]] = [s[j], s[i]];
      state.spaces = s; await persistSpaces(); renderList(); render();
    };
    const rename = (old) => openDialog((b2, close2) => {
      const input = h('input', { value: old, maxLength: 24 });
      const err = h('div', { class: 'err' });
      const ok = async () => {
        const e = nameError(input.value, old);
        if (e) { err.textContent = e; return; }
        const name = input.value.trim();
        if (state.draft?.space === old) await closeEditor({ silent: true });
        state.spaces = state.spaces.map((s) => (s === old ? name : s));
        await persistSpaces(); await moveNotes(old, name);
        if (state.filter === old) state.filter = name;
        close2(); renderList(); render();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      b2.append(h('h2', {}, 'Ganti nama kategori'), h('div', { class: 'field' }, input), err,
        h('div', { class: 'btns' }, h('button', { onclick: close2 }, 'Batal'), h('button', { class: 'btn-primary', onclick: ok }, 'Simpan')));
    });
    const remove = (name, count) => openDialog((b2, close2) => {
      const others = state.spaces.filter((s) => s !== name);
      let target = others[0];
      const choice = h('div', { class: 'choice' });
      const drawChoice = () => choice.replaceChildren(...others.map((o) =>
        h('button', { class: 'pill' + (o === target ? ' on' : ''), onclick: () => { target = o; drawChoice(); } }, o)));
      drawChoice();
      b2.append(h('h2', {}, `Hapus kategori "${name}"?`),
        h('p', {}, count ? `${count} catatan di dalamnya tidak ikut terhapus. Pindahkan ke:` : 'Kategori ini belum berisi catatan.'),
        count ? choice : null,
        h('div', { class: 'btns' }, h('button', { onclick: close2 }, 'Batal'), h('button', {
          class: 'btn-danger',
          onclick: async () => {
            if (state.draft?.space === name) await closeEditor({ silent: true });
            state.spaces = others; await persistSpaces(); await moveNotes(name, target);
            if (state.filter === name) state.filter = ALL;
            close2(); renderList(); render();
          },
        }, 'Hapus')));
    });
    render();
  });
}

// ---------- cadangan ----------

function shouldRemindBackup() {
  if (!state.notes.length) return false;
  const now = Date.now();
  if (now < Number(localStorage.getItem('lembar.snooze') || 0)) return false;
  const first = Number(localStorage.getItem('lembar.firstSeen') || now);
  const last = Number(localStorage.getItem('lembar.lastBackup') || 0);
  return now - Math.max(first, last) > 7 * DAY;
}

const backupName = () => `Lembar-cadangan-${new Date().toISOString().slice(0, 10)}.lembar`;

function passwordField(placeholder) {
  const input = h('input', { type: 'password', placeholder, autocomplete: 'new-password' });
  const toggle = h('button', {
    class: 'iconbtn', type: 'button', 'aria-label': 'Tampilkan password',
    onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; toggle.replaceChildren(icon(input.type === 'password' ? 'eye' : 'eyeoff')); },
  }, icon('eye'));
  return { input, el: h('div', { class: 'field' }, input, toggle) };
}

function startBackup(share) {
  openDialog((box, close) => {
    const a = passwordField('Password');
    const b = passwordField('Ulangi password');
    const err = h('div', { class: 'err' });
    const go = async (password) => {
      try {
        if (state.draft && state.dirty && !isEmpty(state.draft)) { state.dirty = false; await saveNote(state.draft); state.isNew = false; }
        let text = backupJson(state.notes, state.spaces);
        if (password) text = await encrypt(text, password);
        const name = backupName();
        close();
        if (share && (await shareFile(name, text, 'application/octet-stream'))) {
          // dibagikan lewat menu bagikan sistem
        } else {
          download(name, text);
        }
        localStorage.setItem('lembar.lastBackup', Date.now());
        renderList();
        toast(password ? 'Cadangan berpassword disimpan' : 'Cadangan disimpan');
      } catch (e) {
        console.error(e);
        toast('Gagal membuat cadangan. Coba lagi.');
      }
    };
    const withPassword = () => {
      if (a.input.value.length < 6) { err.textContent = 'Password minimal 6 karakter.'; return; }
      if (a.input.value !== b.input.value) { err.textContent = 'Kedua password tidak sama.'; return; }
      go(a.input.value);
    };
    box.append(
      h('h2', {}, 'Lindungi cadangan'),
      h('p', {}, 'Dengan password, isi cadangan dienkripsi dan tidak bisa dibaca orang lain, termasuk di Google Drive.'),
      a.el, b.el, err,
      h('p', { style: { color: 'var(--ink)' } }, 'Password tidak disimpan di mana pun. Kalau lupa, cadangan ini tidak bisa dipulihkan.'),
      h('div', { class: 'btns' },
        h('button', { onclick: close }, 'Batal'),
        h('button', { onclick: () => go(null) }, 'Tanpa password'),
        h('button', { class: 'btn-primary', onclick: withPassword }, 'Pakai password')),
    );
  });
}

function pickRestoreFile() {
  const input = h('input', { type: 'file', accept: '.lembar,application/json,application/octet-stream,*/*' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (isEncrypted(text)) askBackupPassword(text);
    else {
      try { confirmRestore(parseBackup(text)); } catch (e) { toast(e.message || 'Berkas ini bukan cadangan Lembar.'); }
    }
  });
  input.click();
}

function askBackupPassword(text) {
  openDialog((box, close) => {
    const p = passwordField('Password');
    const err = h('div', { class: 'err' });
    const ok = h('button', { class: 'btn-primary' }, 'Buka');
    const submit = async () => {
      ok.disabled = true; err.textContent = 'Memproses…';
      try {
        const data = parseBackup(await decrypt(text, p.input.value));
        close(); confirmRestore(data);
      } catch (e) {
        err.textContent = e instanceof WrongPassword ? 'Password salah. Coba lagi.' : 'Cadangan tidak bisa dibuka. Berkasnya mungkin rusak.';
        ok.disabled = false;
      }
    };
    ok.addEventListener('click', submit);
    p.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    box.append(h('h2', {}, 'Cadangan berpassword'), h('p', {}, 'Masukkan password yang dipakai saat cadangan ini dibuat.'),
      p.el, err, h('div', { class: 'btns' }, h('button', { onclick: close }, 'Batal'), ok));
  });
}

function confirmRestore(data) {
  openDialog((box, close) => {
    const merge = async () => {
      close();
      if (state.draft) await closeEditor({ silent: true });
      let added = 0, updated = 0;
      const byId = new Map(state.notes.map((n) => [n.id, n]));
      for (const n of data.notes) {
        const old = byId.get(n.id);
        if (!old) { byId.set(n.id, n); added++; } else if (n.updatedAt > old.updatedAt) { byId.set(n.id, n); updated++; }
      }
      state.notes = [...byId.values()];
      await db.replaceAll(state.notes);
      const extra = data.spaces.filter((s) => !state.spaces.some((x) => x.toLowerCase() === s.toLowerCase()));
      if (extra.length) { state.spaces = [...state.spaces, ...extra]; await persistSpaces(); }
      await ensureSpaces(); renderList();
      toast(`Dipulihkan: ${added} catatan baru, ${updated} diperbarui`);
    };
    const replace = async () => {
      close();
      if (state.draft) { state.draft = null; showEditor(false); }
      state.notes = data.notes;
      await db.replaceAll(state.notes);
      if (data.spaces.length) { state.spaces = data.spaces; await persistSpaces(); }
      await ensureSpaces();
      state.filter = ALL; renderList();
      toast('Semua catatan diganti isi cadangan');
    };
    box.append(
      h('h2', {}, `Pulihkan ${data.notes.length} catatan?`),
      h('p', {}, 'Gabungkan: catatan dari cadangan ditambahkan; kalau ada catatan yang sama, versi terbaru yang dipakai. Tidak ada yang terhapus.'),
      h('p', {}, 'Ganti semua: semua catatan di browser ini diganti isi cadangan.'),
      h('div', { class: 'btns' },
        h('button', { onclick: close }, 'Batal'),
        h('button', { class: 'btn-danger', onclick: replace }, 'Ganti semua'),
        h('button', { class: 'btn-primary', onclick: merge }, 'Gabungkan')),
    );
  });
}

// ---------- ekspor ----------

function exportDialog(note) {
  openDialog((box, close) => {
    let format = 'pdf';
    const opts = [
      ['pdf', 'PDF', 'Lewat jendela Cetak → Simpan sebagai PDF'],
      ['txt', 'Teks (.txt)', 'Judul, isi, dan checklist sebagai teks biasa'],
    ].map(([key, label, desc]) => h('label', { class: 'opt' },
      h('input', { type: 'radio', name: 'fmt', checked: key === format, onchange: () => { format = key; } }),
      h('div', {}, h('b', {}, label), h('span', {}, desc))));
    const run = async (share) => {
      close();
      const n = state.draft?.id === note.id ? state.draft : note;
      if (format === 'pdf') { printNote(n); return; }
      const name = safeName(n.title) + '.txt';
      const text = toText(n);
      if (share && (await shareFile(name, text, 'text/plain'))) return;
      download(name, text, 'text/plain;charset=utf-8');
      toast('Teks disimpan');
    };
    box.append(h('h2', {}, 'Ekspor catatan'), h('p', {}, note.title.trim() || 'Tanpa judul'), ...opts,
      h('div', { class: 'btns' },
        h('button', { onclick: close }, 'Batal'),
        navigator.canShare ? h('button', { class: 'btn-primary', onclick: () => run(true) }, 'Bagikan') : null,
        h('button', { class: 'btn-primary', onclick: () => run(false) }, 'Simpan')));
  });
}

function printNote(n) {
  const out = document.getElementById('print');
  const cards = (p) => p.cards.map((c) => h('div', { class: 'pcard' },
    c.title.trim() ? h('b', {}, c.title.trim()) : null,
    ...c.items.filter((i) => i.t.trim()).map((i) => h('div', {}, (i.d ? '☑ ' : '☐ ') + i.t))));
  out.replaceChildren(
    h('h1', {}, n.title.trim() || 'Tanpa judul'),
    n.body.trim() ? h('div', { class: 'body' }, n.body) : null,
    ...n.pages.flatMap((p) => [
      p.strokes.length ? h('div', { class: 'ppage' }, pageSvg(p, n.paper)) : null,
      ...cards(p),
    ]),
  );
  const title = document.title;
  document.title = safeName(n.title);
  window.print();
  document.title = title;
}

// ---------- editor ----------

const editorPane = document.querySelector('.pane-editor');

function showEditor(on) {
  document.body.classList.toggle('editing', on);
  if (!on) editorPane.replaceChildren();
}

async function openEditor(id) {
  // Pindah dari catatan lain (tampilan dua panel): riwayat browser tetap satu entri editor.
  const switching = !!state.draft;
  if (switching) await closeEditor({ silent: true, fromHistory: true });
  const base = id ? findNote(id) : newNote(state.filter === ALL ? (state.spaces.includes('Pribadi') ? 'Pribadi' : state.spaces[0]) : state.filter);
  if (!base) return;
  state.draft = structuredClone(base);
  state.isNew = !id;
  state.dirty = false;
  state.view = state.draft.mode === 'tulis' && hasInk(state.draft) ? 'tulis' : 'ketik';
  if (!switching || !history.state?.editor) history.pushState({ editor: true }, '');
  showEditor(true);
  renderEditor();
  renderList();
  if (!id) setTimeout(() => editorPane.querySelector('textarea')?.focus(), 50);
}

let saveTimer;
function changed() {
  state.dirty = true;
  clearTimeout(saveTimer);
  // Disimpan otomatis setelah jeda mengetik, supaya catatan aman walau tab ditutup.
  saveTimer = setTimeout(async () => {
    if (!state.draft || !state.dirty || isEmpty(state.draft)) return;
    state.dirty = false;
    const r = await saveNote(state.draft);
    if (r === 'created') state.isNew = false;
    renderList();
  }, 700);
}

async function closeEditor({ silent = false, fromHistory = false } = {}) {
  clearTimeout(saveTimer);
  const d = state.draft;
  if (!d) return;
  state.draft = null;
  // Catatan yang hanya dibuka tanpa diubah tidak disimpan ulang, supaya urutannya tidak berubah.
  const r = state.dirty || state.isNew ? await saveNote(d) : 'unchanged';
  state.dirty = false;
  if (!silent) {
    if (r === 'created') toast('Catatan disimpan');
    else if (r === 'updated') toast('Perubahan disimpan');
    else if (r === 'deleted') toast('Catatan kosong dihapus');
  }
  showEditor(false);
  renderList();
  if (!fromHistory && history.state?.editor) history.back();
}

function tool(label, iconName, onClick, { on = false, disabled = false } = {}) {
  return h('button', { class: 'tool' + (on ? ' on' : ''), disabled, 'aria-pressed': on, onclick: onClick }, iconName ? icon(iconName) : null, label);
}

function renderEditor() {
  const d = state.draft;
  const wide = window.matchMedia('(min-width: 900px)').matches;
  const tools = h('div', { class: 'tools' },
    tool('Kembali', 'back', () => closeEditor()),
    wide ? tool(document.body.classList.contains('list-hidden') ? 'Daftar' : 'Tutup daftar', 'sidebar', () => { document.body.classList.toggle('list-hidden'); renderEditor(); }) : null,
    h('span', { class: 'divider' }),
    tool('Ketik', 'kbd', () => { state.view = 'ketik'; d.mode = 'ketik'; changed(); renderEditor(); }, { on: state.view === 'ketik' }),
    tool('Tulis', 'write', () => {
      if (!hasInk(d)) { toast('Tulis tangan di web segera hadir. Untuk sekarang, pakai aplikasi Android.'); return; }
      state.view = 'tulis'; renderEditor();
    }, { on: state.view === 'tulis' }),
    tool('Checklist', 'checklist', addChecklist),
    h('span', { class: 'divider' }),
    h('button', { class: 'tool', onclick: detailsDialog }, h('span', { class: `sw c-${d.color}` }), 'Warna kartu'),
    tool(d.pinned ? 'Disematkan' : 'Sematkan', 'pin', () => { d.pinned = !d.pinned; changed(); renderEditor(); }, { on: d.pinned }),
    h('button', { class: 'tool', onclick: (e) => editorMenu(e.currentTarget) }, icon('more'), 'Lainnya'),
  );
  const save = h('button', { class: 'save', 'aria-label': 'Simpan', title: 'Simpan', onclick: () => closeEditor() }, icon('check'));
  const title = h('input', {
    class: `title-in c-${d.color}`, value: d.title, placeholder: 'Judul catatan', 'aria-label': 'Judul catatan',
    oninput: (e) => { d.title = e.target.value; changed(); },
  });
  const scroller = h('div', { class: 'pages-scroll' });
  const wrap = h('div', { class: `edit-wrap c-${d.color}` });
  if (state.view === 'tulis' && hasInk(d)) {
    wrap.append(h('div', { class: 'notice' }, 'Tulisan tangan dari aplikasi Android ditampilkan di sini. Menulis dengan pena di web segera hadir; kartu checklist tetap bisa diubah.'));
  }
  wrap.append(scroller);
  editorPane.replaceChildren(h('div', { class: 'toolbar' }, tools, save), title, wrap);
  requestAnimationFrame(() => layoutPages(scroller));
}

let resizeObs;
function layoutPages(scroller) {
  const d = state.draft;
  if (!d) return;
  const avail = scroller.clientWidth;
  const pageW = Math.min(avail - 32, 820);
  const scale = pageW / INK_WIDTH;
  const pageH = INK_HEIGHT * scale;
  scroller.replaceChildren();

  if (state.view === 'tulis' && hasInk(d)) {
    const stack = h('div', { class: 'inkstack' });
    d.pages.forEach((p, i) => {
      const pg = h('div', { class: 'inkpage', style: { width: pageW + 'px', height: pageH + 'px' } }, pageSvg(p, d.paper));
      p.cards.forEach((c) => pg.append(cardEl(c, i, scale, pageH, 0)));
      if (d.pages.length > 1) pg.append(h('div', { class: 'pageno' }, `${i + 1} / ${d.pages.length}`));
      stack.append(pg);
    });
    scroller.append(stack);
  } else {
    const sheet = h('div', { class: 'sheet typed' });
    const ta = h('textarea', {
      value: d.body, placeholder: 'Tulis apa saja…', 'aria-label': 'Isi catatan', spellcheck: true,
      oninput: (e) => { d.body = e.target.value; changed(); fit(); },
    });
    sheet.append(ta);
    scroller.append(sheet);
    const cardsLayer = [];
    const fit = () => {
      ta.style.height = '0px';
      const textH = ta.scrollHeight;
      const needed = Math.min(MAX_TYPE_PAGES, Math.ceil((textH + LINE_H * 2) / pageH));
      while (d.pages.length < needed) d.pages.push(blankPage());
      const total = d.pages.length * pageH;
      Object.assign(sheet.style, { width: pageW + 'px', height: total + 'px' });
      ta.style.height = total + 'px';
      sheet.querySelectorAll('.pagebreak').forEach((e) => e.remove());
      for (let k = 1; k < d.pages.length; k++) sheet.append(h('div', { class: 'pagebreak', style: { top: k * pageH + 'px' } }));
      if (cardsLayer.length !== d.pages.reduce((a, p) => a + p.cards.length, 0)) drawCards();
    };
    const drawCards = () => {
      cardsLayer.splice(0).forEach((e) => e.remove());
      d.pages.forEach((p, i) => p.cards.forEach((c) => { const e = cardEl(c, i, scale, pageH, i * pageH); cardsLayer.push(e); sheet.append(e); }));
    };
    Object.assign(sheet.style, { width: pageW + 'px' });
    fit();
    drawCards();
  }
  resizeObs?.disconnect();
  let lastW = scroller.clientWidth;
  resizeObs = new ResizeObserver(() => {
    if (Math.abs(scroller.clientWidth - lastW) > 2) { lastW = scroller.clientWidth; layoutPages(scroller); }
  });
  resizeObs.observe(scroller);
}

/** Kartu checklist di lembar. Posisi disimpan dalam koordinat logis (sama dengan Android). */
function cardEl(card, pageIndex, scale, pageH, offsetTop) {
  const d = state.draft;
  const el = h('div', { class: 'ck' });
  const place = () => Object.assign(el.style, { left: card.x * scale + 'px', top: offsetTop + card.y * scale + 'px' });
  const counter = h('small');
  const updateCounter = () => {
    const filled = card.items.filter((i) => i.t.trim());
    counter.textContent = filled.length ? `${filled.filter((i) => i.d).length}/${filled.length}` : '';
  };
  const removeCard = () => {
    const pg = d.pages[pageIndex];
    pg.cards = pg.cards.filter((c) => c !== card);
    changed(); el.remove();
  };
  const titleIn = h('input', { value: card.title, placeholder: 'Checklist', 'aria-label': 'Judul checklist', oninput: (e) => { card.title = e.target.value; changed(); } });
  const head = h('div', { class: 'ck-h' }, h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'), titleIn, counter,
    h('button', { class: 'ck-x', 'aria-label': 'Hapus checklist', onclick: removeCard }, icon('close')));
  const body = h('div', { class: 'ck-body' });
  const drawItems = (focusIndex) => {
    body.replaceChildren(...card.items.map((item, i) => {
      const input = h('input', {
        value: item.t, placeholder: 'Item baru', class: item.d ? 'done' : '',
        oninput: (e) => { item.t = e.target.value; changed(); updateCounter(); },
        onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); card.items.splice(i + 1, 0, { t: '', d: false }); changed(); drawItems(i + 1); }
          if (e.key === 'Backspace' && !item.t && card.items.length > 1) { e.preventDefault(); card.items.splice(i, 1); changed(); drawItems(Math.max(0, i - 1)); }
        },
      });
      return h('div', { class: 'ck-row' },
        h('button', {
          class: 'box' + (item.d ? ' on' : ''), role: 'checkbox', 'aria-checked': item.d, 'aria-label': item.d ? 'Batal centang' : 'Centang',
          onclick: () => { item.d = !item.d; changed(); drawItems(); updateCounter(); },
        }, h('i', {}, item.d ? '✓' : '')),
        input,
        h('button', { class: 'ck-x', 'aria-label': 'Hapus item', onclick: () => { card.items.splice(i, 1); changed(); drawItems(); updateCounter(); } }, icon('close')));
    }), h('button', { class: 'ck-add', onclick: () => { card.items.push({ t: '', d: false }); changed(); drawItems(card.items.length - 1); } }, '+ Tambah item'));
    if (focusIndex != null) body.querySelectorAll('.ck-row input')[focusIndex]?.focus();
  };
  // Geser lewat bilah atas kartu, tetap di dalam lembarnya.
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button')) return;
    e.preventDefault();
    head.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    const sx = e.clientX, sy = e.clientY, ox = card.x, oy = card.y;
    const maxX = INK_WIDTH - CARD_W / scale;
    const maxY = INK_HEIGHT - el.offsetHeight / scale;
    const move = (ev) => {
      card.x = Math.max(0, Math.min(maxX, ox + (ev.clientX - sx) / scale));
      card.y = Math.max(0, Math.min(maxY, oy + (ev.clientY - sy) / scale));
      place();
    };
    const up = () => {
      el.classList.remove('drag');
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      changed();
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  });
  el.append(head, body);
  place();
  drawItems();
  updateCounter();
  el.dataset.cardId = card.id;
  return el;
}

function addChecklist() {
  const d = state.draft;
  const scroller = editorPane.querySelector('.pages-scroll');
  const pageW = Math.min(scroller.clientWidth - 32, 820);
  const scale = pageW / INK_WIDTH;
  const stride = INK_HEIGHT * scale + (state.view === 'tulis' && hasInk(d) ? PAGE_GAP : 0);
  // Diletakkan di lembar yang sedang terlihat, sedikit di bawah tepi atas layar.
  const page = Math.min(d.pages.length - 1, Math.max(0, Math.floor(scroller.scrollTop / stride)));
  const y = Math.max(40, Math.min(INK_HEIGHT - 400, (scroller.scrollTop - page * stride) / scale + 60));
  const card = newCard(INK_WIDTH - CARD_W / scale - 40, y);
  d.pages[page].cards.push(card);
  changed();
  layoutPages(scroller);
  const el = scroller.querySelector(`[data-card-id="${card.id}"] .ck-row input`);
  el?.focus();
}

function detailsDialog() {
  const d = state.draft;
  openDialog((box, close) => {
    const render = () => box.replaceChildren(
      h('h2', {}, 'Warna kartu'),
      h('p', {}, 'Warna kartu catatan ini di daftar catatan.'),
      h('div', { class: 'swatches', style: { display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '4px 0 8px' } },
        ...CARD_COLORS.map((c) => h('button', {
          class: `swatch c-${c.key}` + (c.key === d.color ? ' on' : ''), title: c.label, 'aria-label': `Warna ${c.label}`,
          style: { width: '44px', height: '44px' },
          onclick: () => { d.color = c.key; changed(); renderEditor(); render(); },
        }))),
      h('div', { class: 'label' }, 'Kategori'),
      h('div', { class: 'choice' }, ...state.spaces.map((s) => h('button', {
        class: 'pill' + (s === d.space ? ' on' : ''), onclick: () => { d.space = s; changed(); render(); },
      }, s))),
      h('div', { class: 'btns' }, h('button', { class: 'btn-primary', onclick: close }, 'Selesai')),
    );
    render();
  });
}

function editorMenu(anchor) {
  const d = state.draft;
  openMenu(anchor, (m, close) => {
    m.append(
      menuItem('Ekspor catatan ini', 'share', () => { close(); exportDialog(d); }),
      !state.isNew ? menuItem('Hapus catatan', 'trash', () => {
        close();
        confirmDialog('Hapus catatan ini?', 'Catatan yang dihapus tidak bisa dikembalikan.', 'Hapus', () => {
          const id = d.id;
          clearTimeout(saveTimer);
          state.draft = null;
          showEditor(false);
          if (history.state?.editor) history.back();
          deleteNoteById(id);
        });
      }, 'danger') : null,
    );
  });
}

// ---------- mulai ----------

async function start() {
  if (!localStorage.getItem('lembar.firstSeen')) localStorage.setItem('lembar.firstSeen', Date.now());
  const [notes, spaces, seeded] = await Promise.all([db.allNotes(), db.getMeta('spaces'), db.getMeta('seeded')]);
  state.notes = notes || [];
  if (Array.isArray(spaces) && spaces.length) state.spaces = spaces;
  if (!seeded && !state.notes.length) {
    state.notes = sampleNotes();
    await db.putMany(state.notes);
  }
  if (!seeded) await db.setMeta('seeded', true);
  await ensureSpaces();
  buildListPane();
  renderList();

  window.addEventListener('popstate', () => { if (state.draft) closeEditor({ fromHistory: true }); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  // Simpan draft saat tab disembunyikan atau ditutup.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.draft && state.dirty && !isEmpty(state.draft)) {
      clearTimeout(saveTimer);
      state.dirty = false;
      saveNote(state.draft).then((r) => { if (r === 'created') state.isNew = false; });
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.draft && !document.querySelector('.dim, .menu')) closeEditor();
  });
  // Minta browser tidak menghapus data saat penyimpanan hampir penuh.
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

start().catch((e) => {
  console.error(e);
  document.body.append(h('div', { class: 'empty', style: { padding: '40px 20px' } },
    'Lembar tidak bisa membuka penyimpanan browser.\nPastikan browser tidak dalam mode penyamaran yang memblokir penyimpanan, lalu muat ulang halaman.'));
});
