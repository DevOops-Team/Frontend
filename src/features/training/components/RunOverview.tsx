import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { Icon } from '@/shared/ui/Icon';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpener = useRef<HTMLButtonElement>(null);
  function closeSettings() { setSettingsOpen(false); settingsOpener.current?.focus(); }

  // 실행 기록은 카드 안에서 스크롤된다. 맨 아래를 보고 있으면 새 기록이 올 때 따라 내려가고,
  // 위로 올려 읽는 중이면 그 자리를 지킨다.
  const timeline = useRef<HTMLOListElement>(null);
  const following = useRef(true);
  function onTimelineScroll() {
    const el = timeline.current;
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }
  useLayoutEffect(() => {
    const el = timeline.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [ordered.length]);

  return <div className="run">
    <header className="run-head">
      <div><button type="button" className="link back-link" onClick={onBack}><Icon name="back" size={16} />학습 목록</button><h1 title={job.name}>{job.name}</h1></div>
      <div className="run-head-meta"><span><code>{job.strategy.toUpperCase()}</code></span><span className="num">GPU {job.gpus}개</span><StateBadge state={state} label={STATUS_LABEL[job.status]} /></div>
    </header>
    <div className="run-grid">
      <section className="panel run-progress" data-state={state} aria-labelledby="run-progress-title">
        <div className="progress-top"><h2 id="run-progress-title">{progress.headline}</h2><p className="progress-percent"><strong className="num">{progress.percent}<span>%</span></strong><span>전체 진행률</span></p></div>
        <div className="track" role="progressbar" aria-label="전체 학습 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.percent}%, ${progress.headline}`}><span style={{ transform: `scaleX(${progress.percent / 100})` }} /></div>
        <ol className="stages" aria-label="실행 단계">{progress.stages.map((s, i) => <li key={s.label} data-state={s.state} aria-current={s.state === 'active' || s.state === 'error' ? 'step' : undefined}><span className="stage-mark" aria-hidden="true">{s.state === 'done' ? <Icon name="check" size={14} /> : s.state === 'error' ? <Icon name="cross" size={14} /> : i + 1}</span><div><strong>{s.label}</strong><span>{s.state === 'done' ? '완료' : s.state === 'active' ? (job.status === 'QUEUED' ? '대기 중' : '진행 중') : s.state === 'error' ? '실패' : '대기'}</span></div></li>)}</ol>
        <p className="progress-caption">{caption}</p>
        <dl className="metrics">
          <div><dt>Step</dt><dd className="num">{p && p.totalSteps > 0 ? `${p.step} / ${p.totalSteps}` : '-'}</dd></div>
          <div><dt>Loss</dt><dd className="num">{p && p.step > 0 ? p.loss.toFixed(4) : '-'}</dd></div>
          <div><dt>마지막 체크포인트</dt><dd className="num">{p && p.lastCheckpointStep > 0 ? p.lastCheckpointStep : '-'}</dd></div>
          <div><dt>클러스터</dt><dd><code>{job.cluster ?? '-'}</code></dd></div>
          <div><dt>rank 0 노드</dt><dd><code>{p?.nodeName ?? '-'}</code></dd></div>
        </dl>
      </section>
      <section className="panel run-inputs" aria-labelledby="run-inputs-title">
        <div className="panel-head"><h2 id="run-inputs-title">학습 설정</h2><button ref={settingsOpener} type="button" className="key" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>상세 보기</button></div>
        <h3 className="files-head">작업 파일</h3>
        <FileList label="작업 파일" preview="modal" files={files} load={(name) => jobFile(job.id, files.find((f) => f.name === name)?.kind ?? 'code', name)} />
      </section>
      <section className="panel run-history" aria-labelledby="run-history-title"><div className="panel-head"><h2 id="run-history-title">실행 기록</h2><span className="history-live" data-live={!isTerminal(job.status)}>{isTerminal(job.status) ? '기록 종료' : '실시간 업데이트'}</span></div>
        {ordered.length === 0 && <p className="muted">아직 기록이 없습니다.</p>}
        <ol ref={timeline} className="timeline" aria-label="실행 기록" tabIndex={0} onScroll={onTimelineScroll}>{ordered.map((e) => <li key={e.key} data-level={e.type === 'Warning' ? 'warning' : 'info'}><time className="num" dateTime={e.time} title={formatDateTime(e.time)}>{formatClock(e.time)}</time><span className="tick" aria-hidden="true" /><div><p className="timeline-reason"><strong>{e.reason}</strong><code>{e.cluster}</code></p><p title={e.message}>{e.message}</p></div></li>)}</ol>
        <footer className="history-foot muted">총 {ordered.length}개 기록, 시간순</footer>
      </section>
    </div>
    {settingsOpen && <Dialog titleId="run-settings-title" title="학습 설정" meta="실제로 쓰인 값" closeLabel="학습 설정 닫기" onClose={closeSettings}>
      <dl className="kv">
        <div><dt>학습 모델</dt><dd title={job.model}><code>{job.model}</code></dd></div>
        <div><dt>업로드 위치</dt><dd title={cfg?.dataset.uri}><code>{cfg?.dataset.uri ?? '-'}</code></dd></div>
        <div><dt>학습 방식</dt><dd><code>{job.strategy.toUpperCase()}</code></dd></div>
        <div><dt>사용 GPU</dt><dd className="num">{job.gpus}개</dd></div>
        <div><dt>큐</dt><dd><code>{job.queue}</code></dd></div>
        {cfg && <>
          <div><dt><code>batch_size_per_gpu</code></dt><dd className="num">{cfg.batch_size_per_gpu}</dd></div>
          <div><dt><code>steps_per_epoch</code></dt><dd className="num">{stepsPerEpoch(job) ?? '-'}</dd></div>
          <div><dt><code>epochs</code></dt><dd className="num">{cfg.epochs}</dd></div>
          <div><dt><code>total_steps</code></dt><dd className="num">{p && p.totalSteps > 0 ? p.totalSteps : '-'}</dd></div>
          <div><dt><code>learning_rate</code></dt><dd className="num">{cfg.learning_rate}</dd></div>
          <div><dt>체크포인트 간격</dt><dd title={`τ = √(2 · ${cfg.checkpoint_policy.estimated_save_seconds}s · ${cfg.checkpoint_policy.mtbf_seconds}s)`}>{formatDuration(cfg.checkpoint_policy.interval_seconds)}마다</dd></div>
          <div><dt>체크포인트 형식</dt><dd><code>{cfg.checkpoint_format}</code></dd></div>
        </>}
        <div><dt>JobSet</dt><dd title={job.jobsetName}><code>{job.jobsetName}</code></dd></div>
      </dl>
    </Dialog>}
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
    {!job && error && <button type="button" className="link back-link" onClick={onBack}><Icon name="back" size={16} />학습 목록</button>}
  </>;
}
