import type { JobEvent } from '../api';

// 작업이 GPU까지 가는 경로. 각 이벤트의 출처(source)와 클러스터로 단계를 정한다.
export const STAGES = [
  { id: 'submit', label: '제출' },
  { id: 'manager', label: 'k3s Kueue' },
  { id: 'multikueue', label: 'MultiKueue' },
  { id: 'worker', label: '워커 Kueue' },
  { id: 'jobset', label: 'JobSet' },
  { id: 'scheduler', label: 'kube-scheduler' },
  { id: 'karpenter', label: 'Karpenter' },
  { id: 'kubelet', label: 'kubelet' },
  { id: 'done', label: '완료' },
] as const;

export type StageId = (typeof STAGES)[number]['id'] | 'other';

export function stageOf(e: JobEvent): StageId {
  if (e.source === 'backend') return 'submit';
  if (e.source === 'multikueue' || e.reason === 'MultiKueue') return 'multikueue';
  if (e.source === 'kueue' && e.reason === 'Finished') return 'done';
  // kueue-admission, kueue-workload-controller, jobset.x-k8s.io/jobset-kueue-controller(Kueue의 JobSet 연동)
  if (e.source.includes('kueue')) return e.cluster === 'k3s' ? 'manager' : 'worker';
  if (e.source.startsWith('jobset') || e.source === 'job-controller') return 'jobset';
  if (e.source === 'default-scheduler') return 'scheduler';
  if (e.source === 'karpenter') return 'karpenter';
  if (e.source === 'kubelet') return 'kubelet';
  return 'other';
}
