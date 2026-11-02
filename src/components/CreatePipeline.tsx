import { useEffect, useRef, useState } from 'react';
import { ACCELERATORS } from '../mock/catalog';
import type { Store } from '../mock/store';
import { DEFAULT_FORM, DEFAULT_POOL, buildPipelineRequest, isValid, validateForm, type PipelineForm, type PipelineRequest } from '../lib/pipeline';
import { totalGpus, totalHourly } from '../lib/pricing';
import { formatUsd } from '../lib/format';

export function CreatePipeline({ store, onSubmit, onCancel }: { store: Store; onSubmit: (r: PipelineRequest) => void; onCancel: () => void }) {
  const [f, setF] = useState<PipelineForm>({ ...DEFAULT_FORM, pools: [{ ...DEFAULT_POOL }, { ...DEFAULT_POOL }] });
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(false);
  const [gpuOpen, setGpuOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const gpuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (gpuOpen) dialog.current?.querySelector<HTMLSelectElement>('select')?.focus(); }, [gpuOpen]);
  const closeGpu = () => { setGpuOpen(false); gpuButton.current?.focus(); };
  const errors = validateForm(f, { modelIds: store.models.map((m) => m.id) });
  const issues = step === 0 ? [...errors.model, ...errors.method.filter((e) => e.includes('학습 모델'))] : step === 1 ? errors.method.filter((e) => e.includes('학습 데이터')) : Object.values(errors).flat();
  const request = buildPipelineRequest(f);
  const nodes = f.pools.reduce((n, p) => n + p.replicaCount, 0);
  const set = <K extends keyof PipelineForm>(k: K, value: PipelineForm[K]) => setF((old) => ({ ...old, [k]: value }));
  function nodeCount(n: number) {
    const pool = { ...f.pools[0], acceleratorCount: 1, replicaCount: 1 };
    set('pools', n > 1 ? [pool, { ...pool, replicaCount: n - 1 }] : [pool]);
  }
  const choice = f.strategy === 'ddp' ? '모델을 GPU마다 복사하고 데이터를 나눠 학습합니다.' : '큰 모델을 여러 GPU에 나눠 담습니다.';
  return <>
    <header className="hero"><h1>새 학습 만들기</h1><p className="muted">학습 방식과 GPU를 고르면 준비 끝. 실행 전에 설정을 한 번 더 확인하세요.</p></header>
    {gpuOpen && <div className="guided-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeGpu(); }}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="gpu-dialog-title" className="card guided-modal" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeGpu(); } if (e.key === 'Tab') { const items = dialog.current?.querySelectorAll<HTMLElement>('select,button'); const first = items?.[0]; const last = items?.[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}>
      <header className="guided-modal-head"><div><span className="eyebrow">TRAINING SETUP</span><h2 id="gpu-dialog-title">학습에 사용할 GPU</h2></div><button className="btn ghost" onClick={closeGpu} aria-label="GPU 설정 닫기">×</button></header>
      <p className="muted">학습 방식과 GPU 수를 선택하세요. 총 GPU 수만큼 노드를 준비합니다.</p>
      <div className="form-grid"><label className="field"><span>학습 방식</span><select aria-label="모달 학습 방식" value={f.strategy} onChange={(e) => set('strategy', e.target.value as PipelineForm['strategy'])}><option value="ddp">DDP · 기본 추천</option><option value="fsdp">FSDP · 메모리 절약</option></select></label>
      <label className="field"><span>총 GPU 개수</span><select aria-label="총 GPU 개수" value={nodes} onChange={(e) => nodeCount(Number(e.target.value))}>{[1,2,4,8].map((n) => <option key={n} value={n}>{n}개</option>)}</select></label>
      <label className="field"><span>GPU 종류</span><select aria-label="GPU 종류" value={f.pools[0].acceleratorType} onChange={(e) => set('pools', f.pools.map((p) => ({ ...p, acceleratorType: e.target.value })))}>{ACCELERATORS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label></div>
      <p className="help-note">{choice}</p><div className="guided-modal-review"><strong>{f.strategy.toUpperCase()} · GPU {nodes}개</strong><span>{nodes}대 노드 × GPU 1개</span><strong>{formatUsd(totalHourly(f.pools, false))} / 시간</strong></div>
      {errors.compute.length > 0 && <p role="alert">{errors.compute.join(' ')}</p>}
      <p className="muted small">선택한 구성으로 목업을 실행합니다. 실제 자원은 생성되지 않습니다.</p><footer className="guided-modal-actions"><button className="btn ghost" onClick={closeGpu}>닫기</button><button className="btn primary" disabled={errors.compute.length > 0} onClick={closeGpu}>이 설정 사용하기</button></footer>
    </div></div>}
    <div className="guided-layout">
      <section className="card wizard">
        <ol className="stepper guided-stepper">{['모델', '데이터', '방식·GPU', '최종 확인'].map((label, i) => <li key={label} data-state={i === step ? 'current' : i < step ? 'done' : ''}><button type="button" disabled={i > step} onClick={() => setStep(i)}><span className="step-num">{i < step ? '✓' : i + 1}</span>{label}</button></li>)}</ol>
        <div className="wizard-body">
          {step === 2 && <section><h2>모델 크기에 맞는 방식을 선택하세요</h2><p className="muted">처음이라면 DDP로 시작하세요. GPU 메모리가 부족한 큰 모델에는 FSDP가 적합합니다.</p>
            <div className="strategy-grid" role="radiogroup" aria-label="학습 방식">{(['ddp', 'fsdp'] as const).map((strategy) => <label className="strategy-card" key={strategy} data-selected={f.strategy === strategy}><input type="radio" name="strategy" checked={f.strategy === strategy} onChange={() => { set('strategy', strategy); }} /><span className="strategy-title">{strategy.toUpperCase()} <span className="strategy-tag">{strategy === 'ddp' ? '기본 추천' : '메모리 절약'}</span></span><strong>{strategy === 'ddp' ? '모델이 GPU 한 장에 들어갈 때' : '큰 모델을 여러 GPU에 나눠 담을 때'}</strong><span className="muted">{strategy === 'ddp' ? '각 GPU가 모델 전체를 갖고 서로 다른 데이터를 함께 학습합니다.' : '모델과 학습 상태를 나누어 GPU당 메모리 사용을 줄입니다.'}</span><span className="strategy-diagram" aria-hidden="true">{strategy === 'ddp' ? '▣ 모델  →  ▣ 모델' : '▧ 모델  +  ▨ 모델'}</span></label>)}</div>
            <div className="help-note"><strong>GPU {nodes}개 · 노드 {nodes}대</strong><p>노드 한 대에 GPU 한 개를 배정합니다.</p><button ref={gpuButton} type="button" className="btn" onClick={() => setGpuOpen(true)}>GPU 설정</button></div>
            <p className="help-note">준비된 학습 파일에 모델·데이터와 선택한 방식을 전달합니다. 코드를 작성하거나 파일을 고를 필요가 없습니다.</p>
          </section>}
          {step === 0 && <section><h2>어떤 모델을 학습할까요?</h2><p className="muted">직접 준비한 모델의 이름이나 위치를 입력하세요. 특정 모델 목록에 제한되지 않습니다.</p><div className="form-grid"><label className="field"><span>학습 이름</span><input aria-label="학습 이름" placeholder="예: my-training" value={f.modelName} onChange={(e) => set('modelName', e.target.value)} /><span className="muted small">실행을 구분할 영문·숫자·하이픈·밑줄 이름</span></label><label className="field"><span>학습 모델 · 필수</span><input aria-label="학습 모델" value={f.modelInput} placeholder="모델 이름, Hugging Face ID 또는 저장 경로" onChange={(e) => set('modelInput', e.target.value)} /></label></div><p className="help-note">준비된 train.py에 모델을 전달합니다. 새로운 코드를 작성할 필요가 없습니다.</p></section>}
          {step === 1 && <section><h2>어떤 데이터로 학습할까요?</h2><p className="muted">모델에 사용할 데이터 경로나 파일을 알려주세요. 목업에서는 형식이나 내용을 검사하지 않습니다.</p><div className="form-grid"><label className="field"><span>데이터 입력 방법</span><select aria-label="데이터 입력 방법" value={f.datasetSource} onChange={(e) => setF((old) => ({ ...old, datasetSource: e.target.value as PipelineForm['datasetSource'], datasetInput: '' }))}><option value="uri">경로 또는 URI 입력</option><option value="upload">파일 업로드</option></select></label>{f.datasetSource === 'uri' ? <label className="field"><span>학습 데이터 · 필수</span><input aria-label="학습 데이터" placeholder="데이터 경로, URI 또는 데이터셋 ID" value={f.datasetInput} onChange={(e) => set('datasetInput', e.target.value)} /></label> : <label className="field"><span>학습 데이터 파일 · 필수</span><input type="file" aria-label="학습 데이터 파일" onChange={(e) => set('datasetInput', e.target.files?.[0]?.name ?? '')} /><span>{f.datasetInput}</span></label>}</div><p className="help-note">어떤 형식도 선택할 수 있습니다. 실제 파일 전송 없이 이름만 실행 입력에 연결합니다.</p></section>}
          {step === 3 && <section><h2>이 설정으로 학습을 시작할까요?</h2><p className="muted">{choice}</p><dl className="review-grid"><div><dt>학습 이름</dt><dd>{f.modelName}</dd></div><div><dt>학습 방식</dt><dd>{f.strategy.toUpperCase()}</dd></div><div><dt>사용 GPU</dt><dd>{nodes}대 × GPU 1개</dd></div><div><dt>데이터</dt><dd>{f.datasetInput}</dd></div><div><dt>학습 모델</dt><dd>{f.modelInput}</dd></div><div><dt>실행 파일</dt><dd>train.py</dd></div><div><dt>프레임워크</dt><dd>PyTorch {f.frameworkVersion}</dd></div><div><dt>시간당 예상 비용</dt><dd>{formatUsd(totalHourly(f.pools, false))}</dd></div></dl><p className="help-note">시작하면 대기 → GPU 준비 → 학습 → 결과 저장 순으로 진행됩니다. 이 화면의 실행과 비용은 목업입니다.</p><details><summary>요청 상세 보기</summary><pre className="guided-json">{JSON.stringify(request.body, null, 2)}</pre></details></section>}
          {shown && !gpuOpen && issues.length > 0 && <ul role="alert" className="issues">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
        </div>
        <footer className="wizard-actions"><button type="button" className="btn ghost" onClick={() => step === 0 ? onCancel() : setStep(step - 1)}>{step === 0 ? '취소' : '이전'}</button><button type="button" className="btn primary" onClick={() => { if (step === 0 && (!f.modelInput.trim() || errors.model.length > 0)) { setShown(true); return; } if (step === 1 && !f.datasetInput.trim()) { setShown(true); return; } if (step === 2 && !isValid(errors)) { setShown(true); return; } if (step === 3) { if (isValid(errors)) onSubmit(request); return; } setShown(false); setStep(step + 1); }}>{['다음: 데이터 입력', '다음: 학습 방식', '다음: 최종 확인', '학습 시작'][step]}</button></footer>
      </section>
      <aside className="card guided-summary"><span className="eyebrow">실행 전 요약</span><h2>{f.strategy.toUpperCase()} 학습</h2><p className="muted">{choice}</p><dl className="review-grid"><div><dt>전체 GPU</dt><dd>{totalGpus(f.pools)}개</dd></div><div><dt>시간당 예상 비용</dt><dd className="price-big">{formatUsd(totalHourly(f.pools, false))}</dd></div></dl><span className="small muted">목업 요금이며 실제 청구되지 않습니다.</span></aside>
    </div>
  </>;
}
