import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UploadFile } from '../api';
import type { CreatedJob } from '../types';

// 실제 XHR 대신 테스트가 진행 · 완료 · 취소를 일으키는 가짜 createJob.
const sends: { progress: (sent: number, total: number) => void; resolve: (j: CreatedJob) => void; abort: () => void }[] = [];
vi.mock('../api', async (orig) => {
  const real = await orig<typeof import('../api')>();
  return {
    ...real,
    createJob: (_s: unknown, _m: unknown, _d: unknown, _t: unknown, onProgress: (sent: number, total: number) => void) => {
      let resolve!: (j: CreatedJob) => void;
      let reject!: (e: unknown) => void;
      const done = new Promise<CreatedJob>((res, rej) => { resolve = res; reject = rej; });
      const abort = () => reject(new real.ApiError('업로드를 취소했습니다.', 0, 'ABORTED'));
      sends.push({ progress: onProgress, resolve, abort });
      return { done, abort };
    },
  };
});

const { uploads } = await import('../uploads');
const { UploadPage } = await import('./UploadPage');

const file = (path: string, size: number): UploadFile => ({ path, file: new Blob([new Uint8Array(size)]) });
const start = () => uploads.start({
  name: 'gpt2-demo',
  spec: { name: 'gpt2-demo', strategy: 'ddp', gpus: 1, hyperparameters: {} },
  model: { folder: 'gpt2', files: [file('gpt2/config.json', 1024)] },
  data: [file('a.jsonl', 1024)],
  train: file('train.py', 0),
});

describe('UploadPage', () => {
  it('shows S3 progress and cancels after confirmation, then retries', async () => {
    const key = start();
    render(<UploadPage uploadKey={key} onBack={() => {}} onCreated={() => {}} />);
    act(() => sends.at(-1)?.progress(1024, 2048));
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('S3 업로드 중')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '업로드 취소' }));
    expect(screen.getByText('업로드를 취소할까요?')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: '업로드 취소' }).at(-1) as HTMLElement);
    expect(await screen.findByText('업로드 취소됨')).toBeInTheDocument();
    expect(uploads.get(key)?.state).toBe('cancelled');

    const before = sends.length;
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(sends.length).toBe(before + 1);
    expect(uploads.get(key)?.state).toBe('uploading');
    act(() => sends.at(-1)?.abort());
  });

  it('moves to the created job when the backend accepts it', async () => {
    const key = start();
    const onCreated = vi.fn();
    render(<UploadPage uploadKey={key} onBack={() => {}} onCreated={onCreated} />);
    await act(async () => { sends.at(-1)?.resolve({ id: 'job-42' } as CreatedJob); });
    expect(onCreated).toHaveBeenCalledWith('job-42');
  });

  it('says so when the upload is gone', () => {
    render(<UploadPage uploadKey="missing" onBack={() => {}} onCreated={() => {}} />);
    expect(screen.getByText('업로드를 찾을 수 없습니다')).toBeInTheDocument();
  });
});

