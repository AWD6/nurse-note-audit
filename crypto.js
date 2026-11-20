// PDPA-Safe Asymmetric Encryption for Patient HN
// - Anyone (nurses/auditors) can encrypt HN using the RSA-OAEP-256 Public Key (cannot decrypt).
// - Only Admin with the Admin Passphrase can unwrap the RSA Private Key in RAM to decrypt HN.
// - Plaintext HN is NEVER stored in Google Sheets or localStorage.

const PUBLIC_JWK = {
  kty: 'RSA',
  alg: 'RSA-OAEP-256',
  ext: true,
  key_ops: ['encrypt'],
  n: 'pQ7DrFo6rCNJfNCzu0ss-wHdD-qmXV1mz3hB0SPAHn4XJeiSEvIk0jg8NrFUsAj50g6kFkrKV-BvvMsDYZADsiujtUfnhUKGDvUCuwoRQaPvmWsKxnnGBXwoPYmaWHwfwSNNDT92rGipmKjnQjEIXCUncXKn9iXkmZH0MD-_X0SaETHosk0jCSRkINgZxyoR0Sc3PQnJ6zyu70Xn5E9DD60Scd9IVuvCIaM5av0F-BSBkXgp_D6dxkqEDynbCmFNfhFlYNGVmI3JnCWHatJm2LHwf4WVuPUaEnD6yaZd4q8dyYzdFKm0GBjHdyYMfb-vkSExi6i7gjp8W4weLSWpNQ',
  e: 'AQAB',
};

const WRAPPED_PRIVATE = {
  saltB64: 'wzMQW5v2AaWNslYnEWyndg==',
  ivB64: 'NyeNb87akHAV1lbZlAOMpg==',
  ctB64:
    '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',
  macB64: 'aax8sSjDaxaQg3weHvCdhxiUB3WD0/MRnzbwX4HuJdc=',
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
