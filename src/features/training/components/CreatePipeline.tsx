import { useEffect, useRef, useState } from 'react';
import { buildJobRequest, createJob, datasetFile, errorMessage, getDataset, listDatasets, listModels, modelFile } from '../api';
import type { Dataset, Model } from '../types';
import { formatBytes } from '../lib/format';
import { parseHyperparameters, rangeText } from '../lib/hyperparameters';
import { FileList } from './FileList';

const NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const SEED_HINT = 'S3에 준비된 파일이 없습니다. Backend의 examples/fsdp/seed_assets.py로 먼저 올려 주세요.';
const STRATEGY_TEXT: Record<string, { tag: string; title: string; body: string; choice: string }> = {
  fsdp: { tag: '메모리 절약', title: '모델을 여러 GPU에 나눠 담을 때', body: '모델을 나눠 GPU 메모리를 절약합니다.', choice: '큰 모델을 여러 GPU에 나눠 담습니다.' },
  ddp: { tag: '적은 GPU', title: '모델이 GPU 한 장에 들어갈 때', body: '같은 모델로 데이터를 나눠 학습합니다.', choice: '모델을 GPU마다 복사하고 데이터를 나눠 학습합니다.' },
};

// 아무것도 입력하지 않고 끝까지 넘어가면 기본 모델 · 기본 데이터 · 기본 config로 제출한다.
export function CreatePipeline({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [models, setModels] = useState<Model[] | null>(null);
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [detail, setDetail] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [modelName, setModelName] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [strategy, setStrategy] = useState('');
  const [gpus, setGpus] = useState(0);
  const [hyper, setHyper] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [issue, setIssue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [gpuOpen, setGpuOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const gpuButton = useRef<HTMLButtonElement>(null);

  const model = models?.find((m) => m.name === modelName);
  const usable = (datasets ?? []).filter((d) => !model || model.datasetFormats.includes(d.format));
  const version = detail?.versions?.find((v) => v.version === detail.latestVersion);

  function chooseModel(m: Model) {
    setModelName(m.name);
    setStrategy(m.defaultStrategy);
    setGpus(m.gpus.default);
    setHyper({}); // 모델마다 여는 값이 다르다
  }

  useEffect(() => {
    let live = true;
    void Promise.all([listModels(), listDatasets()]).then(([ms, ds]) => {
      if (!live) return;
      setModels(ms);
      setDatasets(ds);
      const first = ms[0];
      if (first) {
        chooseModel(first);
        setDatasetId(ds.find((d) => first.datasetFormats.includes(d.format))?.id ?? '');
      }
    }).catch((e: unknown) => { if (live) setLoadError(errorMessage(e)); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!datasetId) return undefined;
    let live = true;
    getDataset(datasetId).then((d) => { if (live) setDetail(d); }).catch((e: unknown) => { if (live) setLoadError(errorMessage(e)); });
    return () => { live = false; };
  }, [datasetId]);

  useEffect(() => { if (gpuOpen) dialog.current?.querySelector<HTMLSelectElement>('select')?.focus(); }, [gpuOpen]);
  const closeGpu = () => { setGpuOpen(false); gpuButton.current?.focus(); };

  const nameError = name.trim() && !NAME.test(name.trim()) ? '학습 이름은 1~63자의 소문자 · 숫자 · 하이픈만 쓸 수 있습니다.' : '';
  const strategyText = STRATEGY_TEXT[strategy] ?? { tag: '', title: strategy, body: '', choice: '' };
  const minGpus = model?.strategyMinGpus[strategy] ?? 1;
  // 고를 수 없는 값도 이유와 함께 보여 준다. 할당량이 늘면 백엔드 설정의 max만 올리면 된다.
  const gpuOptions = (model?.gpus.options ?? []).map((n) => {
    const reason = n < minGpus ? `${strategy.toUpperCase()}는 ${minGpus}개 이상` : model && n > model.gpus.max ? '현재 할당량 초과' : '';
    return { n, reason };
  });

  function chooseStrategy(next: string) {
    setStrategy(next);
    const needed = model?.strategyMinGpus[next] ?? 1;
    if (model && gpus < needed) setGpus(model.gpus.options.find((n) => n >= needed && n <= model.gpus.max) ?? model.gpus.default);
  }

  const parsed = parseHyperparameters(model?.hyperparameters ?? [], hyper);

  async function submit() {
    if (!model || !version) return;
    setSubmitting(true);
    setIssue('');
    try {
      const created = await createJob(buildJobRequest({ name, model: model.name, strategy, gpus, datasetId, datasetVersion: version.version }, parsed.values));
      onCreated(created.id);
    } catch (e) {
      setIssue(errorMessage(e));
      setSubmitting(false);
    }
  }

  function next() {
    if (step === 0) {
      if (!model) { setIssue(models ? SEED_HINT : '모델 정보를 불러오는 중입니다.'); return; }
      if (nameError) { setIssue(nameError); return; }
    }
    if (step === 1 && !version) { setIssue(''); return; }
    if (step === 2 && parsed.errors.length > 0) { setAdvancedOpen(true); setIssue(parsed.errors.join(' ')); return; }
    if (step === 3) { void submit(); return; }
    setIssue('');
    setStep(step + 1);
  }

  const dataMissing = datasets !== null && usable.length === 0;

  return <>
    <header className="hero create-heading"><h1>새 학습 만들기</h1><p className="muted">입력하지 않고 넘어가면 준비된 기본 모델과 데이터로 학습합니다.</p></header>
    {gpuOpen && <div className="guided-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeGpu(); }}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="gpu-dialog-title" className="card guided-modal" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeGpu(); } if (e.key === 'Tab') { const items = dialog.current?.querySelectorAll<HTMLElement>('select,button'); const first = items?.[0]; const last = items?.[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}>
      <header className="guided-modal-head"><div><span className="eyebrow">TRAINING SETUP</span><h2 id="gpu-dialog-title">학습에 사용할 GPU</h2></div><button className="btn ghost" onClick={closeGpu} aria-label="GPU 설정 닫기">×</button></header>
      <p className="muted">총 GPU 수만큼 노드를 준비합니다. 노드 한 대에 GPU 한 개를 씁니다.</p>
      <div className="form-grid"><label className="field"><span>총 GPU 개수</span><select aria-label="총 GPU 개수" value={gpus} onChange={(e) => setGpus(Number(e.target.value))}>{gpuOptions.map(({ n, reason }) => <option key={n} value={n} disabled={Boolean(reason)}>{n}개{reason ? ` (${reason})` : ''}</option>)}</select></label></div>
      <p className="help-note">{strategyText.choice}</p>
      <footer className="guided-modal-actions"><button className="btn primary" onClick={closeGpu}>이 설정 사용하기</button></footer>
    </div></div>}
    <div className="guided-layout">
      <section className="card wizard">
        <ol className="stepper guided-stepper">{['모델', '데이터', '방식·GPU', '최종 확인'].map((label, i) => <li key={label} data-state={i === step ? 'current' : i < step ? 'done' : ''}><button type="button" disabled={i > step} onClick={() => { setIssue(''); setStep(i); }}><span className="step-num">{i < step ? '✓' : i + 1}</span>{label}</button></li>)}</ol>
        <div className="wizard-body">
          {step === 0 && <section><h2>어떤 모델을 학습할까요?</h2><p className="muted">입력하지 않으면 샘플 모델로 학습합니다. 이름은 비워 두면 자동으로 정해집니다.</p>
            <div className="form-grid"><label className="field"><span>학습 이름 · 선택</span><input aria-label="학습 이름" placeholder="예: gpt2-demo" value={name} onChange={(e) => setName(e.target.value)} /><span className="muted small">소문자 · 숫자 · 하이픈</span></label>
              {models && models.length > 0 && <label className="field"><span>학습 모델</span><select aria-label="학습 모델" value={modelName} onChange={(e) => { const m = models.find((x) => x.name === e.target.value); if (m) chooseModel(m); }}>{models.map((m) => <option key={m.name} value={m.name}>{m.displayName}</option>)}</select></label>}
            </div>
            {!models && !loadError && <p className="muted">모델 정보를 불러오는 중입니다.</p>}
            {model && <div className="asset-box"><div className="asset-head"><code className="asset-uri">{model.uri}</code></div>
              {model.files.length === 0 ? <p role="alert" className="issues">{SEED_HINT}</p> : <FileList label="모델 파일" files={model.files} load={(file) => modelFile(model.name, file)} />}</div>}
          </section>}
          {step === 1 && <section><h2>어떤 데이터로 학습할까요?</h2><p className="muted">입력하지 않으면 샘플 데이터로 학습합니다. 모든 Pod가 같은 데이터를 읽고 rank별로 나눠 학습합니다.</p>
            {usable.length > 0 && <div className="form-grid"><label className="field"><span>학습 데이터</span><select aria-label="학습 데이터" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>{usable.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>}
            {dataMissing && <p role="alert" className="issues">{SEED_HINT}</p>}
            {detail && version && <div className="asset-box"><div className="asset-head"><strong>{detail.name} · v{version.version}</strong><span className="muted small">{detail.format} · 파일 {version.fileCount}개 · {formatBytes(version.totalBytes)}</span><code className="asset-uri">{version.uri}</code></div>
              <FileList label="학습 데이터 파일" preview="modal" files={version.files} load={(file) => datasetFile(detail.id, version.version, file)} /></div>}
          </section>}
          {step === 2 && <section className="strategy-step"><h2>학습 방식과 GPU를 선택하세요</h2><p className="muted">GPU 메모리가 부족한 큰 모델에는 FSDP가 적합합니다. 선택하지 않으면 FSDP · GPU {model?.gpus.default}개로 학습합니다.</p>
            <div className="strategy-grid" role="radiogroup" aria-label="학습 방식">{(model?.strategies ?? []).map((s) => { const t = STRATEGY_TEXT[s] ?? strategyText; return <label className="strategy-card" key={s} data-selected={strategy === s}><input type="radio" name="strategy" checked={strategy === s} onChange={() => chooseStrategy(s)} /><span className="strategy-title">{s.toUpperCase()} <span className="strategy-tag">{t.tag}</span></span><strong>{t.title}</strong><span className="muted">{t.body}</span></label>; })}</div>
            <div className="gpu-config-row"><div><strong>GPU {gpus}개 · 노드 {gpus}대</strong><p>노드당 GPU 1개</p></div><button ref={gpuButton} type="button" className="btn" onClick={() => setGpuOpen(true)}>GPU 설정</button></div>
            <div className="advanced-settings">
              <button type="button" className="advanced-toggle" aria-expanded={advancedOpen} aria-controls="advanced-settings-body" onClick={() => setAdvancedOpen(!advancedOpen)}><span aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>상세 설정</button>
              {advancedOpen && <div id="advanced-settings-body" className="advanced-body"><p className="muted small">비워 두면 기본값으로 학습합니다.</p>
                <div className="form-grid">{model?.hyperparameters.map((h) => <label className="field" key={h.key}><span>{h.key}</span><input aria-label={h.key} type="text" inputMode="decimal" autoComplete="off" placeholder={String(h.default)} value={hyper[h.key] ?? ''} onChange={(e) => { setHyper({ ...hyper, [h.key]: e.target.value }); setIssue(''); }} /><span className="muted small">{rangeText(h)}</span></label>)}</div></div>}
            </div>
          </section>}
          {step === 3 && <section className="review-step"><h2>이 설정으로 학습을 시작할까요?</h2><p className="muted">{strategyText.choice}</p>
            <dl className="review-grid"><div><dt>학습 이름</dt><dd>{name.trim() || '자동 지정'}</dd></div><div><dt>학습 방식</dt><dd>{strategy.toUpperCase()}</dd></div><div><dt>사용 GPU</dt><dd>{gpus}대 × GPU 1개</dd></div><div><dt>학습 모델</dt><dd>{model?.displayName}</dd></div><div><dt>학습 데이터</dt><dd>{detail?.name} · v{version?.version}</dd></div>
              {model?.hyperparameters.map((h) => <div key={h.key}><dt>{h.key}</dt><dd>{parsed.values[h.key] ?? h.default}</dd></div>)}</dl>
            <p className="help-note review-note">시작하면 실제 GPU 노드에서 학습이 실행됩니다. 나머지 설정은 백엔드 기본값으로 채워집니다.</p></section>}
          {loadError && <p role="alert" className="issues">{loadError}</p>}
          {issue && <p role="alert" className="issues">{issue}</p>}
        </div>
        <footer className="wizard-actions"><button type="button" className="btn ghost" onClick={() => { if (step === 0) onCancel(); else { setIssue(''); setStep(step - 1); } }}>{step === 0 ? '취소' : '이전'}</button><button type="button" className="btn primary" disabled={submitting} onClick={next}>{['다음: 데이터 입력', '다음: 학습 방식', '다음: 최종 확인', submitting ? '제출 중…' : '학습 시작'][step]}</button></footer>
      </section>
      <aside className="card guided-summary"><span className="eyebrow">실행 전 요약</span><h2>{strategy.toUpperCase()} 학습</h2><p className="muted">{strategyText.choice}</p><dl className="review-grid"><div><dt>전체 GPU</dt><dd>{gpus}개</dd></div></dl></aside>
    </div>
  </>;
}
