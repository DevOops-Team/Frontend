import { jobSpec, type Pipeline } from '../mock/store';

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

// 경과 초 → "1시간 2분" / "4분 30초"
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return s ? `${m}분 ${s}초` : `${m}분`;
  return `${s}초`;
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function poolSummary(p: Pipeline): string {
  return jobSpec(p)
    .workerPoolSpecs.map((w) => {
      const acc = w.machineSpec.acceleratorType ? ` + ${w.machineSpec.acceleratorType} ×${w.machineSpec.acceleratorCount}` : '';
      return `${w.machineSpec.machineType}${acc} ×${w.replicaCount}`;
    })
    .join(' / ');
}
