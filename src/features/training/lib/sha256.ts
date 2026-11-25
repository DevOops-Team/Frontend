import { createSHA256 } from 'hash-wasm';

// 파일 SHA-256 (GPU-278). S3 presigned PUT에 서명해 넣어 S3가 올린 내용을 검증한다.
// WebCrypto digest는 파일 전체를 메모리에 올려야 해서(모델 최대 2GiB) 8MiB씩 읽어 이어서 계산한다.
const CHUNK = 8 << 20;

export async function sha256Hex(file: Blob, onBytes: (n: number) => void, isAborted: () => boolean): Promise<string> {
  const hash = await createSHA256();
  hash.init();
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    if (isAborted()) throw new DOMException('aborted', 'AbortError');
    const chunk = new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer());
    hash.update(chunk);
    onBytes(chunk.length);
  }
  return hash.digest('hex');
}
