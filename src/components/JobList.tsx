import { Fragment, useState } from 'react';
import type { Job } from '../api';
import { JobFiles } from './JobFiles';

export function JobList({ jobs }: { jobs: Job[] }) {
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());

  function toggleFiles(id: string) {
    setOpenFiles((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

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
          <th>파일</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <Fragment key={j.id}>
            <tr>
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
              <td>
                <button
                  type="button"
                  aria-label={`${j.id} 파일 보기`}
                  aria-expanded={openFiles.has(j.id)}
                  onClick={() => toggleFiles(j.id)}
                >
                  {openFiles.has(j.id) ? '닫기' : '보기'}
                </button>
              </td>
            </tr>
            {openFiles.has(j.id) && (
              <tr>
                <td colSpan={8}>
                  <JobFiles jobId={j.id} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
