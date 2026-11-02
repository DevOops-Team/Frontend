import { STAGES, type Run } from '../mock/runs';

export function since(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function stageLabel(run: Run): string {
  if (run.status === 'Succeeded') return '모델 등록 완료';
  if (run.status === 'Queued') return 'GPU 대기 중';
  if (run.failure) return `${STAGES[run.failure.stage]} 실패`;
  return STAGES[run.stage];
}

export function formatCount(n: number): string {
  return n.toLocaleString('ko-KR');
}
