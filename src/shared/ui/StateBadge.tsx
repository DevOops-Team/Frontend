import { Icon, type IconName } from './Icon';
import { STATE_LABEL } from './stateLabel';

// 상태는 색 칩이 아니라 글자 + 아이콘 하나로 보여 준다. 색만으로 구분하지 않도록 상태마다 모양이 다르다.
const STATE_ICON: Record<string, IconName> = {
  PENDING: 'clock',
  REQUESTED: 'clock',
  RUNNING: 'play',
  ACTIVE: 'play',
  SUCCEEDED: 'check',
  FAILED: 'cross',
  INFEASIBLE: 'cross',
  CANCELLED: 'stop',
};

export function StateBadge({ state, title, label }: { state: string; title?: string; label?: string }) {
  return (
    <span className="badge" data-state={state} title={title}>
      <Icon name={STATE_ICON[state] ?? 'clock'} size={15} />
      {label ?? STATE_LABEL[state] ?? state}
    </span>
  );
}
