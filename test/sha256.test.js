import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sha256, hmacSha256 } from '../src/net/sha256.js';

const enc = new TextEncoder();
const hex = (b) => Buffer.from(b).toString('hex');

test('plain-JS SHA-256 matches node:crypto', () => {
  for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'fox and fiddle '.repeat(40)]) {
    assert.equal(hex(sha256(enc.encode(s))), crypto.createHash('sha256').update(s).digest('hex'), JSON.stringify(s.slice(0, 10)));
  }
});

test('plain-JS HMAC-SHA256 matches node:crypto (short and long keys)', () => {
  for (const key of ['k', 'a3f9'.repeat(16), 'long-key-'.repeat(20)]) {
    for (const msg of ['client:1:0', 'seed:42:3', '']) {
      assert.equal(hex(hmacSha256(enc.encode(key), enc.encode(msg))), crypto.createHmac('sha256', key).update(msg).digest('hex'));
    }
  }
});
