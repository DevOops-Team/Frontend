import { errorMessage } from '../api';
import type { JobStatus } from '../types';

// 끝난 학습만 지울 수 있다 (Backend DELETE /api/jobs/{id}는 그 밖에 409 NOT_FINISHED, GPU-196).
// 진행 중인 학습은 체크포인트를 쓰는 중이고 재배치될 수 있다.
export function isDeletable(status: JobStatus): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED';
}

export interface DeleteResult {
  deleted: string[];
  failed: { id: string; message: string }[];
}

// 고른 학습을 지운다. 하나가 실패해도 나머지는 계속하고, 학습마다 결과를 돌려준다.
// 학습 하나가 S3 객체 수천 개일 수 있어 동시에 몇 개씩만 보낸다.
export async function deleteJobs(ids: string[], del: (id: string) => Promise<unknown>, concurrency = 3): Promise<DeleteResult> {
  const result: DeleteResult = { deleted: [], failed: [] };
  const outcome = new Map<string, string | null>();
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        await del(id);
        outcome.set(id, null);
      } catch (e) {
        outcome.set(id, errorMessage(e));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  for (const id of ids) {
    const message = outcome.get(id);
    if (message === null) result.deleted.push(id);
    else result.failed.push({ id, message: message ?? '' });
  }
  return result;
}
