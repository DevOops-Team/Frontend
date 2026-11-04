import type { Pipeline } from '../types';

const LABELS = ['요청 접수', 'GPU 준비', '모델 학습', '결과 저장'];
export function runProgress(p: Pipeline) {
  const complete = p.state === 'SUCCEEDED';
  const active = complete ? 3 : p.tick === 0 ? 0 : p.tick === 1 ? 1 : 2;
  const percent = complete ? 100 : p.tick === 0 ? 0 : Math.min(95, 10 + Math.round(Math.max(0, p.tick - 1) / Math.max(1, p.trainTicks) * 80));
  const interrupted = p.state === 'FAILED' || p.state === 'CANCELLED';
  const stages = LABELS.map((label, i) => ({
    label,
    state: complete || i < active ? 'done' : i > active ? 'waiting' : p.state === 'FAILED' ? 'error' : p.state === 'CANCELLED' ? 'stopped' : 'active',
  }));
  const headline = complete ? '학습이 완료됐어요' : p.state === 'FAILED' ? '학습 중 문제가 발생했어요' : p.state === 'CANCELLED' ? '학습이 중지됐어요' : active === 0 ? '실행 순서를 기다리고 있어요' : active === 1 ? 'GPU를 준비하고 있어요' : '모델을 학습하고 있어요';
  return { percent, active, stages, headline, complete, interrupted };
}
