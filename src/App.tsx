import { useCallback, useEffect, useState } from 'react';
import { createJob, listJobs, type Job, type JobInput } from './api';
import { ExampleFiles } from './components/ExampleFiles';
import { JobList } from './components/JobList';
import { UploadForm } from './components/UploadForm';

const POLL_MS = 2000;

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setJobs(await listJobs());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function submit(input: JobInput) {
    const res = await createJob(input);
    await refresh();
    return res;
  }

  return (
    <main>
      <h1>DevOops Training</h1>
      <p className="muted">job.yaml(JobSet) · train.py · 학습 데이터를 올리면 MultiKueue가 비어 있는 EKS 클러스터로 보냅니다.</p>
      <section>
        <h2>작업 제출</h2>
        <ExampleFiles />
        <UploadForm onSubmit={submit} />
      </section>
      <section>
        <h2>작업 목록</h2>
        {error && <p role="status">백엔드에 연결할 수 없습니다: {error}</p>}
        <JobList jobs={jobs} />
      </section>
    </main>
  );
}
