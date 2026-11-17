import { Badge } from '@astryxdesign/core/Badge';
import { STATE_LABEL } from './stateLabel';

// 상태 → Astryx Badge. 색만으로 구분하지 않도록 글자를 항상 함께 보여 준다.
const VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  PENDING: 'warning',
  REQUESTED: 'warning',
  RUNNING: 'info',
  ACTIVE: 'info',
  SUCCEEDED: 'success',
  FAILED: 'error',
  INFEASIBLE: 'error',
  CANCELLED: 'neutral',
};

export function StateBadge({ state, label }: { state: string; title?: string; label?: string }) {
  return <Badge variant={VARIANT[state] ?? 'neutral'} label={label ?? STATE_LABEL[state] ?? state} />;
}
