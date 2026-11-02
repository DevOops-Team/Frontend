import type { Job } from './api';

export interface LossPoint {
  step: number;
  loss: number;
}

export type LossHistory = Record<string, LossPoint[]>;

export const HISTORY_LIMIT = 120;

// 폴링한 작업 목록에서 작업별 (step, loss)를 메모리에 쌓는다. 백엔드는 마지막 값만 주므로 화면이 열려 있는 동안만 모인다.
// step이 같으면 새 점을 넣지 않고, step이 줄면(재시작 후 체크포인트에서 재개) 그 뒤의 점을 버린다.
export function appendHistory(prev: LossHistory, jobs: Job[], limit = HISTORY_LIMIT): LossHistory {
  let changed = false;
  const next: LossHistory = { ...prev };
  for (const j of jobs) {
    const p = j.progress;
    if (!p || !Number.isFinite(p.loss)) continue;
    const points = prev[j.id] ?? [];
    const last = points[points.length - 1];
    if (last && last.step === p.step) continue;
    const kept = last && p.step < last.step ? points.filter((pt) => pt.step < p.step) : points;
    next[j.id] = [...kept, { step: p.step, loss: p.loss }].slice(-limit);
    changed = true;
  }
  return changed ? next : prev;
}
