import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJob, getFile, listFiles, listJobs } from './api';

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

describe('listFiles', () => {
  it('returns the stored code and data files of one job', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ kind: 'code', name: 'job.yaml', size: 10 }])));
    vi.stubGlobal('fetch', fetchMock);

    const files = await listFiles('abc123');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/jobs/abc123/files');
    expect(files).toEqual([{ kind: 'code', name: 'job.yaml', size: 10 }]);
  });
});

describe('getFile', () => {
  it('returns file text with truncation info from response headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('1,2,3', { headers: { 'X-Truncated': 'true', 'X-Total-Size': '120000' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = await getFile('abc123', 'data', 'my data.csv');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/jobs/abc123/files/data/my%20data.csv');
    expect(file).toEqual({ text: '1,2,3', truncated: true, totalSize: 120000 });
  });

  it('throws the server error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'file not found' }), { status: 404 })));

    await expect(getFile('abc123', 'code', 'gone.py')).rejects.toThrow('file not found');
  });
});
