import { useState, type ReactNode } from 'react';
import { GPUS, TASKS, gpuOf, modelOf, searchModels, supportsLora, taskOf, type TaskId } from '../mock/catalog';
import type { RunMeta } from '../mock/runs';
import { formatCount } from '../lib/format';
import {
  PRESETS,
  estimate,
  formatMinutes,
  presetHyper,
  recommendGpu,
  requiredMemoryGb,
  validateHyper,
  type GpuChoice,
  type Hyperparameters,
  type PresetId,
} from '../lib/estimate';
import { autoMap, labelDistribution, splitCounts, validateMapping, type ColumnMapping } from '../lib/mapping';
import { buildRequest, defaultRunName, validateRunName, type DatasetSource, type TrainingRequest } from '../lib/request';
import { DatasetStep, type LoadedDataset } from './DatasetStep';

interface Props {
  onSubmit: (request: TrainingRequest, meta: RunMeta) => string;
  onOpen?: (id: string) => void;
}

const STEPS = ['태스크', '베이스 모델', '데이터셋', '학습 설정', '검토 및 시작'] as const;

function NumField({ label, value, onChange, error, step, min }: { label: string; value: number; onChange: (n: number) => void; error?: string; step?: string; min?: number }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : ''} step={step} min={min} onChange={(e) => onChange(e.target.valueAsNumber)} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function SummaryCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="summary-card">
      <div className="summary-card-head">
        <span className="small muted">{title}</span>
        <button type="button" className="link small" onClick={onEdit} aria-label={`${title} 수정`}>
          수정
        </button>
      </div>
      {children}
    </div>
  );
}

