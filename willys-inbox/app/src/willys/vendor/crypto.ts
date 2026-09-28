// Vendored from https://github.com/ErikHellman/willys-agent (MIT, Erik Hellman)
// Local modification: private members made `protected` so this add-on can
// subclass WillysApi to reach undocumented endpoints (stores/offers).
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";

export interface EncryptedCredential {
  key: string;
  str: string;
}

/**
 * Encrypts a credential string using AES-128-CBC with PBKDF2 key derivation.
 * This replicates the client-side encryption used by the Willys website
 * (module 89683 in their JS bundle).
 *
 * Algorithm:
 * 1. Generate random 16-byte IV and 16-byte salt
 * 2. Generate random 16-digit numeric key string
 * 3. Derive AES-128-CBC key using PBKDF2 (SHA-1, 1000 iterations)
 * 4. Encrypt plaintext with AES-128-CBC
 * 5. Return { key, str: base64(hex(iv) + "::" + hex(salt) + "::" + base64(ciphertext)) }
 */
export function encryptCredential(plaintext: string): EncryptedCredential {
  const iv = randomBytes(16);
  const salt = randomBytes(16);

  // Generate a random 16-digit numeric key (like the JS: two 8-digit random number strings)
  const key =
    Math.random().toString().substring(2, 10) +
    Math.random().toString().substring(2, 10);

  // Derive AES key using PBKDF2
  const derivedKey = pbkdf2Sync(key, salt, 1000, 16, "sha1");

  // Encrypt with AES-128-CBC
  const cipher = createCipheriv("aes-128-cbc", derivedKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  // Format: base64(hex(iv) + "::" + hex(salt) + "::" + base64(ciphertext))
  const combined = `${iv.toString("hex")}::${salt.toString("hex")}::${encrypted.toString("base64")}`;
  const str = Buffer.from(combined).toString("base64");

  return { key, str };
}
