import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Job, TrainedModel } from '../types';
import { TrainedModelPanel } from './TrainedModel';

function job(over: Partial<Job>): Job {
  return {
    id: '0cb3b0c3', name: 'qwen', model: 'Qwen2-0.5B', strategy: 'fsdp', gpus: 2, status: 'SUCCEEDED', generation: 2,
    jobsetName: 'job-0cb3b0c3-g0002', queue: 'queue-light', cluster: 'eks-a', phase: 'Succeeded', recoveryCount: 1,
    createdAt: '2026-11-13T00:14:03Z', updatedAt: '2026-11-13T00:14:58Z', progress: null, ...over,
  };
}

const trained: TrainedModel = {
  jobId: '0cb3b0c3', generation: 2, step: 694, format: 'fsdp-dcp', worldSize: 2, sizeBytes: 3 * 1024 ** 3,
  approvedAt: '2026-11-13T01:00:00Z',
  files: [{ name: '.metadata', size: 2048, sha256: 'aa' }, { name: '__0_0.distcp', size: 1024 ** 3, sha256: 'bb' }],
};

function respond(...bodies: { status: number; body: unknown }[]) {
  const fetchMock = vi.fn();
  for (const b of bodies) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(b.body), { status: b.status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('TrainedModelPanel (GPU-190)', () => {
  it('waits for the training to finish without calling the API', () => {
    const fetchMock = respond();
    render(<TrainedModelPanel job={job({ status: 'RUNNING' })} />);
    expect(screen.getByText(/학습이 끝나면/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says a failed job leaves no model', () => {
    respond();
    render(<TrainedModelPanel job={job({ status: 'FAILED' })} />);
    expect(screen.getByText(/내려받을 모델이 없습니다/)).toBeInTheDocument();
  });

  it('shows the final checkpoint with a zip link and one link per file', async () => {
    const fetchMock = respond({ status: 200, body: trained });
    render(<TrainedModelPanel job={job({})} />);
    expect(await screen.findByText('step 694')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/0cb3b0c3/model');
    expect(screen.getByRole('link', { name: /모델 내려받기/ })).toHaveAttribute('href', '/api/jobs/0cb3b0c3/model/archive');
    expect(screen.getByRole('link', { name: '__0_0.distcp 내려받기' })).toHaveAttribute('href', '/api/jobs/0cb3b0c3/model/files/__0_0.distcp');
    expect(screen.getByText('3.00 GB')).toBeInTheDocument();
  });

  it('treats 404 as no approved checkpoint, not an error', async () => {
    respond({ status: 404, body: { error: 'no approved checkpoint', code: 'NOT_FOUND' } });
    render(<TrainedModelPanel job={job({})} />);
    expect(await screen.findByText(/승인된 체크포인트가 없어/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error and loads again on retry', async () => {
    respond({ status: 502, body: { error: 'get checkpoint manifest failed: AccessDenied', code: 'UPSTREAM' } }, { status: 200, body: trained });
    render(<TrainedModelPanel job={job({})} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('AccessDenied');
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText('step 694')).toBeInTheDocument();
  });
});
