// PDPA-Safe Asymmetric Encryption for Patient HN
// - Anyone (nurses/auditors) can encrypt HN using the RSA-OAEP-256 Public Key (cannot decrypt).
// - Only Admin with the Admin Passphrase can unwrap the RSA Private Key in RAM to decrypt HN.
// - Plaintext HN is NEVER stored in Google Sheets or localStorage.

const PUBLIC_JWK = {
  kty: 'RSA',
  alg: 'RSA-OAEP-256',
  ext: true,
  key_ops: ['encrypt'],
  n: '6SX1pQgX6Ya-W5C081mnIup0beGqmTvQciifS9hOiRLrFPBA2hB0nL7M_f4QXpSO6c6X-DiblfOhge2J01QKxjrJ3dfAOmqrPD5k3YjCkrDLRK_6oaNYFnmIVi-h0MOV4em5H0ojU_HR-TY5-eVf-seD887gZt7We7hMZ9jZGDC2lPaEehNQTx81kkJv0NEw6OcmBbF2RSgjuTJT0aA_ADCznxVmsOgA-JYdkLyNjAxyTkh6E8-Rt9lPBQRQYtZGiA9eXFXgU3emd72knpQ7JOgAf53xHtER46fPxIXSR0U8atkjIhaZBWLknfabdv4mtVKhAw7FLK61Ny5ZcMwDjQ',
  e: 'AQAB',
};

const WRAPPED_PRIVATE = {
  saltB64: '8njFfz/WuOg/ZxTWHgUn7g==',
  ivB64: 'wIBKwxeF9l6uaL8+6td0xw==',
  ctB64:
    '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',
  macB64: 'QBLu3KCpXraOOyYyiiWkjtYofAFhyreo7h2mIXHE7uA=',
  iterations: 200000,
};

let cachedPublicKey = null;
let unlockedPrivateKey = null; // Held ONLY in RAM, never saved to storage

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function generateNurseNoteId(isoDate) {
  const parts = String(isoDate || new Date().toISOString().slice(0, 10)).split('-');
  const beYear = String(Number(parts[0]) + 543).slice(-2);
  const mm = (parts[1] || '01').padStart(2, '0');
  const dd = (parts[2] || '01').padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randBytes = new Uint8Array(4);
  crypto.getRandomValues(randBytes);
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += chars[randBytes[i] % chars.length];
  return `NN-${beYear}${mm}${dd}-${suffix}`;
}

async function getPublicKey() {
  if (!cachedPublicKey) {
    cachedPublicKey = await crypto.subtle.importKey(
      'jwk',
      PUBLIC_JWK,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );
  }
  return cachedPublicKey;
}

export async function encryptHn(plainHn) {
  const clean = String(plainHn || '').trim();
  if (!clean) return '';
  const pub = await getPublicKey();
  const data = new TextEncoder().encode(clean);
  const cipher = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, data);
  return 'ENC:' + bytesToB64(cipher);
}

export function isAdminUnlocked() {
  return Boolean(unlockedPrivateKey);
}

export function lockAdmin() {
  unlockedPrivateKey = null;
}

export async function unlockAdmin(passphrase) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(passphrase || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const salt = b64ToBytes(WRAPPED_PRIVATE.saltB64);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: WRAPPED_PRIVATE.iterations, hash: 'SHA-256' },
    baseKey,
    512
  );
  const derived = new Uint8Array(derivedBits);
  const aesBytes = derived.slice(0, 32);
  const macBytes = derived.slice(32, 64);

  const iv = b64ToBytes(WRAPPED_PRIVATE.ivB64);
  const ct = b64ToBytes(WRAPPED_PRIVATE.ctB64);
  const expectedMac = b64ToBytes(WRAPPED_PRIVATE.macB64);

  // Verify HMAC-SHA256 first (Encrypt-then-MAC)
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    macBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const macInput = new Uint8Array(iv.length + ct.length);
  macInput.set(iv, 0);
  macInput.set(ct, iv.length);
  const macOk = await crypto.subtle.verify('HMAC', hmacKey, expectedMac, macInput);
  if (!macOk) {
    return false;
  }

  // Decrypt RSA Private JWK
  const aesKey = await crypto.subtle.importKey('raw', aesBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ct);
  const privJwk = JSON.parse(new TextDecoder().decode(plainBuf));

  unlockedPrivateKey = await crypto.subtle.importKey(
    'jwk',
    privJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
  return true;
}

export async function decryptHn(hnEncrypted) {
  if (!unlockedPrivateKey || !hnEncrypted || !String(hnEncrypted).startsWith('ENC:')) {
    return '';
  }
  try {
    const cipherBytes = b64ToBytes(String(hnEncrypted).slice(4));
    const plainBuf = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, unlockedPrivateKey, cipherBytes);
    return new TextDecoder().decode(plainBuf);
  } catch {
    return '';
  }
}
