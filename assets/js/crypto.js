// Enkripsi berkas cadangan dengan password. Formatnya sama persis dengan aplikasi Android
// (data/BackupCrypto.kt): PBKDF2-HMAC-SHA256 150.000 iterasi + AES-256-GCM, garam 16 byte,
// IV 12 byte, semuanya base64. Cadangan berpassword dari HP bisa dibuka di web dan sebaliknya.

const ITERATIONS = 150000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  // Per potongan, supaya cadangan besar tidak melampaui batas jumlah argumen fungsi.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(password, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export function isEncrypted(text) {
  try { return JSON.parse(text)?.encrypted === true; } catch { return false; }
}

export async function encrypt(plain, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(password, salt, ITERATIONS), enc.encode(plain));
  return JSON.stringify({
    app: 'lembar', format: 2, encrypted: true, kdf: 'PBKDF2WithHmacSHA256', iter: ITERATIONS,
    salt: b64(salt), iv: b64(iv), data: b64(data),
  });
}

export class WrongPassword extends Error {
  constructor() { super('Password salah.'); }
}

export async function decrypt(text, password) {
  const o = JSON.parse(text);
  if (o.app !== 'lembar') throw new Error('Berkas ini bukan cadangan Lembar.');
  const k = await key(password, unb64(o.salt), o.iter || ITERATIONS);
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, k, unb64(o.data)));
  } catch {
    throw new WrongPassword();
  }
}
