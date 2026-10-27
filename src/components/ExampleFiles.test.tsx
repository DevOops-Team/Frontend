import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExampleFiles } from './ExampleFiles';

describe('ExampleFiles', () => {
  it('opens the example job.yaml in a modal', async () => {
    render(<ExampleFiles />);

    await userEvent.click(screen.getByRole('button', { name: '예시 job.yaml' }));

    const dialog = screen.getByRole('dialog', { name: 'job.yaml' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('kind: JobSet');
  });

  it('opens the example train.py', async () => {
    render(<ExampleFiles />);

    await userEvent.click(screen.getByRole('button', { name: '예시 train.py' }));

    expect(screen.getByRole('dialog', { name: 'train.py' })).toHaveTextContent('def save_checkpoint');
  });

  it('describes the example training data and shows its first rows', async () => {
    render(<ExampleFiles />);

    await userEvent.click(screen.getByRole('button', { name: '예시 학습 데이터' }));

    const dialog = screen.getByRole('dialog', { name: 'train.csv' });
    expect(dialog).toHaveTextContent('5000행');
    expect(dialog).toHaveTextContent('-1.30904,0.19389');
  });

  it('closes with the close button and with Escape', async () => {
    const user = userEvent.setup();
    render(<ExampleFiles />);

    await user.click(screen.getByRole('button', { name: '예시 job.yaml' }));
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '예시 train.py' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
