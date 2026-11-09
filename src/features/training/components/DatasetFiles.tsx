import { useEffect, useState } from 'react';
import { datasetFile, errorMessage, getDataset } from '../api';
import { formatBytes } from '../lib/format';
import type { Dataset } from '../types';
import { FileList } from './FileList';

// S3에 준비된 학습 데이터 한 버전의 파일 목록과 모달 미리보기.
function DatasetVersionFiles({ id, version }: { id: string; version?: number }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getDataset(id).then((d) => { if (live) { setDataset(d); setError(''); } }).catch((e: unknown) => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [id]);

  if (error) return <p role="alert" className="issues">{error}</p>;
  if (!dataset) return <p className="muted small">학습 데이터를 불러오는 중입니다.</p>;
  const shown = dataset.versions?.find((v) => v.version === (version ?? dataset.latestVersion));
  if (!shown) return <p className="muted small">이 버전의 학습 데이터를 찾을 수 없습니다.</p>;

  return <div className="asset-box">
    <div className="asset-head"><h3 className="asset-title">{dataset.name} · v{shown.version}</h3><span className="muted small">{dataset.format} · 파일 {shown.fileCount}개 · {formatBytes(shown.totalBytes)}</span><code className="asset-uri">{shown.uri}</code></div>
    <FileList label="학습 데이터" preview="modal" files={shown.files} load={(name) => datasetFile(dataset.id, shown.version, name)} />
  </div>;
}

// 실행 상세: 그 작업이 쓴 데이터. 스크롤 없이 보이도록 진행 상황 바로 아래에 둔다.
export function JobDataset({ id, version }: { id: string; version: number }) {
  return <section className="card run-dataset" aria-labelledby="run-dataset-title">
    <div className="run-card-heading"><h2 id="run-dataset-title">학습 데이터</h2></div>
    <DatasetVersionFiles id={id} version={version} />
  </section>;
}
