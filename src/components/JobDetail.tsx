import type { Job } from '../api';
import type { LossPoint } from '../lossHistory';
import { JobFiles } from './JobFiles';
import { PhaseBadge } from './JobList';
import { JobTimeline } from './JobTimeline';
import { LossSparkline } from './LossSparkline';

interface Props {
  jobId: string;
  job: Job | undefined;
  history: LossPoint[];
  onBack: () => void;
}

// 작업 상세: 큰 진행 헤더, loss 그래프, 전달 타임라인, 제출 파일.
export function JobDetail({ jobId, job, history, onBack }: Props) {
  const p = job?.progress ?? null;
  const pct = p && p.totalSteps > 0 ? Math.min(100, (p.step / p.totalSteps) * 100) : 0;

  return (
    <div className="detail">
      <nav className="breadcrumb" aria-label="위치">
        <button type="button" className="link" onClick={onBack}>
          실행 목록
        </button>
        <span aria-hidden="true">/</span>
        <code>{jobId}</code>
      </nav>

      {!job ? (
        <div className="card">
          <p>작업을 찾을 수 없습니다. 목록이 아직 갱신되지 않았거나 삭제된 작업입니다.</p>
        </div>
      ) : (
        <>
          <header className="card detail-header">
            <div className="detail-title">
              <h2>
                <code>{job.id}</code>
              </h2>
              <PhaseBadge phase={job.phase} title={job.message} />
            </div>
            {job.message && <p className="muted small">{job.message}</p>}
            <div className="big-progress">
              <div className="big-progress-num">
                <strong>{p ? `${pct.toFixed(1)}%` : '—'}</strong>
                <span className="muted">{p ? `${p.step} / ${p.totalSteps} step` : '진행 기록 없음'}</span>
              </div>
              <progress aria-label={`${job.id} 진행률`} value={p?.step ?? 0} max={p?.totalSteps || 1} />
            </div>
            <dl className="stats">
              <div>
                <dt>loss</dt>
                <dd className="mono">{p ? p.loss.toFixed(4) : '—'}</dd>
              </div>
              <div>
                <dt>마지막 체크포인트</dt>
                <dd className="mono">{p ? p.lastCheckpointStep : '—'}</dd>
              </div>
              <div>
                <dt>클러스터</dt>
                <dd>{job.cluster ?? '미배정'}</dd>
              </div>
              <div>
                <dt>노드</dt>
                <dd>{p?.nodeName ?? '—'}</dd>
              </div>
              <div>
                <dt>재시작</dt>
                <dd>{job.restarts}회</dd>
              </div>
            </dl>
          </header>

          <section className="card">
            <h3>loss</h3>
            <LossSparkline points={history} />
          </section>
        </>
      )}

      <section className="card">
        <h3>전달 상태</h3>
        <JobTimeline jobId={jobId} />
      </section>

      <section className="card">
        <h3>제출 파일</h3>
        <JobFiles jobId={jobId} />
      </section>
    </div>
  );
}
