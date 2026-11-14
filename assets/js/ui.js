// Helper kecil untuk membangun DOM tanpa framework.

export function h(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    // value/checked dipasang sebagai properti: textarea tidak membaca atribut value.
    else if (k === 'value' || k === 'checked' || (k in e && typeof v !== 'string')) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

const PATHS = {
  back: 'M20 12H5M11 6l-6 6 6 6',
  more: '',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l4.5 4.5',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  pin: 'M9 3h6M10 3v6l-3 4h10l-3-4V3M12 13v8',
  kbd: 'M3 6h18v12H3zM7 10h1M11 10h1M15 10h1M7 14h10',
  write: 'M4 20l1-5L16 4l4 4L9 19zM14 6l4 4',
  checklist: 'M4 5h5v5H4zM5.5 7.5l1 1 1.5-2M4 14h5v5H4zM12 7.5h8M12 16.5h8',
  sidebar: 'M3 5h18v14H3zM9 5v14M5 9h2M5 12h2',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  share: 'M12 15V3M7 8l5-5 5 5M5 14v6h14v-6',
  save: 'M12 3v12M7 10l5 5 5-5M5 19h14',
  restore: 'M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8M4 3v5h5',
  tune: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  folder: 'M3 6h6l2 2h10v11H3z',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  install: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  phone: 'M7 2h10v20H7zM11 18h2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeoff: 'M3 3l18 18M10.6 6.2A10 10 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.8M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 004.4-1.1M9.9 9.9a3 3 0 004.2 4.2',
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'i');
  if (name === 'more') {
    for (const y of [5, 12, 19]) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', 12); c.setAttribute('cy', y); c.setAttribute('r', 1.8);
      c.setAttribute('fill', 'currentColor'); c.setAttribute('stroke', 'none');
      svg.append(c);
    }
    return svg;
  }
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', PATHS[name] || '');
  svg.append(p);
  return svg;
}

let toastTimer;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}

/** Menu melayang di dekat [anchor]. [build] mengisi menu dan menerima fungsi close. */
export function openMenu(anchor, build) {
  closeMenu();
  const scrim = h('div', { class: 'scrim', onclick: closeMenu });
  const menu = h('div', { class: 'menu', role: 'menu' });
  document.body.append(scrim, menu);
  build(menu, closeMenu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = Math.min(r.right - mw, window.innerWidth - mw - 8);
  left = Math.max(8, left);
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  Object.assign(menu.style, { left: left + 'px', top: top + 'px' });
  menu.querySelector('button, a')?.focus({ preventScroll: true });
}

export function closeMenu() {
  document.querySelectorAll('.menu, .scrim').forEach((e) => e.remove());
}

export const menuItem = (label, iconName, onClick, cls) =>
  h('button', { role: 'menuitem', class: cls, onclick: onClick }, iconName ? icon(iconName) : null, label);

/** Dialog modal. [build] mengisi isi dialog dan menerima fungsi close. Esc menutup. */
export function openDialog(build, { dismissable = true } = {}) {
  const dim = h('div', { class: 'dim' });
  const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' });
  dim.append(box);
  const close = () => { dim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  dim.addEventListener('mousedown', (e) => { if (e.target === dim && dismissable) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(dim);
  build(box, close);
  box.querySelector('input, button')?.focus();
  return close;
}

export function confirmDialog(title, text, okLabel, onOk, danger = true) {
  openDialog((box, close) => {
    box.append(
      h('h2', {}, title),
      h('p', {}, text),
      h('div', { class: 'btns' },
        h('button', { onclick: close }, 'Batal'),
        h('button', { class: danger ? 'btn-danger' : 'btn-primary', onclick: () => { close(); onOk(); } }, okLabel)),
    );
  });
}

export function timeAgo(t) {
  const d = Date.now() - t;
  const m = Math.floor(d / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const hr = Math.floor(m / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function greeting() {
  const hr = new Date().getHours();
  if (hr < 11) return 'Selamat pagi';
  if (hr < 15) return 'Selamat siang';
  if (hr < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function download(name, text, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Bagikan berkas lewat menu bagikan sistem (HP); false kalau browser tidak mendukung. */
export async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: name });
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  }
  return true;
}
