import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobList } from './JobList';
import type { Job } from '../api';

const running: Job = {
  id: 'abc123',
  name: 'job-abc123',
  phase: 'Running',
  cluster: 'devoops-a',
  restarts: 1,
  createdAt: '2026-10-27T10:00:00Z',
  progress: {
    status: 'RUNNING',
    step: 1500,
    totalSteps: 5000,
    loss: 0.4213,
    lastCheckpointStep: 1000,
    nodeName: 'ip-10-0-1-2',
    updatedAt: 1730000000000,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('JobList', () => {
  it('shows the cluster MultiKueue picked and the queue phase', () => {
    render(<JobList jobs={[running]} />);

    expect(screen.getByText('devoops-a')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows step progress, loss, last checkpoint and node', () => {
    render(<JobList jobs={[running]} />);

    expect(screen.getByRole('progressbar', { name: 'abc123 진행률' })).toHaveAttribute('value', '1500');
    expect(screen.getByText('1500 / 5000')).toBeInTheDocument();
    expect(screen.getByText('0.4213')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('ip-10-0-1-2')).toBeInTheDocument();
  });

  it('shows restarts so recovery after a node loss is visible', () => {
    render(<JobList jobs={[running]} />);

    expect(screen.getByText('재시작 1회')).toBeInTheDocument();
  });

  it('marks jobs that have not reported progress yet', () => {
    render(<JobList jobs={[{ ...running, phase: 'Pending', cluster: undefined, progress: null }]} />);

    expect(screen.getByText('진행 기록 없음')).toBeInTheDocument();
    expect(screen.getByText('미배정')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    render(<JobList jobs={[]} />);

    expect(screen.getByText('제출된 작업이 없습니다')).toBeInTheDocument();
  });

  it('opens the submitted files of a job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/files')
          ? new Response(JSON.stringify([{ kind: 'code', name: 'job.yaml', size: 12 }]))
          : new Response('kind: JobSet', { headers: { 'X-Truncated': 'false', 'X-Total-Size': '12' } }),
      ),
    );
    render(<JobList jobs={[running]} />);

    await userEvent.click(screen.getByRole('button', { name: 'abc123 파일 보기' }));

    expect(await screen.findByText('kind: JobSet')).toBeInTheDocument();
  });
});
