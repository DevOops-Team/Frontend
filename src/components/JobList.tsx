import type { Job } from '../api';

export function PhaseBadge({ phase, title }: { phase: Job['phase']; title?: string }) {
  return (
    <span className="badge" data-phase={phase} title={title}>
      <span className="dot" aria-hidden="true" />
      {phase}
    </span>
  );
}

function since(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

// 실행 목록. 행을 누르면 작업 상세 화면으로 간다.
export function JobList({ jobs, onSelect }: { jobs: Job[]; onSelect?: (id: string) => void }) {
  if (jobs.length === 0) {
    return (
      <div className="empty">
        <p>제출된 작업이 없습니다</p>
        <p className="muted">위의 마법사로 첫 학습 작업을 실행해 보세요.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="runs">
        <thead>
          <tr>
            <th>작업</th>
            <th>상태</th>
            <th>클러스터</th>
            <th>진행</th>
            <th>loss</th>
            <th>마지막 체크포인트</th>
            <th>노드</th>
            <th>생성</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="clickable" onClick={() => onSelect?.(j.id)}>
              <td>
                <button
                  type="button"
                  className="link"
                  aria-label={`${j.id} 상세 보기`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect?.(j.id);
                  }}
                >
                  <code>{j.id}</code>
                </button>
                {j.restarts > 0 && <div className="muted small">재시작 {j.restarts}회</div>}
              </td>
              <td>
                <PhaseBadge phase={j.phase} title={j.message} />
              </td>
              <td>{j.cluster ?? <span className="muted">미배정</span>}</td>
              {j.progress ? (
                <>
                  <td className="progress-cell">
                    <progress aria-label={`${j.id} 진행률`} value={j.progress.step} max={j.progress.totalSteps} />
                    <div className="small muted">{`${j.progress.step} / ${j.progress.totalSteps}`}</div>
                  </td>
                  <td className="mono">{j.progress.loss.toFixed(4)}</td>
                  <td className="mono">{j.progress.lastCheckpointStep}</td>
                  <td className="small">{j.progress.nodeName}</td>
                </>
              ) : (
                <td colSpan={4} className="muted">
                  진행 기록 없음
                </td>
              )}
              <td className="small muted">{since(j.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
