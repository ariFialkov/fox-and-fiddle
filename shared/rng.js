/**
 * Provably-fair RNG: floats derived from HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${block}`).
 * The server publishes sha256(serverSeed) up front and reveals the seed when it is rotated,
 * so every round can be re-derived and audited.
 *
 * `hmac(keyString, messageString)` must return a Uint8Array/Buffer of 32 bytes.
 * It is injected so the same module works with node:crypto (sync) and WebCrypto (async).
 */
import { bytesToFloat } from './outcomes.js';

export async function rollFloats(hmac, serverSeed, clientSeed, nonce, count) {
  const out = [];
  let block = 0;
  while (out.length < count) {
    const digest = await hmac(serverSeed, `${clientSeed}:${nonce}:${block}`);
    for (let off = 0; off + 4 <= digest.length && out.length < count; off += 4) {
      out.push(bytesToFloat(digest, off));
    }
    block++;
  }
  return out;
}
