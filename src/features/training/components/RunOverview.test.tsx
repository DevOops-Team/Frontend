import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONFIG, EVENTS, FILES, makeJob, stubApi } from '@/test-api';
import { RunOverview } from './RunOverview';

beforeEach(() => { stubApi(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('execution monitor', () => {
  it('shows real step, loss, checkpoint and where it runs', () => {
    render(<RunOverview job={makeJob({ progress: { status: 'RUNNING', generation: 1, step: 100, totalSteps: 400, loss: 2.4123, lastCheckpointStep: 50, nodeName: 'ip-10-0-1-2', updatedAt: '' } })} events={EVENTS} files={FILES} onBack={vi.fn()} />);
    expect(screen.getByRole('progressbar', { name: '전체 학습 진행률' })).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('100 / 400')).toBeInTheDocument();
    expect(screen.getByText('2.4123')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('ip-10-0-1-2')).toBeInTheDocument();
    expect(screen.getByText('devoops-a')).toBeInTheDocument();
  });

  it('lists the whole timeline in time order, oldest first, without paging', () => {
    const events = Array.from({ length: 7 }, (_, n) => ({ ...EVENTS[0], key: `k${n}`, reason: `기록${n}` }));
    render(<RunOverview job={makeJob()} events={events} files={[]} onBack={vi.fn()} />);

    const items = within(screen.getByRole('list', { name: '실행 기록' })).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent('기록0');
    expect(items[6]).toHaveTextContent('기록6');
    expect(screen.queryByRole('button', { name: '이전 기록' })).not.toBeInTheDocument();
    expect(screen.getByText('총 7개 기록 · 시간순')).toBeInTheDocument();
  });

  it('lets the timeline be scrolled with the keyboard', () => {
    render(<RunOverview job={makeJob()} events={EVENTS} files={[]} onBack={vi.fn()} />);

    expect(screen.getByRole('list', { name: '실행 기록' })).toHaveAttribute('tabindex', '0');
  });

  it('sorts events by time even if they arrive out of order', () => {
    const late = { ...EVENTS[0], key: 'late', reason: '늦은기록', time: '2026-11-05T03:00:00.000Z' };
    const early = { ...EVENTS[0], key: 'early', reason: '이른기록', time: '2026-11-05T01:00:00.000Z' };
    render(<RunOverview job={makeJob()} events={[late, early]} files={[]} onBack={vi.fn()} />);

    const items = within(screen.getByRole('list', { name: '실행 기록' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('이른기록');
    expect(items[1]).toHaveTextContent('늦은기록');
  });

  it('exposes each stage state so its colour follows progress', () => {
    const { rerender } = render(<RunOverview job={makeJob({ status: 'RUNNING' })} events={[]} files={[]} onBack={vi.fn()} />);
    const states = () => within(screen.getByRole('list', { name: '실행 단계' })).getAllByRole('listitem').map((li) => li.getAttribute('data-state'));
    expect(states()).toEqual(['done', 'done', 'active', 'waiting']);

    rerender(<RunOverview job={makeJob({ status: 'FAILED' })} events={[]} files={[]} onBack={vi.fn()} />);
    expect(states()).toEqual(['done', 'done', 'error', 'waiting']);
  });

  it('shows event times as HH:MM:SS with the full date on hover', () => {
    const iso = new Date(2026, 10, 5, 12, 5, 8).toISOString();
    render(<RunOverview job={makeJob()} events={[{ ...EVENTS[0], time: iso, lastTime: iso }]} files={[]} onBack={vi.fn()} />);

    const time = screen.getByText('12:05:08');
    expect(time).toHaveAttribute('title', '2026-11-05 12:05:08');
    expect(time).toHaveAttribute('datetime', iso);
  });

  it('marks warning events', () => {
    render(<RunOverview job={makeJob()} events={EVENTS} files={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/node nominated/).closest('li')).toHaveAttribute('data-level', 'warning');
  });

  it('does not show raw Kueue messages while waiting or after success', () => {
    const raw = "couldn't assign flavors to pod set workers: insufficient unused quota";
    const { rerender } = render(<RunOverview job={makeJob({ status: 'QUEUED', progress: null, statusMessage: raw })} events={[]} files={[]} onBack={vi.fn()} />);
    expect(screen.queryByText(/couldn't assign/)).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText(/상태가 자동으로 업데이트됩니다/)).toBeInTheDocument();

    rerender(<RunOverview job={makeJob({ status: 'SUCCEEDED', statusMessage: 'jobset completed successfully' })} events={[]} files={[]} onBack={vi.fn()} />);
    expect(screen.queryByText('jobset completed successfully')).not.toBeInTheDocument();
    expect(screen.getByText('학습과 결과 저장을 마쳤습니다.')).toBeInTheDocument();
  });

  it('leaves quota wait events out of the timeline and its count', () => {
    const events = [
      EVENTS[0],
      { ...EVENTS[0], key: 'wait', reason: 'WaitingForQuota', message: "couldn't assign flavors" },
      { ...EVENTS[0], key: 'max', reason: 'ExceedsMaxQuota', message: "couldn't assign flavors" },
    ];
    render(<RunOverview job={makeJob()} events={events} files={[]} onBack={vi.fn()} />);

    expect(screen.queryByText(/couldn't assign/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '실행 기록' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('총 1개 기록 · 시간순')).toBeInTheDocument();
  });

  it('shows the failure message and stays below complete', () => {
    render(<RunOverview job={makeJob({ status: 'FAILED', statusMessage: 'GPU 메모리 부족' })} events={[]} files={[]} onBack={vi.fn()} />);
    expect(screen.getByText('학습 중 문제가 발생했어요')).toBeInTheDocument();
    expect(screen.getByText('GPU 메모리 부족')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '100');
  });

  const value = (label: string) => screen.getByText(label).nextElementSibling;
  const stepsAt = (step: number, totalSteps: number) => ({ status: 'RUNNING', generation: 1, step, totalSteps, loss: 2, lastCheckpointStep: 0, updatedAt: '' });

  it('shows how batch size, epochs and steps add up', () => {
    render(<RunOverview job={makeJob({ config: CONFIG, progress: stepsAt(100, 400) })} events={[]} files={[]} onBack={vi.fn()} />);

    expect(value('batch_size_per_gpu')).toHaveTextContent('4');
    expect(value('steps_per_epoch')).toHaveTextContent('40');
    expect(value('epochs')).toHaveTextContent('10');
    expect(value('total_steps')).toHaveTextContent('400');
  });

  it('shows dashes for step counts until train.py reports them', () => {
    render(<RunOverview job={makeJob({ config: CONFIG, progress: null })} events={[]} files={[]} onBack={vi.fn()} />);

    expect(value('steps_per_epoch')).toHaveTextContent('-');
    expect(value('total_steps')).toHaveTextContent('-');
  });

  it('shows learning rate and checkpoint interval but not warmup', () => {
    render(<RunOverview job={makeJob({ config: { ...CONFIG, checkpoint_every_steps: 123 } })} events={[]} files={[]} onBack={vi.fn()} />);

    expect(value('learning_rate')).toHaveTextContent('0.00003');
    expect(value('checkpoint_every_steps')).toHaveTextContent('123');
    expect(screen.queryByText(/warmup/i)).not.toBeInTheDocument();
  });

  it('shows the epoch checkpoint interval when no step interval is set', () => {
    render(<RunOverview job={makeJob({ config: { ...CONFIG, checkpoint_every_steps: null } })} events={[]} files={[]} onBack={vi.fn()} />);

    expect(value('checkpoint_every_steps')).toHaveTextContent('epoch마다');
  });

  it('shows the final config and has no fake controls', () => {
    render(<RunOverview job={makeJob({ config: CONFIG })} events={[]} files={[]} onBack={vi.fn()} />);
    expect(screen.getByText('fsdp-dcp')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '학습 중지' })).not.toBeInTheDocument();
    expect(screen.queryByText(/목업/)).not.toBeInTheDocument();
  });

  it('previews a job file in a modal', async () => {
    const user = userEvent.setup();
    stubApi();
    render(<RunOverview job={makeJob()} events={[]} files={FILES} onBack={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'jobset.json 미리보기' }));

    const dialog = await screen.findByRole('dialog', { name: 'jobset.json' });
    expect(await within(dialog).findByText('preview of jobset.json')).toBeInTheDocument();
    expect(within(dialog).getByText(/앞부분만/)).toBeInTheDocument();
  });

  it('asks for the right kind of file in the modal', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    render(<RunOverview job={makeJob()} events={[]} files={FILES} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'manifest.json 미리보기' }));

    await screen.findByText('preview of manifest.json');
    expect(api.urls()).toContain('GET /api/jobs/3f9a1c2e/files/data/manifest.json');
  });

  it('closes the modal with Escape, the close button and the backdrop, and returns focus', async () => {
    const user = userEvent.setup();
    stubApi();
    render(<RunOverview job={makeJob()} events={[]} files={FILES} onBack={vi.fn()} />);
    const open = screen.getByRole('button', { name: 'config.json 미리보기' });

    await user.click(open);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();

    await user.click(open);
    await user.click(await screen.findByRole('button', { name: '미리보기 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(open);
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the error inside the modal when the file cannot be read', async () => {
    const user = userEvent.setup();
    stubApi({ fail: { '/api/jobs/3f9a1c2e/files/code/jobset.json': { status: 502, body: { error: 'get file failed', code: 'UPSTREAM' } } } });
    render(<RunOverview job={makeJob()} events={[]} files={FILES} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'jobset.json 미리보기' }));

    expect(within(await screen.findByRole('dialog')).getByRole('alert')).toHaveTextContent('get file failed');
  });

  it('previews the training data this job used in a modal', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    render(<RunOverview job={makeJob()} events={[]} files={[]} onBack={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'train-000.jsonl 미리보기' }));

    const dialog = await screen.findByRole('dialog', { name: 'train-000.jsonl' });
    expect(await within(dialog).findByText('preview of train-000.jsonl')).toBeInTheDocument();
    expect(api.urls()).toContain('GET /api/datasets/ds-tiny-shakespeare/versions/1/files/train-000.jsonl');
  });

  it('shows the training data right after progress, ahead of the settings', async () => {
    render(<RunOverview job={makeJob()} events={[]} files={[]} onBack={vi.fn()} />);

    const data = await screen.findByRole('region', { name: '학습 데이터' });
    expect(await within(data).findByText('Tiny Shakespeare · v1')).toBeInTheDocument();
    const settings = screen.getByRole('heading', { name: '학습 설정' });
    expect(data.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('progressbar').compareDocumentPosition(data) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
