import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import type { Job } from '@/features/training';

function job(id: string, name: string, status: Job['status']): Job {
  return {
    id, name, model: 'gpt2', strategy: 'ddp', gpus: 1, status, generation: 1, jobsetName: `job-${id}-g0001`, queue: 'queue-light', phase: '',
    recoveryCount: 0, createdAt: '2026-11-17T00:00:00Z', updatedAt: '2026-11-17T00:00:00Z', progress: null,
  };
}

// 목록 · DELETE를 흉내 내는 fetch. 지운 학습은 다음 목록에서 빠진다.
function backend(jobs: Job[], failId?: string) {
  let list = jobs;
  const deleted: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      const id = url.split('/').pop() as string;
      if (id === failId) return new Response(JSON.stringify({ error: 'delete s3://jobs/x/ failed: AccessDenied', code: 'UPSTREAM' }), { status: 502 });
      deleted.push(id);
      list = list.filter((j) => j.id !== id);
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ items: list }), { status: 200 });
  }));
  return deleted;
}

const JOBS = [job('aa', 'done-one', 'SUCCEEDED'), job('bb', 'broken', 'FAILED'), job('cc', 'busy', 'RUNNING')];

describe('job list deletion', () => {
  it('selects only finished jobs with select-all and deletes them after confirmation', async () => {
    const deleted = backend(JOBS);
    render(<App />);
    await screen.findByText('done-one');

    expect(screen.getByRole('checkbox', { name: 'Select busy 선택' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(screen.getByText('2개 선택됨')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '선택 삭제' }));

    const dialog = screen.getByText('학습 2개를 영구 삭제할까요?').closest('dialog') as HTMLElement;
    expect(within(dialog).getByText(/done-one, broken/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '영구 삭제' }));

    expect(await screen.findByText('학습 2개를 삭제했습니다')).toBeInTheDocument();
    expect(deleted.sort()).toEqual(['aa', 'bb']);
    await waitFor(() => expect(screen.queryByText('done-one')).not.toBeInTheDocument());
    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('reports a failed delete and keeps that job selected', async () => {
    backend(JOBS, 'bb');
    render(<App />);
    await screen.findByText('broken');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select broken 선택' }));
    await userEvent.click(screen.getByRole('button', { name: '선택 삭제' }));
    await userEvent.click(screen.getByRole('button', { name: '영구 삭제' }));
    expect(await screen.findByText('1개를 삭제하지 못했습니다')).toBeInTheDocument();
    expect(screen.getByText(/broken: delete s3:\/\/jobs\/x\/ failed: AccessDenied/)).toBeInTheDocument();
    expect(screen.getByText('1개 선택됨')).toBeInTheDocument();
  });
});
