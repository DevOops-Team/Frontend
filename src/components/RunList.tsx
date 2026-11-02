import { taskOf } from '../mock/catalog';
import { since, stageLabel } from '../lib/format';
import { metricName, overallProgress, type Run, type RunStatus } from '../mock/runs';

const STATUS_LABEL: Record<RunStatus, string> = { Queued: '대기', Running: '실행 중', Succeeded: '완료', Failed: '실패' };

export function StatusBadge({ status, title }: { status: RunStatus; title?: string }) {
  return (
    <span className="badge" data-phase={status} title={title}>
      <span className="dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

// 실행 목록. 행을 누르면 상세 화면으로 간다.
export function RunList({ runs, onSelect }: { runs: Run[]; onSelect?: (id: string) => void }) {
  if (runs.length === 0) {
    return (
      <div className="empty">
        <p>아직 실행이 없습니다</p>
        <p className="muted">위의 마법사로 첫 파인튜닝을 시작해 보세요.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="runs">
        <thead>
          <tr>
            <th>실행</th>
            <th>상태</th>
            <th>태스크</th>
            <th>베이스 모델</th>
            <th>단계</th>
            <th>평가 지표</th>
            <th>생성</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const last = r.metric[r.metric.length - 1];
            return (
              <tr key={r.id} className="clickable" onClick={() => onSelect?.(r.id)}>
                <td>
                  <button
                    type="button"
                    className="link"
                    aria-label={`${r.request.name} 상세 보기`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect?.(r.id);
                    }}
                  >
                    {r.request.name}
                  </button>
                  <div className="muted small mono">{r.id}</div>
                </td>
                <td>
                  <StatusBadge status={r.status} title={r.failure?.reason} />
                </td>
                <td className="small">{taskOf(r.request.task).name}</td>
                <td className="small mono">{r.request.base_model}</td>
                <td className="progress-cell">
                  <progress aria-label={`${r.request.name} 진행률`} value={overallProgress(r)} max={1} data-failed={r.status === 'Failed' || undefined} />
                  <div className="small muted">{stageLabel(r)}</div>
                </td>
                <td className="mono small">{last ? `${metricName(r.request.task)} ${last.value.toFixed(3)}` : <span className="muted">—</span>}</td>
                <td className="small muted">{since(r.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
