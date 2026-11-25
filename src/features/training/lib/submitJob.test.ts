import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitJob, type UploadFile } from '../api';

// 가짜 XMLHttpRequest: S3 PUT과 마지막 POST /api/jobs(spec만)를 기록하고 바로 성공시킨다.
interface Sent { method: string; url: string; headers: Record<string, string>; body: unknown }
const sent: Sent[] = [];
class FakeXHR {
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  private req: Sent = { method: '', url: '', headers: {}, body: null };
  open(method: string, url: string) { this.req = { method, url, headers: {}, body: null }; }
  setRequestHeader(k: string, v: string) { this.req.headers[k] = v; }
  send(body: unknown) {
    this.req.body = body;
    sent.push(this.req);
    const size = body instanceof Blob ? body.size : 1;
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: size, total: size });
      this.status = this.req.method === 'PUT' ? 200 : 201;
      this.responseText = this.req.method === 'PUT' ? '' : JSON.stringify({ id: 'a1b2c3d4', name: 'gpt2-a1b2c3d4', status: 'QUEUED' });
      this.onload?.();
    });
  }
  abort() { this.onabort?.(); }
}

const file = (path: string, text: string): UploadFile => ({ path, file: new Blob([text]) });
// echo -n 'abc' | sha256sum
const SHA_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

afterEach(() => { sent.length = 0; vi.unstubAllGlobals(); });

describe('submitJob (S3 직접 업로드, GPU-278)', () => {
  it('hashes each file, PUTs it to its presigned URL with the signed header, then submits only the spec', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { files } = JSON.parse(init.body as string) as { files: { path: string; size: number; sha256: string }[] };
      return new Response(JSON.stringify({
        id: 'a1b2c3d4', expiresAt: '2026-11-25T08:00:00Z',
        files: files.map((f) => ({ path: f.path, url: `https://s3.example/${f.path}`, headers: { 'x-amz-checksum-sha256': f.sha256 } })),
      }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const progress: [number, number][] = [];
    const up = submitJob({ strategy: 'fsdp', gpus: 2, hyperparameters: {} },
      [file('gpt2/config.json', 'abc')], [file('a.jsonl', '{"text":"x"}\n')], file('train.py', 'print(1)\n'), (s, t) => progress.push([s, t]));
    const created = await up.done;

    expect(created.id).toBe('a1b2c3d4');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { files: { path: string; size: number; sha256: string }[] };
    expect(fetchMock.mock.calls[0][0]).toBe('/api/uploads');
    expect(body.files.map((f) => f.path)).toEqual(['model/gpt2/config.json', 'data/a.jsonl', 'train/train.py']);
    expect(body.files[0]).toEqual({ path: 'model/gpt2/config.json', size: 3, sha256: SHA_ABC });

    const puts = sent.filter((r) => r.method === 'PUT');
    expect(puts.map((r) => r.url)).toEqual(['https://s3.example/model/gpt2/config.json', 'https://s3.example/data/a.jsonl', 'https://s3.example/train/train.py']);
    expect(puts[0].headers['x-amz-checksum-sha256']).toBe(SHA_ABC);

    const post = sent.find((r) => r.method === 'POST');
    expect(post?.url).toBe('/api/jobs');
    const parts = [...(post?.body as FormData).keys()];
    expect(parts).toEqual(['spec']); // 파일 파트 없음
    const spec = JSON.parse(await ((post?.body as FormData).get('spec') as Blob).text()) as { upload?: { id: string } };
    expect(spec.upload).toEqual({ id: 'a1b2c3d4' });
    // 진행률은 S3로 보낸 바이트만: 전체 = 파일 크기 합(3 + 14 + 9), 해시 계산은 세지 않는다
    const bytes = 3 + '{"text":"x"}\n'.length + 'print(1)\n'.length;
    expect(progress.every(([, t]) => t === bytes)).toBe(true);
    expect(progress.slice(0, -1).every(([s]) => s < bytes)).toBe(true); // PUT이 다 끝나기 전엔 100%가 아님
    expect(progress.at(-1)).toEqual([bytes, bytes]);
  });

  it('falls back to the multipart upload when the backend has no /api/uploads', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('404 page not found', { status: 404 })));
    await submitJob({ strategy: 'fsdp', gpus: 2, hyperparameters: {} }, [file('gpt2/config.json', 'abc')], [file('a.jsonl', '{}\n')], file('train.py', 'x'), () => {}).done;
    expect(sent.filter((r) => r.method === 'PUT')).toHaveLength(0);
    const parts = [...(sent.find((r) => r.method === 'POST')?.body as FormData).keys()];
    expect(parts).toEqual(['spec', 'model/gpt2/config.json', 'data/a.jsonl', 'train/train.py']);
  });

  it('sends only the spec for a fixed S3 dataset (no files)', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await submitJob({ strategy: 'fsdp', gpus: 2, hyperparameters: {}, dataset: { id: 'qwen25-14b-wikitext103', version: 1 } }, [], [], null, () => {}).done;
    expect(fetchMock).not.toHaveBeenCalled();
    expect([...(sent[0].body as FormData).keys()]).toEqual(['spec']);
  });
});
