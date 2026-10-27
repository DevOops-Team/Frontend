import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadForm } from './UploadForm';

function file(name: string) {
  return new File(['x'], name);
}

async function fillAll(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('job.yaml'), file('job.yaml'));
  await user.upload(screen.getByLabelText('train.py'), file('train.py'));
  await user.upload(screen.getByLabelText('학습 데이터'), [file('a.csv'), file('b.csv')]);
}

describe('UploadForm', () => {
  it('keeps submit disabled until job.yaml, train.py and data are chosen', async () => {
    const user = userEvent.setup();
    render(<UploadForm onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled();
    await fillAll(user);
    expect(screen.getByRole('button', { name: '제출' })).toBeEnabled();
  });

  it('submits the chosen files', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: 'abc123', name: 'job-abc123' });
    render(<UploadForm onSubmit={onSubmit} />);

    await fillAll(user);
    await user.click(screen.getByRole('button', { name: '제출' }));

    const input = onSubmit.mock.calls[0][0];
    expect(input.job.name).toBe('job.yaml');
    expect(input.train.name).toBe('train.py');
    expect(input.data.map((f: File) => f.name)).toEqual(['a.csv', 'b.csv']);
    expect(await screen.findByText('제출됨: abc123')).toBeInTheDocument();
  });

  it('shows the error when submission fails', async () => {
    const user = userEvent.setup();
    render(<UploadForm onSubmit={vi.fn().mockRejectedValue(new Error('job.yaml must be JobSet'))} />);

    await fillAll(user);
    await user.click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('job.yaml must be JobSet');
  });
});
