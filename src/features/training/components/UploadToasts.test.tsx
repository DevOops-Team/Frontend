import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastViewport } from '@astryxdesign/core/Toast';
import type { PendingUpload, UploadState } from '../lib/uploadQueue';

// 업로드 큐 대신 상태를 직접 바꾸는 가짜 store.
const store = vi.hoisted(() => {
  let items: PendingUpload[] = [];
  const listeners = new Set<() => void>();
  return {
    subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
    list: () => items,
    set(next: PendingUpload[]) { items = next; listeners.forEach((l) => l()); },
  };
});
vi.mock('../uploads', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useUploads: () => useSyncExternalStore(store.subscribe, store.list) };
});

const { UploadToasts } = await import('./UploadToasts');

function upload(key: string, state: UploadState, extra: Partial<PendingUpload> = {}): PendingUpload {
  return {
    key, state, loaded: 0, total: 10, startedAt: 0, updatedAt: 0,
    summary: { name: `run-${key}`, strategy: 'ddp', gpus: 1, model: { folder: 'm', count: 1, bytes: 1 }, data: { count: 1, bytes: 1 }, train: { name: 'train.py', bytes: 1 } },
    ...extra,
  };
}

describe('UploadToasts (GPU-302)', () => {
  it('toasts when an upload starts, finishes and fails, but not for uploads that were already there', async () => {
    store.set([upload('old', 'done', { jobId: 'j0' })]);
    const onOpenJob = vi.fn();
    render(<ToastViewport position="bottomStart"><UploadToasts onOpenJob={onOpenJob} /></ToastViewport>);
    expect(screen.queryByText(/run-old/)).not.toBeInTheDocument();

    act(() => store.set([upload('old', 'done', { jobId: 'j0' }), upload('a', 'uploading'), upload('b', 'uploading')]));
    expect((await screen.findAllByText('run-a: S3 업로드를 시작했어요'))[0]).toBeInTheDocument();

    act(() => store.set([upload('old', 'done', { jobId: 'j0' }), upload('a', 'done', { jobId: 'j1' }), upload('b', 'failed', { error: 'network' })]));
    expect((await screen.findAllByText('run-a: S3 업로드를 마치고 학습을 만들었어요'))[0]).toBeInTheDocument();
    expect((await screen.findAllByText('run-b: S3 업로드에 실패했어요 (network)'))[0]).toBeInTheDocument();

    // jsdom은 popover 최상위 층을 열린 것으로 보지 않아 hidden으로 찾는다.
    await userEvent.click(screen.getByRole('button', { name: '상세 보기', hidden: true }));
    expect(onOpenJob).toHaveBeenCalledWith('j1');
  });
});
