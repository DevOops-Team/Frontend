import { useEffect, useRef, useState } from 'react';
import { buildSpec, createJob, errorMessage, getOptions, type Upload, type UploadFile } from '../api';
import type { TrainingOptions } from '../types';
import { formatBytes } from '../lib/format';
import { parseHyperparameters, rangeText } from '../lib/hyperparameters';
import { checkpointInterval, formatDuration, pickData, pickModel, type PickedFile } from '../lib/upload';

const NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const STRATEGY_TEXT: Record<string, { tag: string; title: string; body: string; choice: string }> = {
  fsdp: { tag: '메모리 절약', title: '모델을 여러 GPU에 나눠 담을 때', body: '모델을 나눠 GPU 메모리를 절약합니다.', choice: '큰 모델을 여러 GPU에 나눠 담습니다.' },
  ddp: { tag: '적은 GPU', title: '모델이 GPU 한 장에 들어갈 때', body: '같은 모델로 데이터를 나눠 학습합니다.', choice: '모델을 GPU마다 복사하고 데이터를 나눠 학습합니다.' },
};

interface Chosen<T> { pick: T; uploads: UploadFile[] }

function toPicked(list: FileList | null, relative: boolean): { picked: PickedFile[]; byPath: Map<string, File> } {
  const byPath = new Map<string, File>();
  const picked: PickedFile[] = [];
  for (const f of Array.from(list ?? [])) {
    const path = relative && f.webkitRelativePath ? f.webkitRelativePath : f.name;
    byPath.set(path, f);
    picked.push({ path, size: f.size });
  }
  return { picked, byPath };
}

