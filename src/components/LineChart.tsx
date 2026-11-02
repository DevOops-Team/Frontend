import { useId } from 'react';
import type { Point } from '../mock/runs';

const W = 640;
const H = 160;
const PAD = 8;

interface Props {
  points: Point[];
  label: string;
  color?: string;
  digits?: number;
}

// (step, 값)을 SVG 선으로 그린다. loss와 평가 지표 그래프에 같이 쓴다.
export function LineChart({ points, label, color = 'var(--accent)', digits = 4 }: Props) {
  const gradId = useId();
  if (points.length < 2) {
    return <p className="muted sparkline-empty">{label} 기록을 모으는 중입니다. 학습 단계가 진행되면 그래프가 그려집니다.</p>;
  }
  const steps = points.map((p) => p.step);
  const values = points.map((p) => p.value);
  const [x0, x1] = [Math.min(...steps), Math.max(...steps)];
  const [y0, y1] = [Math.min(...values), Math.max(...values)];
  const x = (s: number) => PAD + ((s - x0) / (x1 - x0 || 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - y0) / (y1 - y0 || 1)) * (H - 2 * PAD);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.step).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(x1).toFixed(1)},${H - PAD} L${x(x0).toFixed(1)},${H - PAD} Z`;
  const last = points[points.length - 1];

  return (
    <figure className="sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} 그래프, ${points.length}개 지점`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} style={{ fill: 'none', stroke: color, strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
        <circle cx={x(last.step)} cy={y(last.value)} r="3.5" style={{ fill: color }} />
      </svg>
      <figcaption className="sparkline-axis small muted">
        <span>step {x0}</span>
        <span>
          최소 {y0.toFixed(digits)} · 최대 {y1.toFixed(digits)} · 현재 <strong>{last.value.toFixed(digits)}</strong>
        </span>
        <span>step {x1}</span>
      </figcaption>
    </figure>
  );
}
