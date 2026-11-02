import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LaunchWizard } from './LaunchWizard';

function file(name: string) {
  return new File(['x'], name);
}

type User = ReturnType<typeof userEvent.setup>;

async function toCompute(user: User) {
  await user.upload(screen.getByLabelText('train.py 파일'), file('train.py'));
  await user.click(screen.getByRole('button', { name: '다음' }));
  await user.upload(screen.getByLabelText('학습 데이터 파일'), [file('a.csv'), file('b.csv')]);
  await user.click(screen.getByRole('button', { name: '다음' }));
}

describe('LaunchWizard', () => {
  it('blocks the next step until train.py is chosen', async () => {
    const user = userEvent.setup();
    render(<LaunchWizard onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '예시 train.py 사용' }));
    expect(screen.getByRole('list', { name: '선택한 파일' })).toHaveTextContent('train.py');
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
  });

  it('blocks the next step until data is chosen and accepts the example data', async () => {
    const user = userEvent.setup();
    render(<LaunchWizard onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '예시 train.py 사용' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /예시 데이터 사용/ }));
    expect(screen.getByRole('list', { name: '선택한 파일' })).toHaveTextContent('train.csv');
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
  });

  it('limits the node stepper to 1–4', async () => {
    const user = userEvent.setup();
    render(<LaunchWizard onSubmit={vi.fn()} />);
    await toCompute(user);

    const more = screen.getByRole('button', { name: '노드 늘리기' });
    await user.click(more);
    await user.click(more);
    expect(screen.getByLabelText('선택한 노드 수')).toHaveTextContent('4');
    expect(more).toBeDisabled();
    const less = screen.getByRole('button', { name: '노드 줄이기' });
    for (let i = 0; i < 3; i++) await user.click(less);
    expect(screen.getByLabelText('선택한 노드 수')).toHaveTextContent('1');
    expect(less).toBeDisabled();
  });

  it('shows validation errors and blocks review for an invalid job name', async () => {
    const user = userEvent.setup();
    render(<LaunchWizard onSubmit={vi.fn()} />);
    await toCompute(user);

    await user.clear(screen.getByLabelText(/작업 이름/));
    await user.type(screen.getByLabelText(/작업 이름/), 'Bad_Name');
    expect(screen.getByText(/소문자·숫자·하이픈\(-\)만/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('previews the generated job.yaml with the total GPU count', async () => {
    const user = userEvent.setup();
    render(<LaunchWizard onSubmit={vi.fn()} />);
    await toCompute(user);

    await user.click(screen.getByRole('radio', { name: /A10G × 1/ }));
    await user.click(screen.getByRole('button', { name: '노드 늘리기' }));
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByText('3개')).toBeInTheDocument();
    const preview = screen.getByLabelText('생성된 job.yaml');
    expect(preview).toHaveTextContent('kind: JobSet');
    expect(preview).toHaveTextContent('--nnodes=3');
    expect(preview).toHaveTextContent('g5.xlarge');
  });

  it('submits the generated job.yaml with train.py and data files', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'abc123' });
    render(<LaunchWizard onSubmit={onSubmit} />);
    await toCompute(user);

    await user.click(screen.getByRole('checkbox', { name: /Spot/ }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '실행' }));

    const input = onSubmit.mock.calls[0][0];
    expect(input.job.name).toBe('job.yaml');
    const yaml = await input.job.text();
    expect(yaml).toContain('kind: JobSet');
    expect(yaml).toContain('--nnodes=2');
    expect(yaml).toMatch(/Spot/);
    expect(input.train.name).toBe('train.py');
    expect(input.data.map((f: File) => f.name)).toEqual(['a.csv', 'b.csv']);
    expect(await screen.findByText('abc123')).toBeInTheDocument();
  });

  it('shows the backend error when launching fails', async () => {
    const user = userEvent.setup();
    render(<LaunchWizard onSubmit={vi.fn().mockRejectedValue(new Error('job.yaml must be JobSet'))} />);
    await toCompute(user);

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '실행' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('job.yaml must be JobSet');
  });
});
