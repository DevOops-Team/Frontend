import { describe, expect, it } from 'vitest';
import { CHUNK_BYTES, hashFile } from './sha256';

// 기준값은 WebCrypto(hash-wasm과 다른 구현)
const hex = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b.slice()))).map((x) => x.toString(16).padStart(2, '0')).join('');

describe('hashFile', () => {
  it('hashes the whole file and, past one part, every part', async () => {
    const bytes = new Uint8Array(2 * CHUNK_BYTES + 5).map((_, i) => i % 251);
    const h = await hashFile(new Blob([bytes]), () => false, CHUNK_BYTES);
    expect(h.sha256).toBe(await hex(bytes));
    expect(h.parts).toEqual([await hex(bytes.subarray(0, CHUNK_BYTES)), await hex(bytes.subarray(CHUNK_BYTES, 2 * CHUNK_BYTES)), await hex(bytes.subarray(2 * CHUNK_BYTES))]);
  });

  it('gives no parts for a file of one part', async () => {
    const h = await hashFile(new Blob(['abc']), () => false, CHUNK_BYTES);
    expect(h).toEqual({ sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
  });
});
