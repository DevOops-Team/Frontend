import { STATE_LABEL } from './stateLabel';

export function StateBadge({ state, title, label }: { state: string; title?: string; label?: string }) {
  return (
    <span className="badge" data-state={state} title={title}>
      <span className="dot" aria-hidden="true" />
      {label ?? STATE_LABEL[state] ?? state}
    </span>
  );
}
