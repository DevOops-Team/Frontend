import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJob, listJobs } from './api';

afterEach(() => vi.unstubAllGlobals());

function file(name: string, body = 'x') {
  return new File([body], name);
}

describe('createJob', () => {
  it('posts job.yaml, train.py and every data file as multipart to /api/jobs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'abc123', name: 'job-abc123' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await createJob({ job: file('job.yaml'), train: file('train.py'), data: [file('a.csv'), file('b.csv')] });

    expect(res).toEqual({ id: 'abc123', name: 'job-abc123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/jobs');
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect((body.get('job') as File).name).toBe('job.yaml');
    expect((body.get('train') as File).name).toBe('train.py');
    expect(body.getAll('data').map((f) => (f as File).name)).toEqual(['a.csv', 'b.csv']);
  });

  it('throws the server error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'job.yaml must be JobSet' }), { status: 400 })));

    await expect(createJob({ job: file('job.yaml'), train: file('train.py'), data: [file('a.csv')] })).rejects.toThrow('job.yaml must be JobSet');
  });
});

describe('listJobs', () => {
  it('returns jobs from /api/jobs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 'abc123', phase: 'Running', progress: null }]))));

    const jobs = await listJobs();

    expect(jobs[0].id).toBe('abc123');
  });
});
