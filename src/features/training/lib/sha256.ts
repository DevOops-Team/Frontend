import { createSHA256 } from 'hash-wasm';

// 파일 SHA-256 (GPU-278). S3 presigned PUT에 서명해 넣어 S3가 올린 내용을 검증한다.
// WebCrypto digest는 파일 전체를 메모리에 올려야 해서(모델 최대 2GiB) 8MiB씩 읽어 이어서 계산한다.
// partBytes를 주면 multipart 조각마다의 SHA-256도 같이 계산한다(한 번만 읽음). partBytes는 8MiB의 배수.
export const CHUNK_BYTES = 8 << 20;

export interface FileHash { sha256: string; parts?: string[] }

export async function hashFile(file: Blob, isAborted: () => boolean, partBytes?: number): Promise<FileHash> {
  if (partBytes !== undefined && partBytes % CHUNK_BYTES !== 0) throw new Error('partBytes must be a multiple of 8MiB');
  const whole = await createSHA256();
  whole.init();
  const split = partBytes !== undefined && file.size > partBytes;
  const part = split ? await createSHA256() : null;
  part?.init();
  const parts: string[] = [];
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    if (isAborted()) throw new DOMException('aborted', 'AbortError');
    const chunk = new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
    whole.update(chunk);
    if (part && partBytes) {
      part.update(chunk);
      const end = offset + chunk.length;
      if (end % partBytes === 0 || end === file.size) { parts.push(part.digest('hex')); part.init(); }
    }
  }
  return split ? { sha256: whole.digest('hex'), parts } : { sha256: whole.digest('hex') };
}
