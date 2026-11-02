import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { JobTimeline } from './JobTimeline';
import { stageOf } from './stages';
import type { JobEvent } from '../api';

function ev(over: Partial<JobEvent>): JobEvent {
  return {
    jobId: 'abc123',
    key: over.key ?? `${over.time}#${over.cluster}#${over.reason}`,
    time: '2026-10-29T02:12:39.000Z',
    lastTime: '2026-10-29T02:12:39.000Z',
    cluster: 'k3s',
    source: 'backend',
    reason: 'Submitted',
    message: '',
    type: 'Normal',
    object: 'JobSet/job-abc123',
    count: 1,
    ...over,
  };
}

const timeline: JobEvent[] = [
  ev({}),
  ev({ source: 'kueue-admission', reason: 'QuotaReserved', time: '2026-10-29T02:12:40.000Z' }),
  ev({ source: 'multikueue', reason: 'Ready', message: 'The workload got reservation on "devoops-a"', time: '2026-10-29T02:12:42.000Z' }),
  ev({ cluster: 'devoops-b', source: 'kueue-admission', reason: 'Pending', message: 'insufficient quota for nvidia.com/gpu', time: '2026-10-29T02:12:41.000Z' }),
  ev({ cluster: 'devoops-a', source: 'kueue-admission', reason: 'Admitted', time: '2026-10-29T02:12:42.500Z' }),
  ev({ cluster: 'devoops-a', source: 'jobset', reason: 'SuccessfulCreate', time: '2026-10-29T02:12:43.000Z' }),
  ev({ cluster: 'devoops-a', source: 'default-scheduler', reason: 'FailedScheduling', type: 'Warning', count: 3, time: '2026-10-29T02:12:44.000Z' }),
  ev({ cluster: 'devoops-a', source: 'karpenter', reason: 'InsufficientCapacityError', type: 'Warning', message: 'UnfulfillableCapacity', time: '2026-10-29T02:13:12.000Z' }),
];

function stubEvents(items: JobEvent[]) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(items)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('stageOf', () => {
  it('maps sources to the delivery path', () => {
    expect(stageOf(timeline[0])).toBe('submit');
    expect(stageOf(timeline[1])).toBe('manager');
    expect(stageOf(timeline[2])).toBe('multikueue');
    expect(stageOf(timeline[4])).toBe('worker');
    expect(stageOf(timeline[5])).toBe('jobset');
    expect(stageOf(timeline[6])).toBe('scheduler');
    expect(stageOf(timeline[7])).toBe('karpenter');
    expect(stageOf(ev({ cluster: 'devoops-a', source: 'kubelet', reason: 'Pulling' }))).toBe('kubelet');
    expect(stageOf(ev({ source: 'kueue', reason: 'Finished' }))).toBe('done');
  });

  // 실제 k3s(Kueue 0.20.3)에서 기록된 출처 이름
  it('handles the component names Kueue actually reports', () => {
    expect(stageOf(ev({ source: 'jobset.x-k8s.io/jobset-kueue-controller', reason: 'CreatedWorkload' }))).toBe('manager');
    expect(stageOf(ev({ source: 'kueue-workload-controller', reason: 'MultiKueue' }))).toBe('multikueue');
    expect(stageOf(ev({ source: 'kueue-workload-controller', reason: 'Admitted' }))).toBe('manager');
    expect(
      stageOf(ev({ cluster: 'devoops-a', source: 'jobset.x-k8s.io/jobset-kueue-controller', reason: 'Started' })),
    ).toBe('worker');
    expect(stageOf(ev({ cluster: 'devoops-a', source: 'jobset-controller', reason: 'SuccessfulCreate' }))).toBe('jobset');
  });
});

describe('JobTimeline', () => {
  it('shows how far the job got along job → MultiKueue → Kueue → scheduler', async () => {
    stubEvents(timeline);
    render(<JobTimeline jobId="abc123" />);

    const path = await screen.findByRole('list', { name: '전달 경로' });
    const step = (name: string) => within(path).getByText(name).closest('li')!;
    expect(step('제출')).toHaveAttribute('data-state', 'done');
    expect(step('MultiKueue')).toHaveAttribute('data-state', 'done');
    expect(step('kube-scheduler')).toHaveAttribute('data-state', 'warning');
    expect(step('Karpenter')).toHaveAttribute('data-state', 'warning');
    expect(step('kubelet')).toHaveAttribute('data-state', 'waiting');
    expect(step('완료')).toHaveAttribute('data-state', 'waiting');
  });

  it('lists every event in time order with cluster, reason and repeat count', async () => {
    stubEvents(timeline);
    render(<JobTimeline jobId="abc123" />);

    const rows = await screen.findAllByRole('row');
    // header + 8 events, sorted by time (devoops-b Pending at :41 comes before MultiKueue Ready at :42)
    expect(rows).toHaveLength(9);
    expect(rows[3]).toHaveTextContent('devoops-b');
    expect(rows[3]).toHaveTextContent('insufficient quota');
    expect(rows[7]).toHaveTextContent('FailedScheduling ×3');
  });

  it('polls the timeline every two seconds', async () => {
    vi.useFakeTimers();
    const fetchMock = stubEvents(timeline.slice(0, 1));
    render(<JobTimeline jobId="abc123" />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/jobs/abc123/events'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state before anything is recorded', async () => {
    stubEvents([]);
    render(<JobTimeline jobId="abc123" />);

    expect(await screen.findByText('기록된 단계가 없습니다')).toBeInTheDocument();
  });
});
