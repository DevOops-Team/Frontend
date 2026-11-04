import { useState } from 'react';
import { StateBadge } from '@/shared/ui/StateBadge';
import { isTerminal, jobSpec, TICK_SECONDS } from '../api';
import { runProgress } from '../lib/progress';
import type { Pipeline } from '../types';

export function RunOverview({ pipeline: p, onBack, onStop }: { pipeline: Pipeline; onBack: () => void; onStop: () => void }) {
  const [eventPage, setEventPage] = useState(0);
  const progress = runProgress(p);
  const spec = jobSpec(p);
  const perPage = 3;
  const pages = Math.max(1, Math.ceil(p.events.length / perPage));
  const current = Math.min(eventPage, pages - 1);
  const events = [...p.events].reverse().slice(current * perPage, (current + 1) * perPage);
  const elapsed = Math.max(p.tick * TICK_SECONDS, ...p.events.map((e) => e.t));
  const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  return <div className="run-overview">
    <header className="run-heading"><div><button type="button" className="link run-back" onClick={onBack}>← 학습 목록</button><h1 title={p.displayName}>{p.displayName}</h1></div><div className="run-heading-actions"><span className="run-config">{spec.distributedTraining.strategy.toUpperCase()} · GPU {spec.distributedTraining.worldSize}개</span><StateBadge state={p.state} />{!isTerminal(p.state) && <button type="button" className="btn" onClick={onStop}>학습 중지</button>}</div></header>
    <section className="card run-progress" data-state={p.state} aria-labelledby="run-progress-title">
      <div className="progress-top"><div><span className="eyebrow">학습 진행 상황</span><h2 id="run-progress-title">{progress.headline}</h2></div><div className="progress-percent"><strong>{progress.percent}<span>%</span></strong><span>전체 진행률</span></div></div>
      <div className="run-progress-track" role="progressbar" aria-label="전체 학습 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.percent}% · ${progress.headline}`}><span style={{ width: `${progress.percent}%` }} /></div>
      <ol className="run-stages" aria-label="실행 단계">{progress.stages.map((s, i) => <li key={s.label} data-state={s.state} aria-current={s.state === 'active' || s.state === 'error' || s.state === 'stopped' ? 'step' : undefined}><span className="run-stage-mark" aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'error' ? '!' : s.state === 'stopped' ? 'Ⅱ' : i + 1}</span><div><strong>{s.label}</strong><span>{s.state === 'done' ? '완료' : s.state === 'active' ? (p.state === 'PENDING' ? '대기 중' : '진행 중') : s.state === 'error' ? '실패' : s.state === 'stopped' ? '중지' : '대기'}</span></div></li>)}</ol>
      <div className="run-progress-caption"><span>{p.error ?? (progress.complete ? '학습한 모델과 결과 저장을 마쳤습니다.' : progress.interrupted ? '중지 시점까지의 진행 상태입니다.' : `${progress.stages[progress.active].label} 단계 · 상태가 자동으로 업데이트됩니다.`)}</span><span>목업 경과 <strong>{time(elapsed)}</strong></span></div>
    </section>
    <div className="run-detail-grid"><section className="card run-inputs"><div className="run-card-heading"><h2>학습 설정</h2><span className="small muted">전달한 입력</span></div><dl><div><dt>학습 모델</dt><dd title={spec.runner.model}>{spec.runner.model}</dd></div><div><dt>학습 데이터</dt><dd title={spec.runner.dataset}>{spec.runner.dataset}</dd></div><div className="run-compute"><div><dt>학습 방식</dt><dd>{spec.distributedTraining.strategy.toUpperCase()}</dd></div><div><dt>사용 GPU</dt><dd>{spec.distributedTraining.worldSize}개</dd></div><div><dt>실행 파일</dt><dd>train.py</dd></div></div></dl>{progress.complete && <p className="run-result-path" title={`${spec.baseOutputDirectory.outputUriPrefix}/model/`}>결과 저장 완료 · {spec.baseOutputDirectory.outputUriPrefix}/model/</p>}</section>
    <section className="card run-history"><div className="run-card-heading"><h2>실행 기록</h2><span className="history-live" data-live={!isTerminal(p.state)}>{isTerminal(p.state) ? '기록 종료' : '실시간 업데이트'}</span></div><ol className="run-timeline" aria-label="실행 기록">{events.map((event, i) => <li key={`${current}-${i}`} data-level={event.level}><time>+{time(event.t)}</time><span className="timeline-point" aria-hidden="true" /><p title={event.message}>{event.message}</p></li>)}</ol><footer className="history-pagination"><span>총 {p.events.length}개 기록 · 최근 순</span><div><button type="button" className="btn ghost" aria-label="최근 기록" disabled={current === 0} onClick={() => setEventPage(current - 1)}>←</button><span>{current + 1} / {pages}</span><button type="button" className="btn ghost" aria-label="이전 기록" disabled={current === pages - 1} onClick={() => setEventPage(current + 1)}>→</button></div></footer></section></div>
  </div>;
}
