import { useEffect, useState } from 'react';
import { StateBadge } from '@/shared/ui/StateBadge';
import { JOB_DETAIL_POLL_MS, errorMessage, getJob, isTerminal, jobEvents, jobFile, jobFiles } from '../api';
import { formatClock, formatDateTime } from '../lib/format';
import { formatDuration } from '../lib/upload';
import { STATUS_LABEL, runProgress, stepsPerEpoch, uiState } from '../lib/progress';
import type { Job, JobEvent, JobFile } from '../types';
import { FileList } from './FileList';

// 쿼터 대기 이벤트. 정상 동작 중에도 길게 나와 화면에서는 뺀다. 원본은 /api/jobs/{id}/events에 남는다.
const HIDDEN_EVENTS = new Set(['WaitingForQuota', 'ExceedsMaxQuota']);

export function RunOverview({ job, events, files, onBack }: { job: Job; events: JobEvent[]; files: JobFile[]; onBack: () => void }) {
  const progress = runProgress(job);
  const state = uiState(job.status);
  const ordered = events.filter((e) => !HIDDEN_EVENTS.has(e.reason)).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const p = job.progress;
  // Kueue 원문은 대기 중에도 계속 바뀌므로 실패 이유만 그대로 보여 준다.
  const failure = job.status === 'FAILED' ? job.statusMessage : undefined;
  const caption = failure ?? (progress.complete ? '학습과 결과 저장을 마쳤습니다.' : `${progress.stages[progress.active].label} 단계 · 상태가 자동으로 업데이트됩니다.`);
  const cfg = job.config;

  return <div className="run-overview">
    <header className="run-heading"><div><button type="button" className="link run-back" onClick={onBack}>← 학습 목록</button><h1 title={job.name}>{job.name}</h1></div><div className="run-heading-actions"><span className="run-config">{job.strategy.toUpperCase()} · GPU {job.gpus}개</span><StateBadge state={state} label={STATUS_LABEL[job.status]} /></div></header>
    <section className="card run-progress" data-state={state} aria-labelledby="run-progress-title">
      <div className="progress-top"><div><span className="eyebrow">학습 진행 상황</span><h2 id="run-progress-title">{progress.headline}</h2></div><div className="progress-percent"><strong>{progress.percent}<span>%</span></strong><span>전체 진행률</span></div></div>
      <div className="run-progress-track" role="progressbar" aria-label="전체 학습 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.percent}% · ${progress.headline}`}><span style={{ width: `${progress.percent}%` }} /></div>
      <ol className="run-stages" aria-label="실행 단계">{progress.stages.map((s, i) => <li key={s.label} data-state={s.state} aria-current={s.state === 'active' || s.state === 'error' ? 'step' : undefined}><span className="run-stage-mark" aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'error' ? '!' : i + 1}</span><div><strong>{s.label}</strong><span>{s.state === 'done' ? '완료' : s.state === 'active' ? (job.status === 'QUEUED' ? '대기 중' : '진행 중') : s.state === 'error' ? '실패' : '대기'}</span></div></li>)}</ol>
      <div className="run-progress-caption"><span>{caption}</span></div>
      <dl className="run-metrics">
        <div><dt>Step</dt><dd>{p && p.totalSteps > 0 ? `${p.step} / ${p.totalSteps}` : '-'}</dd></div>
        <div><dt>Loss (전체 rank 평균)</dt><dd>{p && p.step > 0 ? p.loss.toFixed(4) : '-'}</dd></div>
        <div><dt>마지막 체크포인트</dt><dd>{p && p.lastCheckpointStep > 0 ? p.lastCheckpointStep : '-'}</dd></div>
        <div><dt>클러스터</dt><dd>{job.cluster ?? '-'}</dd></div>
        <div><dt>rank 0 노드</dt><dd>{p?.nodeName ?? '-'}</dd></div>
      </dl>
    </section>
    <div className="run-detail-grid"><section className="card run-inputs"><div className="run-card-heading"><h2>학습 설정</h2><span className="small muted">실제로 쓰인 값</span></div><dl>
      <div><dt>학습 모델</dt><dd title={job.model}>{job.model}</dd></div>
      <div><dt>업로드 위치</dt><dd title={cfg?.dataset.uri}>{cfg?.dataset.uri ?? '-'}</dd></div>
      <div className="run-compute"><div><dt>학습 방식</dt><dd>{job.strategy.toUpperCase()}</dd></div><div><dt>사용 GPU</dt><dd>{job.gpus}개</dd></div><div><dt>큐</dt><dd>{job.queue}</dd></div></div>
      {cfg && <div className="run-compute run-config-grid">
        <div><dt>batch_size_per_gpu</dt><dd>{cfg.batch_size_per_gpu}</dd></div>
        <div><dt>steps_per_epoch</dt><dd>{stepsPerEpoch(job) ?? '-'}</dd></div>
        <div><dt>epochs</dt><dd>{cfg.epochs}</dd></div>
        <div><dt>total_steps</dt><dd>{p && p.totalSteps > 0 ? p.totalSteps : '-'}</dd></div>
        <div><dt>learning_rate</dt><dd>{cfg.learning_rate}</dd></div>
        <div><dt>체크포인트 간격</dt><dd title={`τ = √(2 · ${cfg.checkpoint_policy.estimated_save_seconds}s · ${cfg.checkpoint_policy.mtbf_seconds}s)`}>{formatDuration(cfg.checkpoint_policy.interval_seconds)}마다</dd></div>
        <div><dt>체크포인트 형식</dt><dd>{cfg.checkpoint_format}</dd></div>
      </div>}
      <div><dt>JobSet</dt><dd title={job.jobsetName}>{job.jobsetName}</dd></div>
    </dl>
      <div className="run-card-heading run-files-heading"><h2>작업 파일</h2></div>
      <FileList label="작업 파일" preview="modal" files={files} load={(name) => jobFile(job.id, files.find((f) => f.name === name)?.kind ?? 'code', name)} />
    </section>
    <section className="card run-history"><div className="run-card-heading"><h2>실행 기록</h2><span className="history-live" data-live={!isTerminal(job.status)}>{isTerminal(job.status) ? '기록 종료' : '실시간 업데이트'}</span></div>
      {ordered.length === 0 && <p className="muted small">아직 기록이 없습니다.</p>}
      <ol className="run-timeline" aria-label="실행 기록" tabIndex={0}>{ordered.map((e) => <li key={e.key} data-level={e.type === 'Warning' ? 'warning' : 'info'}><time dateTime={e.time} title={formatDateTime(e.time)}>{formatClock(e.time)}</time><span className="timeline-point" aria-hidden="true" /><p title={e.message}>{e.cluster} · {e.reason}: {e.message}</p></li>)}</ol>
      <footer className="history-pagination"><span>총 {ordered.length}개 기록 · 시간순</span></footer></section></div>
  </div>;
}

// 작업 하나를 3초마다 다시 읽는다. 끝난 작업은 더 읽지 않는다 (서비스 API 명세 §1).
export function RunPage({ id, onBack }: { id: string; onBack: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [files, setFiles] = useState<JobFile[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      let finished = false;
      try {
        const [j, ev, fs] = await Promise.all([getJob(id), jobEvents(id), jobFiles(id)]);
        if (!live) return;
        setJob(j);
        setEvents(ev);
        setFiles(fs);
        setError('');
        finished = isTerminal(j.status);
      } catch (e) {
        if (!live) return;
        setError(errorMessage(e));
      }
      if (!finished) timer = setTimeout(() => { void poll(); }, JOB_DETAIL_POLL_MS);
    }
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [id]);

  return <>
    {error && <p role="alert" className="issues">{error}</p>}
    {job ? <RunOverview job={job} events={events} files={files} onBack={onBack} /> : !error && <p className="muted">작업 정보를 불러오는 중입니다.</p>}
    {!job && error && <button type="button" className="link" onClick={onBack}>← 학습 목록</button>}
  </>;
}
