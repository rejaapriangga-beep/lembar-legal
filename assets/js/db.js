// Penyimpanan di browser (IndexedDB). Semua catatan hanya ada di perangkat ini.

const DB_NAME = 'lembar';
const VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const allNotes = () => tx('notes', 'readonly', (s) => s.getAll());
export const putNote = (note) => tx('notes', 'readwrite', (s) => s.put(note));
export const deleteNote = (id) => tx('notes', 'readwrite', (s) => s.delete(id));
export const replaceAll = (notes) => tx('notes', 'readwrite', (s) => { s.clear(); notes.forEach((n) => s.put(n)); });
export const putMany = (notes) => tx('notes', 'readwrite', (s) => { notes.forEach((n) => s.put(n)); });
export const getMeta = (key) => tx('meta', 'readonly', (s) => s.get(key));
export const setMeta = (key, value) => tx('meta', 'readwrite', (s) => s.put(value, key));
