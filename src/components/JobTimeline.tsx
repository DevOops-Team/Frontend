import { useEffect, useState } from 'react';
import { listEvents, type JobEvent } from '../api';
import { STAGES, stageOf, type StageId } from './stages';

const POLL_MS = 2000;

const LABELS: Record<StageId, string> = {
  ...(Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<(typeof STAGES)[number]['id'], string>),
  other: '기타',
};

function byTime(a: JobEvent, b: JobEvent) {
  return a.time.localeCompare(b.time) || a.key.localeCompare(b.key);
}

function clock(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleTimeString('ko-KR', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

// 단계별 상태: 이벤트가 없으면 waiting, 마지막 이벤트가 Warning이면 warning, 아니면 done.
function stageStates(events: JobEvent[]) {
  const last = new Map<StageId, JobEvent>();
  for (const e of events) last.set(stageOf(e), e);
  return STAGES.map((s) => {
    const e = last.get(s.id);
    const state = !e ? 'waiting' : e.type === 'Warning' ? 'warning' : 'done';
    return { ...s, state, hint: e ? `${e.cluster} · ${e.reason}` : '아직 없음' };
  });
}

export function JobTimeline({ jobId }: { jobId: string }) {
  const [events, setEvents] = useState<JobEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const load = () =>
      listEvents(jobId)
        .then((es) => {
          if (!current) return;
          setEvents([...es].sort(byTime));
          setError(null);
        })
        .catch((err) => current && setError(String(err.message ?? err)));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [jobId]);

  if (error && !events) return <p role="alert">전달 상태를 불러오지 못했습니다: {error}</p>;
  if (!events) return <p className="muted">불러오는 중…</p>;

  return (
    <div className="timeline">
      <ol className="stages" aria-label="전달 경로">
        {stageStates(events).map((s) => (
          <li key={s.id} data-state={s.state} title={s.hint}>
            {s.label}
          </li>
        ))}
      </ol>
      {events.length === 0 ? (
        <p className="muted">기록된 단계가 없습니다</p>
      ) : (
        <table className="events">
          <thead>
            <tr>
              <th>시각</th>
              <th>단계</th>
              <th>클러스터</th>
              <th>이유</th>
              <th>메시지</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.key} className={e.type === 'Warning' ? 'warning' : undefined}>
                <td>{clock(e.time)}</td>
                <td>{LABELS[stageOf(e)]}</td>
                <td>{e.cluster}</td>
                <td title={e.object}>
                  {e.reason}
                  {e.count > 1 && ` ×${e.count}`}
                </td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="muted">갱신 실패: {error}</p>}
    </div>
  );
}
