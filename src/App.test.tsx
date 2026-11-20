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

// 목록 · POST stop을 흉내 내는 fetch. 중단한 학습은 다음 목록에서 STOPPING이 된다.
function stopBackend(jobs: Job[], fail?: { status: number; body: object }) {
  let list = jobs;
  const stopped: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.endsWith('/stop')) {
      if (fail) return new Response(JSON.stringify(fail.body), { status: fail.status });
      const id = url.split('/').at(-2) as string;
      stopped.push(id);
      list = list.map((j) => j.id === id ? { ...j, status: 'STOPPING' as const } : j);
      return new Response(null, { status: 202 });
    }
    return new Response(JSON.stringify({ items: list }), { status: 200 });
  }));
  return stopped;
}

describe('job list stop (GPU-204)', () => {
  it('stops a running job after confirmation and shows it as stopping', async () => {
    const stopped = stopBackend([job('aa', 'done-one', 'SUCCEEDED'), job('cc', 'busy', 'RUNNING')]);
    render(<App />);
    await screen.findByText('busy');
    expect(screen.queryByRole('button', { name: 'done-one 중단' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'busy 중단' }));
    const dialog = screen.getByText("'busy' 학습을 중단할까요?").closest('dialog') as HTMLElement;
    expect(within(dialog).getByText(/아직 저장된 체크포인트가 없어/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '중단' }));

    expect(stopped).toEqual(['cc']);
    expect(await screen.findByText('중단 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'busy 중단' })).not.toBeInTheDocument();
  });

  it('disables stop while the job is moved to another GPU', async () => {
    stopBackend([job('rr', 'moving', 'RECOVERING')]);
    render(<App />);
    await screen.findByText('moving');
    expect(screen.getByRole('button', { name: 'moving 중단' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the dialog open with the reason when the stop fails', async () => {
    stopBackend([job('cc', 'busy', 'RUNNING')], { status: 409, body: { error: 'the job has already ended (status SUCCEEDED)', code: 'FINISHED' } });
    render(<App />);
    await screen.findByText('busy');
    await userEvent.click(screen.getByRole('button', { name: 'busy 중단' }));
    await userEvent.click(within(screen.getByText("'busy' 학습을 중단할까요?").closest('dialog') as HTMLElement).getByRole('button', { name: '중단' }));
    expect(await screen.findByText(/중단하지 못했습니다: the job has already ended/)).toBeInTheDocument();
  });
});

// 목록 · POST restart를 흉내 내는 fetch. 재개한 학습은 다음 목록에서 QUEUED가 된다.
function restartBackend(jobs: Job[], fail?: { status: number; body: object }) {
  let list = jobs;
  const restarted: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.endsWith('/restart')) {
      if (fail) return new Response(JSON.stringify(fail.body), { status: fail.status });
      const id = url.split('/').at(-2) as string;
      restarted.push(id);
      list = list.map((j) => j.id === id ? { ...j, status: 'QUEUED' as const } : j);
      return new Response(null, { status: 202 });
    }
    return new Response(JSON.stringify({ items: list }), { status: 200 });
  }));
  return restarted;
}

describe('job list restart (GPU-240)', () => {
  it('restarts a stopped job after confirmation and shows it queued again', async () => {
    const restarted = restartBackend([job('aa', 'done-one', 'SUCCEEDED'), job('cc', 'paused', 'CANCELLED'), job('rr', 'busy', 'RUNNING')]);
    render(<App />);
    await screen.findByText('paused');
    expect(screen.queryByRole('button', { name: 'done-one 재개' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'busy 재개' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'paused 재개' }));
    const dialog = screen.getByText("'paused' 학습을 재개할까요?").closest('dialog') as HTMLElement;
    expect(within(dialog).getByText(/저장된 체크포인트가 없으면 처음부터/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '재개' }));

    expect(restarted).toEqual(['cc']);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'paused 재개' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'paused 중단' })).toBeInTheDocument();
  });

  it('keeps the dialog open with the reason when the restart fails', async () => {
    restartBackend([job('cc', 'paused', 'CANCELLED')], { status: 409, body: { error: 'the job is still stopping', code: 'STOPPING' } });
    render(<App />);
    await screen.findByText('paused');
    await userEvent.click(screen.getByRole('button', { name: 'paused 재개' }));
    await userEvent.click(within(screen.getByText("'paused' 학습을 재개할까요?").closest('dialog') as HTMLElement).getByRole('button', { name: '재개' }));
    expect(await screen.findByText(/재개하지 못했습니다: the job is still stopping/)).toBeInTheDocument();
  });
});
