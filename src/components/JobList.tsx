import type { Job } from '../api';

export function JobList({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return <p>제출된 작업이 없습니다</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>작업</th>
          <th>상태</th>
          <th>클러스터</th>
          <th>진행</th>
          <th>loss</th>
          <th>마지막 체크포인트</th>
          <th>노드</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td>
              <code>{j.id}</code>
              {j.restarts > 0 && <div className="muted">재시작 {j.restarts}회</div>}
            </td>
            <td title={j.message}>{j.phase}</td>
            <td>{j.cluster ?? <span className="muted">미배정</span>}</td>
            {j.progress ? (
              <>
                <td>
                  <progress aria-label={`${j.id} 진행률`} value={j.progress.step} max={j.progress.totalSteps} />
                  <div>{`${j.progress.step} / ${j.progress.totalSteps}`}</div>
                </td>
                <td>{j.progress.loss.toFixed(4)}</td>
                <td>{j.progress.lastCheckpointStep}</td>
                <td>{j.progress.nodeName}</td>
              </>
            ) : (
              <td colSpan={4} className="muted">
                진행 기록 없음
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