// 로컬의 Hugging Face 모델 폴더와 jsonl 학습 데이터를 골라 설정과 함께 올린다.
export function CreatePipeline({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [options, setOptions] = useState<TrainingOptions | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState<Chosen<ReturnType<typeof pickModel>> | null>(null);
  const [data, setData] = useState<Chosen<ReturnType<typeof pickData>> | null>(null);
  const [strategy, setStrategy] = useState('');
  const [gpus, setGpus] = useState(0);
  const [hyper, setHyper] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [issue, setIssue] = useState('');
  const [sent, setSent] = useState<{ loaded: number; total: number } | null>(null);
  const upload = useRef<Upload | null>(null);

  useEffect(() => {
    let live = true;
    getOptions().then((o) => {
      if (!live) return;
      setOptions(o);
      setStrategy(o.defaultStrategy);
      setGpus(o.gpus.default);
    }).catch((e: unknown) => { if (live) setLoadError(errorMessage(e)); });
    return () => { live = false; upload.current?.abort(); };
  }, []);

  const limits = options?.limits ?? { maxModelBytes: 0, maxDataBytes: 0, maxFiles: 0 };
  const strategyInfo = options?.strategies.find((s) => s.name === strategy);
  const minGpus = strategyInfo?.minGpus ?? 1;
  const strategyText = STRATEGY_TEXT[strategy] ?? { tag: '', title: strategy, body: '', choice: '' };
  // 고를 수 없는 값도 이유와 함께 보여 준다. 할당량이 늘면 백엔드 설정의 max만 올리면 된다.
  const gpuOptions = (options?.gpus.options ?? []).map((n) => ({
    n, reason: n < minGpus ? `${strategy.toUpperCase()}는 ${minGpus}개 이상` : options && n > options.gpus.max ? '현재 할당량 초과' : '',
  }));
  const parsed = parseHyperparameters(options?.hyperparameters ?? [], hyper);
  const nameError = name.trim() && !NAME.test(name.trim()) ? '학습 이름은 1~63자의 소문자 · 숫자 · 하이픈만 쓸 수 있습니다.' : '';
  const ckpt = model && options ? checkpointInterval(model.pick.bytes, options.checkpoint) : null;
  const fileCount = (model?.pick.files.length ?? 0) + (data?.pick.files.length ?? 0);

  function chooseModel(list: FileList | null) {
    const { picked, byPath } = toPicked(list, true);
    const pick = pickModel(picked, limits);
    setModel({ pick, uploads: pick.files.map((f) => ({ path: f.path, file: byPath.get(f.path) as File })) });
    setIssue('');
  }

  function chooseData(list: FileList | null) {
    const { picked, byPath } = toPicked(list, false);
    const pick = pickData(picked, limits);
    setData({ pick, uploads: pick.files.map((f) => ({ path: f.path, file: byPath.get(f.path) as File })) });
    setIssue('');
  }

  function chooseStrategy(next: string) {
    setStrategy(next);
    const needed = options?.strategies.find((s) => s.name === next)?.minGpus ?? 1;
    if (options && gpus < needed) setGpus(options.gpus.options.find((n) => n >= needed && n <= options.gpus.max) ?? options.gpus.default);
  }

  async function submit() {
    if (!model || !data) return;
    setIssue('');
    setSent({ loaded: 0, total: 1 });
    upload.current = createJob(buildSpec({ name, strategy, gpus }, parsed.values), model.uploads, data.uploads,
      (loaded, total) => setSent({ loaded, total }));
    try {
      const created = await upload.current.done;
      onCreated(created.id);
    } catch (e) {
      setIssue(errorMessage(e));
      setSent(null);
    } finally {
      upload.current = null;
    }
  }

  function next() {
    if (step === 0) {
      if (!options) { setIssue(loadError || '설정을 불러오는 중입니다.'); return; }
      if (nameError) { setIssue(nameError); return; }
      if (!model || model.pick.errors.length > 0) { setIssue(model?.pick.errors.join(' ') ?? '모델 폴더를 선택해 주세요.'); return; }
    }
    if (step === 1 && (!data || data.pick.errors.length > 0)) { setIssue(data?.pick.errors.join(' ') ?? '학습 데이터(.jsonl)를 선택해 주세요.'); return; }
    if (step === 2 && parsed.errors.length > 0) { setAdvancedOpen(true); setIssue(parsed.errors.join(' ')); return; }
    if (step === 2 && fileCount > limits.maxFiles) { setIssue(`파일이 너무 많습니다 (최대 ${limits.maxFiles}개).`); return; }
    if (step === 3) { void submit(); return; }
    setIssue('');
    setStep(step + 1);
  }

  const uploading = sent !== null;
  const percent = sent ? Math.min(100, Math.floor((sent.loaded / sent.total) * 100)) : 0;

  return <>
    <header className="hero create-heading"><h1>새 학습 만들기</h1><p className="muted">내 컴퓨터의 Hugging Face 모델 폴더와 jsonl 학습 데이터를 올려 학습합니다.</p></header>
    <div className="guided-layout">
      <section className="card wizard">
        <ol className="stepper guided-stepper">{['모델', '데이터', '방식·GPU', '최종 확인'].map((label, i) => <li key={label} data-state={i === step ? 'current' : i < step ? 'done' : ''}><button type="button" disabled={i > step || uploading} onClick={() => { setIssue(''); setStep(i); }}><span className="step-num">{i < step ? '✓' : i + 1}</span>{label}</button></li>)}</ol>
        <div className="wizard-body">
          {step === 0 && <section><h2>어떤 모델을 학습할까요?</h2><p className="muted">Hugging Face 형식의 모델 폴더(config.json · 가중치 · 토크나이저)를 통째로 고르세요. 이름은 비워 두면 폴더 이름으로 정해집니다.</p>
            <div className="form-grid"><label className="field"><span>학습 이름 · 선택</span><input aria-label="학습 이름" placeholder="예: gpt2-demo" value={name} onChange={(e) => setName(e.target.value)} /><span className="muted small">소문자 · 숫자 · 하이픈</span></label>
              <label className="field"><span>모델 폴더</span><input aria-label="모델 폴더" type="file" {...{ webkitdirectory: '', directory: '' }} multiple onChange={(e) => chooseModel(e.target.files)} /><span className="muted small">최대 {formatBytes(limits.maxModelBytes)}</span></label>
            </div>
            {!options && !loadError && <p className="muted">설정을 불러오는 중입니다.</p>}
            {model && model.pick.files.length > 0 && <div className="asset-box"><div className="asset-head"><strong>{model.pick.folder}</strong><span className="muted small">파일 {model.pick.files.length}개 · {formatBytes(model.pick.bytes)}</span></div>
              <ul className="muted small">{model.pick.files.slice(0, 8).map((f) => <li key={f.path}>{f.path.slice(model.pick.folder.length + 1)} · {formatBytes(f.size)}</li>)}{model.pick.files.length > 8 && <li>외 {model.pick.files.length - 8}개</li>}</ul></div>}
          </section>}
          {step === 1 && <section><h2>어떤 데이터로 학습할까요?</h2><p className="muted">한 줄에 {'{"text": "..."}'} 하나씩 들어 있는 .jsonl 파일을 고르세요. 모든 GPU가 같은 데이터를 받아 나눠 학습합니다.</p>
            <div className="form-grid"><label className="field"><span>학습 데이터</span><input aria-label="학습 데이터" type="file" accept=".jsonl" multiple onChange={(e) => chooseData(e.target.files)} /><span className="muted small">최대 {formatBytes(limits.maxDataBytes)}</span></label></div>
            {data && data.pick.files.length > 0 && <div className="asset-box"><div className="asset-head"><strong>파일 {data.pick.files.length}개</strong><span className="muted small">{formatBytes(data.pick.bytes)}</span></div>
              <ul className="muted small">{data.pick.files.map((f) => <li key={f.path}>{f.path} · {formatBytes(f.size)}</li>)}</ul></div>}
          </section>}
          {step === 2 && <section className="strategy-step"><h2>학습 방식과 GPU를 선택하세요</h2><p className="muted">GPU 메모리가 부족한 큰 모델에는 FSDP가 적합합니다.</p>
            <div className="strategy-grid" role="radiogroup" aria-label="학습 방식">{(options?.strategies ?? []).map((s) => { const t = STRATEGY_TEXT[s.name] ?? strategyText; return <label className="strategy-card" key={s.name} data-selected={strategy === s.name}><input type="radio" name="strategy" checked={strategy === s.name} onChange={() => chooseStrategy(s.name)} /><span className="strategy-title">{s.name.toUpperCase()} <span className="strategy-tag">{t.tag}</span></span><strong>{t.title}</strong><span className="muted">{t.body}</span></label>; })}</div>
            <div className="form-grid"><label className="field"><span>총 GPU 개수 (노드당 1개)</span><select aria-label="총 GPU 개수" value={gpus} onChange={(e) => setGpus(Number(e.target.value))}>{gpuOptions.map(({ n, reason }) => <option key={n} value={n} disabled={Boolean(reason)}>{n}개{reason ? ` (${reason})` : ''}</option>)}</select></label></div>
            <div className="advanced-settings">
              <button type="button" className="advanced-toggle" aria-expanded={advancedOpen} aria-controls="advanced-settings-body" onClick={() => setAdvancedOpen(!advancedOpen)}><span aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>상세 설정</button>
              {advancedOpen && <div id="advanced-settings-body" className="advanced-body"><p className="muted small">비워 두면 기본값으로 학습합니다.</p>
                <div className="form-grid">{options?.hyperparameters.map((h) => <label className="field" key={h.key}><span>{h.key}</span><input aria-label={h.key} type="text" inputMode="decimal" autoComplete="off" placeholder={h.default === null ? '없음' : String(h.default)} value={hyper[h.key] ?? ''} onChange={(e) => { setHyper({ ...hyper, [h.key]: e.target.value }); setIssue(''); }} /><span className="muted small">{rangeText(h)}</span></label>)}</div></div>}
            </div>
          </section>}
          {step === 3 && <section className="review-step"><h2>이 설정으로 학습을 시작할까요?</h2><p className="muted">{strategyText.choice}</p>
            <dl className="review-grid"><div><dt>학습 이름</dt><dd>{name.trim() || `${model?.pick.folder ?? ''}-(자동)`}</dd></div><div><dt>학습 방식</dt><dd>{strategy.toUpperCase()}</dd></div><div><dt>사용 GPU</dt><dd>{gpus}대 × GPU 1개</dd></div>
              <div><dt>학습 모델</dt><dd>{model?.pick.folder} · {formatBytes(model?.pick.bytes ?? 0)}</dd></div><div><dt>학습 데이터</dt><dd>파일 {data?.pick.files.length}개 · {formatBytes(data?.pick.bytes ?? 0)}</dd></div>
              {ckpt && <div><dt>체크포인트 간격</dt><dd>약 {formatDuration(ckpt.intervalSeconds)}마다 (저장 약 {formatDuration(ckpt.saveSeconds)})</dd></div>}
              {options?.hyperparameters.map((h) => <div key={h.key}><dt>{h.key}</dt><dd>{parsed.values[h.key] ?? h.default ?? '없음'}</dd></div>)}</dl>
            <p className="help-note review-note">체크포인트 간격은 저장 시간과 장애 때 잃는 시간의 합이 가장 작도록 계산합니다. 학습을 시작하면 처음 몇 step을 재서 저장 횟수를 정합니다.</p>
            {uploading && <div className="run-progress-track" role="progressbar" aria-label="업로드 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>}
            {uploading && <p className="muted small">{percent < 100 ? `업로드 중 ${percent}% · ${formatBytes(sent.loaded)} / ${formatBytes(sent.total)}` : '업로드 완료 · 학습을 제출하는 중입니다.'}</p>}
          </section>}
          {loadError && <p role="alert" className="issues">{loadError}</p>}
          {issue && <p role="alert" className="issues">{issue}</p>}
        </div>
        <footer className="wizard-actions">
          <button type="button" className="btn ghost" onClick={() => { if (uploading) { upload.current?.abort(); return; } if (step === 0) onCancel(); else { setIssue(''); setStep(step - 1); } }}>{uploading ? '업로드 취소' : step === 0 ? '취소' : '이전'}</button>
          <button type="button" className="btn primary" disabled={uploading} onClick={next}>{['다음: 학습 데이터', '다음: 학습 방식', '다음: 최종 확인', uploading ? '올리는 중…' : '업로드하고 학습 시작'][step]}</button>
        </footer>
      </section>
      <aside className="card guided-summary"><span className="eyebrow">실행 전 요약</span><h2>{strategy.toUpperCase()} 학습</h2><p className="muted">{strategyText.choice}</p>
        <dl className="review-grid"><div><dt>전체 GPU</dt><dd>{gpus}개</dd></div><div><dt>모델</dt><dd>{model?.pick.folder || '-'}</dd></div><div><dt>업로드</dt><dd>{formatBytes((model?.pick.bytes ?? 0) + (data?.pick.bytes ?? 0))}</dd></div></dl></aside>
    </div>
  </>;
}
