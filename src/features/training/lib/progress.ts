import type { Job, JobStatus } from '../types';

// 실제 작업 상태 → 화면의 진행률 · 단계. 값은 k3s 상태와 train.py가 쓴 step에서만 나온다.

const LABELS = ['요청 접수', 'GPU 준비', '모델 학습', '결과 저장'];

export const STATUS_LABEL: Record<JobStatus, string> = {
  QUEUED: '대기 중',
  ADMITTED: 'GPU 준비 중',
  RUNNING: '실행 중',
  SUCCEEDED: '성공',
  FAILED: '실패',
};

// StateBadge · 진행 카드의 색은 PENDING · RUNNING · SUCCEEDED · FAILED만 있다.
export function uiState(s: JobStatus): string {
  return s === 'QUEUED' || s === 'ADMITTED' ? 'PENDING' : s;
}

function activeStage(job: Job): number {
  const { status, progress } = job;
  const hasSteps = progress !== null && progress.totalSteps > 0;
  if (status === 'SUCCEEDED') return 3;
  if (hasSteps) return progress.step >= progress.totalSteps ? 3 : 2;
  if (status === 'RUNNING' || status === 'ADMITTED') return 1;
  return status === 'FAILED' && job.cluster ? 1 : 0; // 클러스터까지 갔다면 GPU 준비 중에 실패한 것이다
}

export function runProgress(job: Job) {
  const complete = job.status === 'SUCCEEDED';
  const failed = job.status === 'FAILED';
  const active = activeStage(job);
  const { progress } = job;
  // 100%는 JobSet이 실제로 완료됐을 때만 보여 준다. 마지막 step 뒤에도 저장이 남아 있을 수 있다.
  const ratio = progress && progress.totalSteps > 0 ? Math.floor((progress.step / progress.totalSteps) * 100) : 0;
  const percent = complete ? 100 : Math.min(99, ratio);
  const stages = LABELS.map((label, i) => ({
    label,
    state: complete || i < active ? 'done' : i > active ? 'waiting' : failed ? 'error' : 'active',
  }));
  const headline = complete
    ? '학습이 완료됐어요'
    : failed
      ? '학습 중 문제가 발생했어요'
      : active === 0
        ? '실행 순서를 기다리고 있어요'
        : active === 1
          ? 'GPU를 준비하고 있어요'
          : active === 2
            ? '모델을 학습하고 있어요'
            : '결과를 저장하고 있어요';
  return { percent, active, stages, headline, complete, interrupted: failed };
}

// API에 따로 없어 total_steps ÷ epochs로 구한다. max_steps로 잘렸으면 이 계산이 맞지 않는다.
export function stepsPerEpoch(job: Job): number | null {
  const total = job.progress?.totalSteps;
  const cfg = job.config;
  if (!total || !cfg || cfg.max_steps !== null) return null;
  return total / cfg.epochs;
}
