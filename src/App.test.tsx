import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { App } from './App';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function jobsResponse(step: number) {
  return new Response(
    JSON.stringify([
      {
        id: 'abc123',
        name: 'job-abc123',
        phase: 'Running',
        cluster: 'devoops-b',
        restarts: 0,
        createdAt: '2026-10-27T10:00:00Z',
        progress: { status: 'RUNNING', step, totalSteps: 5000, loss: 0.5, lastCheckpointStep: 0, updatedAt: 0 },
      },
    ]),
  );
}

describe('App', () => {
  it('polls job progress every two seconds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(jobsResponse(10)).mockResolvedValue(jobsResponse(20));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await act(async () => {});
    expect(screen.getByText('10 / 5000')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText('20 / 5000')).toBeInTheDocument();
  });

  it('shows when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<App />);

    expect(await screen.findByText(/백엔드에 연결할 수 없습니다/)).toBeInTheDocument();
  });
});
