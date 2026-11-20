import type { JobStatus } from '../types';

// 중단할 수 있는 학습 (Backend POST /api/jobs/{id}/stop, GPU-204). 대기 · GPU 준비 · 실행 중일 때만.
// 복구 중에는 재배치 실행기가 다음 세대를 곧 만들므로 다시 실행된 뒤에 중단한다(409 RECOVERING).
export function isStoppable(status: JobStatus): boolean {
  return status === 'QUEUED' || status === 'ADMITTED' || status === 'RUNNING';
}

// 중단 버튼을 보여 줄 학습. 복구 중이면 버튼은 보이되 꺼져 있다.
export function showsStop(status: JobStatus): boolean {
  return isStoppable(status) || status === 'RECOVERING';
}

export const STOP_RECOVERING_HINT = '다른 GPU로 옮기는 중에는 중단할 수 없습니다. 다시 실행되면 중단해 주세요.';

// 다시 시작할 수 있는 학습 (Backend POST /api/jobs/{id}/restart, GPU-240). 사용자가 중단한(CANCELLED) 학습만.
// 새 세대로 다시 제출되어 마지막으로 저장된 체크포인트 다음 step부터 학습한다. '중단 중'(STOPPING)은 끝나길 기다린다.
export function isRestartable(status: JobStatus): boolean {
  return status === 'CANCELLED';
}
