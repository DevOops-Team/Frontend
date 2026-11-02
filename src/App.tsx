import { useCallback, useEffect, useState } from 'react';
import { createJob, listJobs, type Job, type JobInput } from './api';
import { JobDetail } from './components/JobDetail';
import { JobList } from './components/JobList';
import { LaunchWizard } from './components/LaunchWizard';
import { appendHistory, type LossHistory } from './lossHistory';

const POLL_MS = 2000;

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<LossHistory>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      listJobs()
        .then((js) => {
          setJobs(js);
          setHistory((h) => appendHistory(h, js));
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err))),
    [],
  );

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

  const running = jobs.filter((j) => j.phase === 'Running').length;

  return (
    <>
      <header className="topnav">
        <div className="topnav-inner">
          <button type="button" className="brand" onClick={() => setSelected(null)}>
            <span className="brand-mark" aria-hidden="true" />
            DevOops
          </button>
          <nav className="topnav-links" aria-label="주 메뉴">
            <button type="button" aria-current={selected === null ? 'page' : undefined} onClick={() => setSelected(null)}>
              학습 작업
            </button>
          </nav>
          <span className="topnav-meta small muted">
            실행 중 {running} · 전체 {jobs.length}
          </span>
        </div>
      </header>

      <main className="page">
        {error && (
          <p role="status" className="banner">
            백엔드에 연결할 수 없습니다: {error}
          </p>
        )}

        {selected ? (
          <JobDetail
            jobId={selected}
            job={jobs.find((j) => j.id === selected)}
            history={history[selected] ?? []}
            onBack={() => setSelected(null)}
          />
        ) : (
          <>
            <section className="hero">
              <h1>새 학습 작업</h1>
              <p className="muted">
                코드와 데이터를 올리고 GPU를 고르면 job.yaml(JobSet)을 만들어 MultiKueue가 비어 있는 EKS 클러스터로 보냅니다.
              </p>
            </section>
            <LaunchWizard onSubmit={submit} />

            <section className="runs-section">
              <div className="section-head">
                <h2>실행 목록</h2>
                <span className="small muted">2초마다 갱신</span>
              </div>
              <div className="card flush">
                <JobList jobs={jobs} onSelect={setSelected} />
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
