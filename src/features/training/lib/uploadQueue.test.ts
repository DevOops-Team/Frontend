import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Upload, type UploadFile } from '../api';
import type { CreatedJob } from '../types';
import { createUploadQueue, uploadStats, type UploadRequest } from './uploadQueue';

const file = (path: string, size: number): UploadFile => ({ path, file: new Blob([new Uint8Array(size)]) });

const REQUEST: UploadRequest = {
  name: 'gpt2-demo',
  spec: { name: 'gpt2-demo', strategy: 'fsdp', gpus: 2, hyperparameters: {} },
  model: { folder: 'gpt2', files: [file('gpt2/config.json', 10), file('gpt2/model.safetensors', 90)] },
  data: [file('a.jsonl', 30)],
  train: file('train.py', 20),
};

// 가짜 전송: 테스트가 진행 · 완료 · 실패를 직접 일으킨다.
function fakeSend() {
  const calls: { progress: (sent: number, total: number) => void; resolve: (j: CreatedJob) => void; reject: (e: unknown) => void; abort: ReturnType<typeof vi.fn> }[] = [];
  const send = vi.fn((_spec, _model, _data, _train, onProgress: (sent: number, total: number) => void): Upload => {
    let resolve!: (j: CreatedJob) => void;
    let reject!: (e: unknown) => void;
    const done = new Promise<CreatedJob>((res, rej) => { resolve = res; reject = rej; });
    const abort = vi.fn(() => reject(new ApiError('업로드를 취소했습니다.', 0, 'ABORTED')));
    calls.push({ progress: onProgress, resolve, reject, abort });
    return { done, abort };
  });
  return { send, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createUploadQueue', () => {
  it('lists an upload as soon as it starts, with a file summary and no file contents', () => {
    const { send } = fakeSend();
    const q = createUploadQueue(send, () => 1000);
    const key = q.start(REQUEST);
    const [u] = q.list();
    expect(u.key).toBe(key);
    expect(u.state).toBe('uploading');
    expect(u.total).toBe(150);
    expect(u.summary).toEqual({
      name: 'gpt2-demo', strategy: 'fsdp', gpus: 2,
      model: { folder: 'gpt2', count: 2, bytes: 100 }, data: { count: 1, bytes: 30 }, train: { name: 'train.py', bytes: 20 },
    });
    expect(JSON.stringify(u)).not.toContain('Blob');
    expect(q.hasActive()).toBe(true);
  });

  it('submits a fixed S3 dataset with no files (GPU-160)', () => {
    const { send } = fakeSend();
    const q = createUploadQueue(send, () => 1000);
    const dataset = { id: 'qwen25-14b-wikitext103', version: 1 };
    q.start({ name: 'devoops', spec: { name: 'devoops', strategy: 'fsdp', finetune: 'qlora', gpus: 2, hyperparameters: {}, dataset },
      model: { folder: dataset.id, files: [] }, data: [], train: null });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ dataset }), [], [], null, expect.any(Function));
    const [u] = q.list();
    expect(u.total).toBe(0);
    expect(u.summary.dataset).toEqual(dataset);
    expect(u.summary.train).toEqual({ name: '', bytes: 0 });
  });

  it('tracks progress and switches to submitting when every byte is sent', () => {
    const { send, calls } = fakeSend();
    const q = createUploadQueue(send);
    q.start(REQUEST);
    calls[0].progress(40, 160);
    expect(q.list()[0]).toMatchObject({ state: 'uploading', loaded: 40, total: 160 });
    calls[0].progress(160, 160);
    expect(q.list()[0].state).toBe('submitting');
  });

  it('keeps the created job id when the backend accepts the job', async () => {
    const { send, calls } = fakeSend();
    const q = createUploadQueue(send);
    const key = q.start(REQUEST);
    calls[0].resolve({ id: 'job-1' } as CreatedJob);
    await flush();
    expect(q.get(key)).toMatchObject({ state: 'done', jobId: 'job-1' });
    expect(q.hasActive()).toBe(false);
  });

  it('cancels by aborting the request and marks it cancelled, not failed', async () => {
    const { send, calls } = fakeSend();
    const q = createUploadQueue(send);
    const key = q.start(REQUEST);
    q.cancel(key);
    expect(calls[0].abort).toHaveBeenCalledOnce();
    await flush();
    expect(q.get(key)).toMatchObject({ state: 'cancelled' });
    expect(q.get(key)?.error).toBeUndefined();
  });

  it('records the backend error and can retry with the same files', async () => {
    const { send, calls } = fakeSend();
    const q = createUploadQueue(send);
    const key = q.start(REQUEST);
    calls[0].reject(new ApiError('spec이 올바르지 않습니다', 400));
    await flush();
    expect(q.get(key)).toMatchObject({ state: 'failed', error: 'spec이 올바르지 않습니다' });
    q.retry(key);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toBe(REQUEST.model.files);
    expect(q.get(key)).toMatchObject({ state: 'uploading', loaded: 0 });
    expect(q.get(key)?.error).toBeUndefined();
  });

  it('dismisses only finished uploads and notifies subscribers', async () => {
    const { send, calls } = fakeSend();
    const q = createUploadQueue(send);
    const listener = vi.fn();
    q.subscribe(listener);
    const key = q.start(REQUEST);
    q.dismiss(key);
    expect(q.get(key)).toBeDefined();
    q.cancel(key);
    await flush();
    q.dismiss(key);
    expect(q.get(key)).toBeUndefined();
    expect(listener).toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('returns the same snapshot until something changes', () => {
    const { send, calls } = fakeSend();
    const q = createUploadQueue(send);
    q.start(REQUEST);
    const a = q.list();
    expect(q.list()).toBe(a);
    calls[0].progress(1, 160);
    expect(q.list()).not.toBe(a);
  });
});

describe('uploadStats', () => {
  it('derives percent, rate and remaining time from the average speed', () => {
    const s = uploadStats({ loaded: 50, total: 200, startedAt: 0 }, 10_000);
    expect(s).toEqual({ percent: 25, bytesPerSecond: 5, remainingSeconds: 30, elapsedSeconds: 10 });
  });

  it('does not guess a speed in the first second', () => {
    expect(uploadStats({ loaded: 5, total: 200, startedAt: 0 }, 500)).toMatchObject({ bytesPerSecond: null, remainingSeconds: null });
  });
});