// 노코드 파인튜닝 마법사: 태스크 → 베이스 모델 → 데이터셋 → 학습 설정 → 검토 및 시작. 모든 값은 목업 실행으로만 들어간다.
export function LaunchWizard({ onSubmit, onOpen }: Props) {
  const [step, setStep] = useState(0);
  const [taskId, setTaskId] = useState<TaskId | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<DatasetSource>('sample');
  const [dataset, setDataset] = useState<LoadedDataset | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [trainPercent, setTrainPercent] = useState(90);
  const [preset, setPreset] = useState<PresetId | 'custom'>('balanced');
  const [hyper, setHyper] = useState<Hyperparameters>(presetHyper('balanced', undefined));
  const [gpuAuto, setGpuAuto] = useState(true);
  const [gpuManual, setGpuManual] = useState<GpuChoice>({ gpuId: 'a10g', count: 1 });
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  const task = taskId ? taskOf(taskId) : null;
  const model = modelId ? modelOf(modelId) : undefined;
  const models = taskId ? searchModels(taskId, query) : [];
  const mapCheck = task && dataset ? validateMapping(task, dataset.columns, mapping, dataset.rows) : null;
  const hyperErrors = validateHyper(hyper);
  const recommended = model ? recommendGpu(model, hyper.lora) : null;
  const gpu = gpuAuto && recommended ? recommended : gpuManual;
  const split = dataset ? splitCounts(dataset.totalRows, trainPercent) : { train: 0, validation: 0 };
  const est = model ? estimate({ model, gpu, trainRows: split.train, hyper }) : null;
  const runName = nameEdited ? name : model && dataset ? defaultRunName(model.id, dataset.ref) : '';
  const nameError = validateRunName(runName);
  const needMem = model ? requiredMemoryGb(model, hyper.lora) : 0;
  const gpuTooSmall = model && model.params > 0 && gpuOf(gpu.gpuId).memoryGb * gpu.count < needMem;

  const request =
    task && model && dataset
      ? buildRequest({ name: runName, task: task.id, baseModel: model.id, source, datasetRef: dataset.ref, format: dataset.format, mapping, trainPercent, preset, hyper, gpu, gpuAuto })
      : null;
  const json = request ? JSON.stringify(request, null, 2) : '';

  const stepDone = [
    taskId !== null,
    model !== undefined,
    !!mapCheck && mapCheck.errors.length === 0,
    Object.keys(hyperErrors).length === 0 && !gpuTooSmall,
    nameError === null,
  ];
  const canEnter = (i: number) => stepDone.slice(0, i).every(Boolean);

  function chooseTask(id: TaskId) {
    if (id === taskId) return;
    setTaskId(id);
    setModelId(null);
    setQuery('');
    setDataset(null);
    setMapping({});
  }

  function chooseModel(id: string) {
    setModelId(id);
    const m = modelOf(id);
    setHyper((h) => (preset === 'custom' ? { ...h, lora: h.lora && !!m && supportsLora(m) } : presetHyper(preset, m)));
  }

  function chooseDataset(d: LoadedDataset | null) {
    setDataset(d);
    setMapping(d && task ? autoMap(task, d.columns) : {});
  }

  function choosePreset(id: PresetId) {
    setPreset(id);
    setHyper(presetHyper(id, model));
  }

  function editHyper<K extends keyof Hyperparameters>(key: K, value: Hyperparameters[K]) {
    setPreset('custom');
    setHyper((h) => ({ ...h, [key]: value }));
  }

  function reset() {
    setStep(0);
    setTaskId(null);
    setModelId(null);
    setQuery('');
    setSource('sample');
    setDataset(null);
    setMapping({});
    setTrainPercent(90);
    setPreset('balanced');
    setHyper(presetHyper('balanced', undefined));
    setGpuAuto(true);
    setName('');
    setNameEdited(false);
    setDoneId(null);
  }

  function launch() {
    if (!request || !task || !dataset || !est) return;
    const labels = task.labelRole && mapping[task.labelRole]
      ? labelDistribution(dataset.rows, mapping[task.labelRole], 5).map((l) => l.label).filter((l) => l !== '기타' && l !== '(빈 값)')
      : [];
    const id = onSubmit(request, {
      datasetTitle: dataset.title,
      rows: dataset.totalRows,
      labels,
      estimate: est,
      gpuLabel: `${gpuOf(gpu.gpuId).label} × ${gpu.count}`,
    });
    setDoneId(id);
  }

  async function copyJson() {
    try {
      await navigator.clipboard?.writeText(json);
    } catch {
      // 클립보드 권한이 없으면 무시한다. 내용은 화면에서 직접 복사할 수 있다.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (doneId) {
    return (
      <div className="card wizard-done">
        <div className="done-icon" aria-hidden="true">✓</div>
        <h3>파인튜닝을 시작했습니다</h3>
        <p>
          <strong>{request?.name}</strong> <span className="muted mono small">({doneId})</span> · 아래 실행 목록에서 진행 상황을 볼 수 있습니다.
        </p>
        <div className="done-actions">
          {onOpen && (
            <button type="button" className="btn primary" onClick={() => onOpen(doneId)}>
              실행 상세 보기
            </button>
          )}
          <button type="button" className="btn" onClick={reset}>
            새 작업 만들기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card wizard">
      <ol className="stepper" aria-label="단계">
        {STEPS.map((label, i) => (
          <li key={label} data-state={i === step ? 'current' : i < step && stepDone[i] ? 'done' : 'todo'}>
            <button type="button" onClick={() => setStep(i)} disabled={!canEnter(i)} aria-current={i === step ? 'step' : undefined}>
              <span className="step-num">{i < step && stepDone[i] ? '✓' : i + 1}</span>
              <span className="step-label">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wizard-body">
        {step === 0 && (
          <section aria-labelledby="step-task">
            <h3 id="step-task">무엇을 학습할까요?</h3>
            <p className="muted">태스크를 고르면 맞는 모델과 데이터 형식만 보여 드립니다. 코드나 YAML은 필요 없습니다.</p>
            <div className="option-grid" role="radiogroup" aria-label="태스크">
              {TASKS.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={t.id === taskId} className="option-card task-card" data-selected={t.id === taskId} onClick={() => chooseTask(t.id)}>
                  <span className="task-icon" aria-hidden="true">{t.icon}</span>
                  <span className="option-title">{t.name}</span>
                  <span className="small">{t.description}</span>
                  <span className="small muted">{t.example}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 1 && task && (
          <section aria-labelledby="step-model">
            <h3 id="step-model">베이스 모델</h3>
            <p className="muted">
              <strong>{task.name}</strong>에 쓸 수 있는 모델입니다.
            </p>
            <input className="text-input search" type="search" placeholder="모델 이름·라이선스로 검색" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="모델 검색" />
            {models.length === 0 ? (
              <p className="muted">검색 결과가 없습니다.</p>
            ) : (
              <div className="table-wrap model-table">
                <table>
                  <thead>
                    <tr>
                      <th />
                      <th>모델</th>
                      <th>크기</th>
                      <th>라이선스</th>
                      <th>언어</th>
                      <th>추천 GPU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => {
                      const rec = recommendGpu(m, supportsLora(m));
                      return (
                        <tr key={m.id} className="clickable" data-selected={m.id === modelId} onClick={() => chooseModel(m.id)}>
                          <td>
                            <input type="radio" name="model" checked={m.id === modelId} onChange={() => chooseModel(m.id)} aria-label={m.id} />
                          </td>
                          <td>
                            <div className="mono">{m.id}</div>
                            <div className="small muted">{m.description}</div>
                          </td>
                          <td className="mono small">{m.paramsLabel}</td>
                          <td>
                            <span className="tag">{m.license}</span>
                          </td>
                          <td className="small">{m.language}</td>
                          <td className="small">
                            {`${gpuOf(rec.gpuId).label.replace('NVIDIA ', '')}${rec.count > 1 ? ` × ${rec.count}` : ''}`}
                            {supportsLora(m) && <div className="muted">LoRA 기준</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {step === 2 && task && (
          <DatasetStep
            task={task}
            source={source}
            onSource={setSource}
            dataset={dataset}
            onDataset={chooseDataset}
            mapping={mapping}
            onMapping={setMapping}
            trainPercent={trainPercent}
            onTrainPercent={setTrainPercent}
          />
        )}

        {step === 3 && model && (
          <section aria-labelledby="step-train">
            <h3 id="step-train">학습 설정</h3>
            <div className="option-grid three" role="radiogroup" aria-label="프리셋">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className="option-card" data-selected={preset === p.id} onClick={() => choosePreset(p.id)}>
                  <span className="option-title">{p.label}</span>
                  <span className="small muted">{p.description}</span>
                </button>
              ))}
            </div>
            {preset === 'custom' && <p className="small muted">고급 설정을 직접 바꿔 '사용자 지정' 상태입니다.</p>}

            <details className="advanced">
              <summary>고급</summary>
              <div className="form-grid">
                <NumField label="epoch" value={hyper.epochs} min={1} onChange={(n) => editHyper('epochs', n)} error={hyperErrors.epochs} />
                <NumField label="learning rate" value={hyper.learningRate} step="0.00001" onChange={(n) => editHyper('learningRate', n)} error={hyperErrors.learningRate} />
                <NumField label="batch size" value={hyper.batchSize} min={1} onChange={(n) => editHyper('batchSize', n)} error={hyperErrors.batchSize} />
                <div className="field">
                  <span className="field-label">LoRA</span>
                  <label className="toggle">
                    <input type="checkbox" checked={hyper.lora} disabled={!supportsLora(model)} onChange={(e) => editHyper('lora', e.target.checked)} />
                    <span className="toggle-track" aria-hidden="true" />
                    LoRA 사용
                  </label>
                  {!supportsLora(model) && <span className="muted field-hint">1B 이상 LLM에서만 쓸 수 있습니다</span>}
                </div>
                {hyper.lora && <NumField label="LoRA rank" value={hyper.loraRank} min={1} onChange={(n) => editHyper('loraRank', n)} error={hyperErrors.loraRank} />}
              </div>
            </details>

            <div className="compute-box">
              <div>
                <h4>컴퓨트</h4>
                {recommended && (
                  <p className="small">
                    추천: <strong>{`${gpuOf(recommended.gpuId).label} × ${recommended.count}`}</strong>
                    {needMem > 0 && <span className="muted">{` · 필요한 GPU 메모리 약 ${needMem}GB`}</span>}
                  </p>
                )}
                <label className="toggle">
                  <input type="checkbox" checked={!gpuAuto} onChange={(e) => { setGpuAuto(!e.target.checked); if (recommended) setGpuManual(recommended); }} />
                  <span className="toggle-track" aria-hidden="true" />
                  직접 고르기
                </label>
                {!gpuAuto && (
                  <div className="gpu-manual">
                    <select value={gpuManual.gpuId} onChange={(e) => setGpuManual({ ...gpuManual, gpuId: e.target.value })} aria-label="GPU 종류">
                      {GPUS.map((g) => (
                        <option key={g.id} value={g.id}>
                          {`${g.label} · $${g.pricePerHour}/시간`}
                        </option>
                      ))}
                    </select>
                    <select value={gpuManual.count} onChange={(e) => setGpuManual({ ...gpuManual, count: Number(e.target.value) })} aria-label="GPU 개수">
                      {[1, 2, 4, 8].map((n) => (
                        <option key={n} value={n}>{`× ${n}`}</option>
                      ))}
                    </select>
                  </div>
                )}
                {gpuTooSmall && <p className="field-error">선택한 GPU 메모리가 부족합니다 (약 {needMem}GB 필요)</p>}
              </div>
              {est && (
                <dl className="estimate" aria-label="예상">
                  <div>
                    <dt>예상 시간</dt>
                    <dd>{formatMinutes(est.minutes)}</dd>
                  </div>
                  <div>
                    <dt>예상 비용</dt>
                    <dd>${est.costUsd.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>학습 행</dt>
                    <dd>{formatCount(split.train)}</dd>
                  </div>
                </dl>
              )}
            </div>
            <p className="small muted">예상 시간·비용은 목업 공식(모델 크기 × 행 수 × epoch ÷ GPU 속도)으로 계산합니다.</p>
          </section>
        )}

        {step === 4 && task && model && dataset && est && request && (
          <section aria-labelledby="step-review">
            <h3 id="step-review">검토 및 시작</h3>
            <label className="field name-field">
              <span className="field-label">실행 이름</span>
              <input
                value={runName}
                onChange={(e) => {
                  setNameEdited(true);
                  setName(e.target.value);
                }}
                aria-label="실행 이름"
              />
              {nameError ? <span className="field-error">{nameError}</span> : <span className="muted field-hint">{`등록될 모델: devoops/${runName}:v1`}</span>}
            </label>

            <div className="summary-grid">
              <SummaryCard title="태스크" onEdit={() => setStep(0)}>
                <strong>{task.name}</strong>
                <span className="small muted">{task.description}</span>
              </SummaryCard>
              <SummaryCard title="베이스 모델" onEdit={() => setStep(1)}>
                <strong className="mono">{model.id}</strong>
                <span className="small muted">{`${model.paramsLabel} · ${model.license}`}</span>
              </SummaryCard>
              <SummaryCard title="데이터셋" onEdit={() => setStep(2)}>
                <strong>{dataset.title}</strong>
                <span className="small muted">{`${formatCount(dataset.totalRows)}행 · 학습 ${formatCount(split.train)} / 검증 ${formatCount(split.validation)}`}</span>
                <span className="small">
                  {Object.entries(request.dataset.columns).map(([role, col]) => (
                    <span key={role} className="map-pill">
                      <code>{col}</code> → {role}
                    </span>
                  ))}
                </span>
              </SummaryCard>
              <SummaryCard title="학습 설정" onEdit={() => setStep(3)}>
                <strong>{preset === 'custom' ? '사용자 지정' : PRESETS.find((p) => p.id === preset)!.label}</strong>
                <span className="small muted">
                  {`epoch ${hyper.epochs} · lr ${hyper.learningRate} · batch ${hyper.batchSize} · ${hyper.lora ? `LoRA r=${hyper.loraRank}` : '전체 미세조정'}`}
                </span>
              </SummaryCard>
              <SummaryCard title="컴퓨트 · 예상" onEdit={() => setStep(3)}>
                <strong>{`${gpuOf(gpu.gpuId).label} × ${gpu.count}`}</strong>
                <span className="small muted">{`${gpuAuto ? '자동 추천' : '직접 선택'} · ${formatMinutes(est.minutes)} · $${est.costUsd.toFixed(2)}`}</span>
              </SummaryCard>
            </div>

            <details className="api-view">
              <summary>API 요청으로 보기</summary>
              <div className="code-preview">
                <div className="code-head">
                  <span>POST /v1/fine-tunes</span>
                  <button type="button" className="link small" onClick={copyJson}>
                    {copied ? '복사됨' : '복사'}
                  </button>
                </div>
                <pre aria-label="API 요청 본문">{json}</pre>
              </div>
            </details>
          </section>
        )}
      </div>

      <div className="wizard-actions">
        <button type="button" className="btn ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
          이전
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn primary" onClick={() => setStep(step + 1)} disabled={!stepDone[step]}>
            다음
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={launch} disabled={!canEnter(4) || !stepDone[4]}>
            학습 시작
          </button>
        )}
      </div>
    </div>
  );
}
