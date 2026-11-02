import type { ReactNode } from 'react';
import type { PipelineState } from '../mock/store';

const STATE_LABEL: Record<string, string> = {
  PENDING: '대기 중',
  RUNNING: '실행 중',
  SUCCEEDED: '성공',
  FAILED: '실패',
  CANCELLED: '취소됨',
  REQUESTED: '요청됨',
  ACTIVE: '실행 중',
  INFEASIBLE: '실행 불가',
};

export function StateBadge({ state, title, label }: { state: PipelineState | string; title?: string; label?: string }) {
  return (
    <span className="badge" data-state={state} title={title}>
      <span className="dot" aria-hidden="true" />
      {label ?? STATE_LABEL[state] ?? state}
    </span>
  );
}

export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function PageHeader({ crumbs, title, actions, children }: { crumbs?: Crumb[]; title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      {crumbs && crumbs.length > 0 && (
        <nav className="breadcrumb" aria-label="위치">
          {crumbs.map((c, i) => (
            <span key={c.label + i} className="crumb">
              {c.onClick ? (
                <button type="button" className="link" onClick={c.onClick}>
                  {c.label}
                </button>
              ) : (
                <span>{c.label}</span>
              )}
              <span aria-hidden="true" className="crumb-sep">
                ›
              </span>
            </span>
          ))}
        </nav>
      )}
      <div className="page-title-row">
        <h1>{title}</h1>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function FilterBar({ query, onQuery, state, onState, states, placeholder = '이름 또는 ID로 필터' }: {
  query: string;
  onQuery: (q: string) => void;
  state?: string;
  onState?: (s: string) => void;
  states?: string[];
  placeholder?: string;
}) {
  return (
    <div className="filter-bar">
      <span className="filter-icon" aria-hidden="true">
        ⌕
      </span>
      <input className="filter-input" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label="필터" />
      {states && onState && (
        <select value={state} onChange={(e) => onState(e.target.value)} aria-label="상태 필터">
          <option value="">모든 상태</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {STATE_LABEL[s] ?? s}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function KeyValues({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
