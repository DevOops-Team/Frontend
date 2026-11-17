import { useEffect, useState } from 'react';
import { Icon } from '@/shared/ui/Icon';
import { ApiError, errorMessage, getTrainedModel, modelFileUrl } from '../api';
import { formatBytes, formatDateTime } from '../lib/format';
import type { Job, TrainedModel } from '../types';

// 학습 완료 모델: 학습이 끝난(SUCCEEDED) 작업의 마지막 승인 체크포인트를 보여 주고 내려받게 한다.
// 상태 4가지: 학습 중(빈 상태) · 불러오는 중 · 오류(다시 시도) · 완료(파일별 내려받기, S3에서 직접).

type Loaded = { id: string; model: TrainedModel | null; error: string; missing: boolean };

function emptyText(job: Job): string {
  if (job.status === 'FAILED' || job.status === 'CANCELLED') return '학습이 끝까지 완료되지 않아 내려받을 모델이 없습니다.';
  return '학습이 끝나면 마지막 체크포인트를 여기서 내려받을 수 있습니다.';
}

export function TrainedModelPanel({ job }: { job: Job }) {
  const finished = job.status === 'SUCCEEDED';
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!finished) return undefined;
    let live = true;
    getTrainedModel(job.id)
      .then((model) => { if (live) setLoaded({ id: job.id, model, error: '', missing: false }); })
      .catch((e: unknown) => {
        if (!live) return;
        const missing = e instanceof ApiError && e.status === 404;
        setLoaded({ id: job.id, model: null, error: missing ? '' : errorMessage(e), missing });
      });
    return () => { live = false; };
  }, [job.id, finished, attempt]);

  const current = loaded?.id === job.id ? loaded : null;
  const model = finished ? current?.model ?? null : null;

  let body;
  if (!finished) {
    body = <p className="muted">{emptyText(job)}</p>;
  } else if (!current) {
    body = <div className="model-skeleton" aria-hidden="true"><span /><span /><span /></div>;
  } else if (current.missing) {
    body = <p className="muted">승인된 체크포인트가 없어 내려받을 모델이 없습니다.</p>;
  } else if (current.error) {
    body = <>
      <p role="alert" className="issues">{current.error}</p>
      <div><button type="button" className="key" onClick={() => { setLoaded(null); setAttempt((n) => n + 1); }}>다시 불러오기</button></div>
    </>;
  } else if (model) {
    body = <>
      <div className="model-lead">
        <p className="model-step"><span>마지막 체크포인트</span><strong className="num">step {model.step.toLocaleString()}</strong><time className="num" dateTime={model.approvedAt}>{formatDateTime(model.approvedAt)} 승인</time></p>
      </div>
      <dl className="metrics">
        <div><dt>크기</dt><dd className="num">{formatBytes(model.sizeBytes)}</dd></div>
        <div><dt>형식</dt><dd><code>{model.format}</code></dd></div>
        <div><dt>저장 GPU</dt><dd className="num">{model.worldSize}개</dd></div>
        <div><dt>세대</dt><dd className="num">{model.generation}</dd></div>
      </dl>
      <h3 className="files-head">파일 {model.files.length}개</h3>
      {model.files.length > 1 && <p className="muted model-note">체크포인트는 모든 파일을 한 폴더에 받아야 불러올 수 있습니다.</p>}
      <ul className="file-list" aria-label="모델 파일">{model.files.map((f) => <li key={f.name}>
        <div className="file-row">
          <span className="file-name" title={`${f.name}\nsha256 ${f.sha256}`}>{f.name}</span>
          <span className="muted num">{formatBytes(f.size)}</span>
          <a className="link" href={modelFileUrl(job.id, f.name)} download aria-label={`${f.name} 내려받기`}><Icon name="download" size={16} />내려받기</a>
        </div>
      </li>)}</ul>
    </>;
  }

  return <section className="panel run-model" aria-labelledby="run-model-title" aria-busy={finished && !current ? true : undefined}>
    <div className="panel-head"><h2 id="run-model-title">학습 완료 모델</h2></div>
    {body}
  </section>;
}
