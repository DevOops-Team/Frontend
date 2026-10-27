import { useEffect, useState } from 'react';
import { getFile, listFiles, type FileContent, type JobFile } from '../api';

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

// 작업에 올린 job.yaml·train.py·학습 데이터를 보여준다. 처음에는 첫 파일(job.yaml)을 연다.
export function JobFiles({ jobId }: { jobId: string }) {
  const [files, setFiles] = useState<JobFile[] | null>(null);
  const [selected, setSelected] = useState<JobFile | null>(null);
  const [content, setContent] = useState<FileContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFiles(jobId)
      .then((fs) => {
        setFiles(fs);
        setSelected(fs[0] ?? null);
      })
      .catch((err) => setError(String(err.message ?? err)));
  }, [jobId]);

  useEffect(() => {
    if (!selected) return;
    let current = true;
    setContent(null);
    getFile(jobId, selected.kind, selected.name)
      .then((c) => current && setContent(c))
      .catch((err) => current && setError(String(err.message ?? err)));
    return () => {
      current = false;
    };
  }, [jobId, selected]);

  if (error) return <p role="alert">파일을 불러오지 못했습니다: {error}</p>;
  if (!files) return <p className="muted">불러오는 중…</p>;
  if (files.length === 0) return <p className="muted">저장된 파일이 없습니다</p>;

  return (
    <div className="files">
      <div className="file-tabs">
        {files.map((f) => (
          <button
            key={`${f.kind}/${f.name}`}
            type="button"
            aria-pressed={selected === f}
            onClick={() => setSelected(f)}
          >
            {f.name}{' '}
            <span className="muted">
              {f.kind === 'data' ? '데이터' : '코드'} · {formatSize(f.size)}
            </span>
          </button>
        ))}
      </div>
      {content?.truncated && (
        <p className="muted">
          앞부분만 표시 ({formatSize(content.text.length)} / 전체 {formatSize(content.totalSize)})
        </p>
      )}
      <pre aria-label="파일 내용">{content ? content.text : '불러오는 중…'}</pre>
    </div>
  );
}
