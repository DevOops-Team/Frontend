import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

// 모달 하나: 열리면 닫기 버튼에 포커스, Tab은 안에서만 돌고 Esc · 바깥 클릭으로 닫는다.
// 페이지의 스크롤 영역에 갇히지 않도록 body에 그린다.
const FOCUSABLE = 'button,a[href],input,select,textarea,[tabindex="0"]';

export function Dialog({ titleId, title, meta, closeLabel, onClose, children }: { titleId: string; title: ReactNode; meta?: ReactNode; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeButton.current?.focus(); }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const items = dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = items?.[0];
    const last = items?.[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal" onKeyDown={onKeyDown}>
        <header className="modal-head">
          <div><h2 id={titleId}>{title}</h2>{meta && <p className="muted">{meta}</p>}</div>
          <button ref={closeButton} type="button" className="key key--icon" onClick={onClose} aria-label={closeLabel}><Icon name="cross" size={18} /></button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
