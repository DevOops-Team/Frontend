import { useEffect, useState } from 'react';
import { LaunchWizard } from './components/LaunchWizard';
import { RunDetail } from './components/RunDetail';
import { RunList } from './components/RunList';
import { TICK_MS, createRun, tick, type Run, type RunMeta } from './mock/runs';
import { seedRuns } from './mock/seed';
import type { TrainingRequest } from './lib/request';

// 전부 목업: 시드 실행 5개로 시작하고, 타이머로 단계를 진행시킨다. 백엔드를 호출하지 않는다.
export function App({ initialRuns }: { initialRuns?: Run[] }) {
  const [runs, setRuns] = useState<Run[]>(() => initialRuns ?? seedRuns());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setRuns((rs) => {
        const next = rs.map(tick);
        return next.every((r, i) => r === rs[i]) ? rs : next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [selected]);

  function submit(request: TrainingRequest, meta: RunMeta): string {
    const run = createRun(request, meta);
    setRuns((rs) => [run, ...rs]);
    return run.id;
  }

  const running = runs.filter((r) => r.status === 'Running' || r.status === 'Queued').length;

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
              파인튜닝
            </button>
          </nav>
          <span className="mock-tag" title="모든 데이터는 브라우저 안의 목업입니다">
            목업 데이터
          </span>
          <span className="topnav-meta small muted">
            진행 중 {running} · 전체 {runs.length}
          </span>
        </div>
      </header>

      <main className="page">
        {selected ? (
          <RunDetail runId={selected} run={runs.find((r) => r.id === selected)} onBack={() => setSelected(null)} />
        ) : (
          <>
            <section className="hero">
              <h1>새 파인튜닝</h1>
              <p className="muted">코드도 YAML도 필요 없습니다. 태스크를 고르고, 베이스 모델과 데이터셋을 정하면 나머지는 플랫폼이 맞춰 줍니다.</p>
            </section>
            <LaunchWizard onSubmit={submit} onOpen={setSelected} />

            <section className="runs-section">
              <div className="section-head">
                <h2>실행 목록</h2>
                <span className="small muted">목업 · {TICK_MS / 1000}초마다 진행</span>
              </div>
              <div className="card flush">
                <RunList runs={runs} onSelect={setSelected} />
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
