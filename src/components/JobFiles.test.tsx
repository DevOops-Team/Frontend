import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobFiles } from './JobFiles';

afterEach(() => vi.unstubAllGlobals());

function stubBackend(files: Record<string, { body: string; truncated?: boolean; totalSize?: number }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/jobs/abc123/files')) {
        return new Response(
          JSON.stringify(
            Object.entries(files).map(([path, f]) => {
              const [kind, name] = path.split('/');
              return { kind, name, size: f.totalSize ?? f.body.length };
            }),
          ),
        );
      }
      const path = decodeURIComponent(url.split('/files/')[1]);
      const f = files[path];
      return new Response(f.body, {
        headers: { 'X-Truncated': String(!!f.truncated), 'X-Total-Size': String(f.totalSize ?? f.body.length) },
      });
    }),
  );
}

describe('JobFiles', () => {
  it('lists the job files and opens job.yaml first', async () => {
    stubBackend({
      'code/job.yaml': { body: 'kind: JobSet' },
      'code/train.py': { body: 'print("hi")' },
      'data/train.csv': { body: '1,2,3' },
    });

    render(<JobFiles jobId="abc123" />);

    expect(await screen.findByRole('button', { name: /job\.yaml/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /train\.py/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /train\.csv/ })).toBeInTheDocument();
    expect(await screen.findByText('kind: JobSet')).toBeInTheDocument();
  });

  it('shows another file when its name is clicked', async () => {
    stubBackend({ 'code/job.yaml': { body: 'kind: JobSet' }, 'code/train.py': { body: 'print("hi")' } });
    render(<JobFiles jobId="abc123" />);

    await userEvent.click(await screen.findByRole('button', { name: /train\.py/ }));

    expect(await screen.findByText('print("hi")')).toBeInTheDocument();
  });

  it('says when only the beginning of a large dataset is shown', async () => {
    stubBackend({ 'data/big.csv': { body: '1,2,3', truncated: true, totalSize: 3_000_000 } });

    render(<JobFiles jobId="abc123" />);

    expect(await screen.findByText(/앞부분만 표시/)).toHaveTextContent('2.9MB');
  });

  it('shows an empty state when nothing was stored', async () => {
    stubBackend({});

    render(<JobFiles jobId="abc123" />);

    expect(await screen.findByText('저장된 파일이 없습니다')).toBeInTheDocument();
  });
});
