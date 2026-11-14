import { useRef, useState } from 'react';
import { errorMessage } from '../api';
import { Dialog } from '@/shared/ui/Dialog';
import { formatBytes } from '../lib/format';
import type { FilePreview } from '../types';

// S3에 있는 파일 목록과 텍스트 파일 미리보기. 가중치 같은 바이너리는 크기만 보여 준다.

const TEXT_FILE = /\.(json|jsonl|txt|py|csv|yaml|yml)$/i;

type PreviewMode = 'inline' | 'modal';

function PreviewBody({ preview, error, loading }: { preview: FilePreview | null; error: string; loading: boolean }) {
  return <>
    {error && <p role="alert" className="issues">{error}</p>}
    {loading && !preview && !error && <p className="muted">불러오는 중입니다.</p>}
    {preview && <>
      {/* 키보드로도 긴 내용을 스크롤할 수 있게 포커스를 받는다 */}
      <pre className="file-preview" tabIndex={0}>{preview.text}</pre>
      {preview.truncated && <p className="muted">전체 {formatBytes(preview.totalSize)} 중 앞부분만 보여 줍니다.</p>}
    </>}
  </>;
}

function FileRow({ name, size, load, mode, label }: { name: string; size: number; load: (name: string) => Promise<FilePreview>; mode: PreviewMode; label: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  async function show() {
    setOpen(true);
    if (preview) return;
    setLoading(true);
    setError('');
    try {
      setPreview(await load(name));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  const body = <PreviewBody preview={preview} error={error} loading={loading} />;
  const inlineOpen = mode === 'inline' && open;
  return <li>
    <div className="file-row">
      <span className="file-name" title={name}>{name}</span>
      <span className="muted num">{formatBytes(size)}</span>
      {TEXT_FILE.test(name) && <button ref={opener} type="button" className="link" aria-label={`${name} 미리보기`} aria-expanded={mode === 'inline' ? open : undefined} aria-haspopup={mode === 'modal' ? 'dialog' : undefined} onClick={() => { if (inlineOpen) close(); else void show(); }}>{inlineOpen ? '닫기' : '미리보기'}</button>}
    </div>
    {inlineOpen && body}
    {mode === 'modal' && open && <Dialog titleId="file-preview-title" title={<code>{name}</code>} meta={<><span>{label}</span> <span className="num">{formatBytes(size)}</span></>} closeLabel="미리보기 닫기" onClose={close}>{body}</Dialog>}
  </li>;
}

export function FileList({ files, load, label, preview = 'inline' }: { files: { name: string; size: number }[]; load: (name: string) => Promise<FilePreview>; label: string; preview?: PreviewMode }) {
  if (files.length === 0) return <p className="muted">표시할 파일이 없습니다.</p>;
  return <ul className="file-list" aria-label={label}>{files.map((f) => <FileRow key={f.name} name={f.name} size={f.size} load={load} mode={preview} label={label} />)}</ul>;
}
