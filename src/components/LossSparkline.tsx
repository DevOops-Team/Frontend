import type { LossPoint } from '../lossHistory';

const W = 640;
const H = 160;
const PAD = 8;

// 화면에서 폴링으로 모은 (step, loss)를 SVG 선으로 그린다. x = step, y = loss.
export function LossSparkline({ points }: { points: LossPoint[] }) {
  if (points.length < 2) {
    return <p className="muted sparkline-empty">loss 기록을 모으는 중입니다. 2초마다 새 값이 들어오면 그래프가 그려집니다.</p>;
  }
  const steps = points.map((p) => p.step);
  const losses = points.map((p) => p.loss);
  const [x0, x1] = [Math.min(...steps), Math.max(...steps)];
  const [y0, y1] = [Math.min(...losses), Math.max(...losses)];
  const x = (s: number) => PAD + ((s - x0) / (x1 - x0 || 1)) * (W - 2 * PAD);
  const y = (l: number) => PAD + (1 - (l - y0) / (y1 - y0 || 1)) * (H - 2 * PAD);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.step).toFixed(1)},${y(p.loss).toFixed(1)}`).join(' ');
  const area = `${line} L${x(x1).toFixed(1)},${H - PAD} L${x(x0).toFixed(1)},${H - PAD} Z`;
  const last = points[points.length - 1];

  return (
    <figure className="sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`loss 그래프, ${points.length}개 지점`}>
        <defs>
          <linearGradient id="loss-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.25 }} />
            <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#loss-fill)" />
        <path d={line} style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
        <circle cx={x(last.step)} cy={y(last.loss)} r="3.5" style={{ fill: 'var(--accent)' }} />
      </svg>
      <figcaption className="sparkline-axis small muted">
        <span>step {x0}</span>
        <span>
          loss 최소 {y0.toFixed(4)} · 최대 {y1.toFixed(4)}
        </span>
        <span>step {x1}</span>
      </figcaption>
    </figure>
  );
}
