import { describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedStore } from '../mock/seed';
import { RunOverview } from './RunOverview';

describe('execution monitor', () => {
  const base = seedStore().pipelines[0];
  it('exposes live percentage, input summary and paged events', async () => {
    const events = Array.from({ length: 7 }, (_, n) => ({ t: n * 30, message: `기록 ${n}`, level: 'info' as const }));
    render(<RunOverview pipeline={{ ...base, state: 'RUNNING', tick: 5, trainTicks: 8, events }} onBack={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByRole('progressbar', { name: '전체 학습 진행률' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('기록 6')).toBeInTheDocument();
    expect(screen.queryByText('기록 0')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '이전 기록' }));
    expect(screen.getByText('기록 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '이전 기록' }));
    expect(screen.getByText('기록 0')).toBeInTheDocument();
  });
  it('shows success at 100% and keeps failed runs below complete', () => {
    render(<RunOverview pipeline={{ ...base, state: 'SUCCEEDED' }} onBack={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.queryByRole('button', { name: '학습 중지' })).not.toBeInTheDocument();
    cleanup();
    render(<RunOverview pipeline={{ ...base, state: 'FAILED', tick: 3, error: 'GPU 메모리 부족' }} onBack={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByText('학습 중 문제가 발생했어요')).toBeInTheDocument();
    expect(screen.getByText('GPU 메모리 부족')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '100');
  });
});
