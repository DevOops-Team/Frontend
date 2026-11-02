import { useMemo, useState, type ReactNode } from 'react';
import type { JobInput } from '../api';
// Backend 저장소 examples/의 복사본.
import trainPy from '../examples/train.py?raw';
import trainHead from '../examples/train-head.csv?raw';
import {
  DEFAULT_OPTIONS,
  HARDWARE,
  MAX_NODES,
  MIN_NODES,
  buildJobYaml,
  hardwareOf,
  totalGpus,
  validateOptions,
  type JobOptions,
} from '../jobTemplate';

interface Props {
  onSubmit: (input: JobInput) => Promise<{ id: string }>;
}

const STEPS = ['코드', '데이터', '컴퓨트', '검토 및 실행'] as const;

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function FileChips({ files }: { files: File[] }) {
  if (files.length === 0) return <p className="muted">아직 선택한 파일이 없습니다</p>;
  return (
    <ul className="chips" aria-label="선택한 파일">
      {files.map((f) => (
        <li key={f.name}>
          <span className="chip-name">{f.name}</span> <span className="muted">{formatSize(f.size)}</span>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="muted field-hint">{hint}</span>}
    </label>
  );
}

// "새 학습 작업" 마법사: 코드 → 데이터 → 컴퓨트 → 검토 및 실행.
// job.yaml은 컴퓨트 단계의 값으로 만들고(buildJobYaml), 실행할 때 File('job.yaml')로 바꿔 올린다.
export function LaunchWizard({ onSubmit }: Props) {
  const [step, setStep] = useState(0);
  const [train, setTrain] = useState<File | null>(null);
  const [data, setData] = useState<File[]>([]);
  const [options, setOptions] = useState<JobOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const errors = useMemo(() => validateOptions(options), [options]);
  const yaml = useMemo(() => buildJobYaml(options), [options]);
  const hw = hardwareOf(options);

  const stepDone = [train !== null, data.length > 0, Object.keys(errors).length === 0];
  const canEnter = (i: number) => stepDone.slice(0, i).every(Boolean);

  function set<K extends keyof JobOptions>(key: K, value: JobOptions[K]) {
    setOptions((o) => ({ ...o, [key]: value }));
  }

  function reset() {
    setStep(0);
    setTrain(null);
    setData([]);
    setOptions(DEFAULT_OPTIONS);
    setResult(null);
    setError(null);
  }

  async function launch() {
    if (!train) return;
    setBusy(true);
    setError(null);
    try {
      const job = new File([yaml], 'job.yaml', { type: 'application/yaml' });
      const res = await onSubmit({ job, train, data });
      setResult(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="card wizard-done">
        <div className="done-icon" aria-hidden="true">✓</div>
        <h3>작업을 실행했습니다</h3>
        <p>
          작업 ID <code>{result}</code> · 아래 실행 목록에서 진행 상황을 볼 수 있습니다.
        </p>
        <button type="button" className="btn" onClick={reset}>
          새 작업 만들기
        </button>
      </div>
    );
  }

  return (
    <div className="card wizard">
      <ol className="stepper" aria-label="단계">
        {STEPS.map((label, i) => (
          <li key={label} data-state={i === step ? 'current' : i < step && stepDone[i] ? 'done' : 'todo'}>
            <button
              type="button"
              onClick={() => setStep(i)}
              disabled={!canEnter(i)}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="step-num">{i < step && stepDone[i] ? '✓' : i + 1}</span>
              <span className="step-label">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wizard-body">
        {step === 0 && (
          <section aria-labelledby="step-code">
            <h3 id="step-code">학습 코드</h3>
            <p className="muted">
              torchrun으로 실행할 <code>train.py</code>를 올리세요. 진행 상태 파일·체크포인트 규약은 예시 코드를 참고하세요.
            </p>
            <div className="dropzone">
              <label className="btn">
                train.py 선택
                <input
                  className="visually-hidden"
                  type="file"
                  accept=".py"
                  aria-label="train.py 파일"
                  onChange={(e) => setTrain(e.target.files?.[0] ?? null)}
                />
              </label>
              <span className="muted">또는</span>
              <button type="button" className="btn ghost" onClick={() => setTrain(new File([trainPy], 'train.py'))}>
                예시 train.py 사용
              </button>
            </div>
            <FileChips files={train ? [train] : []} />
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby="step-data">
            <h3 id="step-data">학습 데이터</h3>
            <p className="muted">여러 파일을 올릴 수 있습니다. Pod 안의 데이터 디렉터리에 그대로 들어갑니다.</p>
            <div className="dropzone">
              <label className="btn">
                데이터 파일 선택
                <input
                  className="visually-hidden"
                  type="file"
                  multiple
                  aria-label="학습 데이터 파일"
                  onChange={(e) => setData(Array.from(e.target.files ?? []))}
                />
              </label>
              <span className="muted">또는</span>
              <button type="button" className="btn ghost" onClick={() => setData([new File([trainHead], 'train.csv')])}>
                예시 데이터 사용 (train.csv 앞 20행)
              </button>
            </div>
            <FileChips files={data} />
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="step-compute">
            <h3 id="step-compute">컴퓨트</h3>
            <fieldset className="hw-grid">
              <legend>하드웨어</legend>
              {HARDWARE.map((h) => (
                <label key={h.id} className="hw-card" data-selected={h.id === options.hardwareId}>
                  <input
                    type="radio"
                    name="hardware"
                    value={h.id}
                    checked={h.id === options.hardwareId}
                    onChange={() => set('hardwareId', h.id)}
                    className="visually-hidden"
                  />
                  <span className="hw-title">{`${h.gpu} × ${h.gpus}`}</span>
                  <span className="hw-instance">{h.instanceType}</span>
                  <span className="muted hw-spec">{`${h.vcpu} vCPU · ${h.memoryGiB} GiB`}</span>
                  <span className="muted hw-note">{h.note}</span>
                </label>
              ))}
            </fieldset>

            <div className="compute-row">
              <div className="field">
                <span className="field-label" id="nodes-label">노드 수</span>
                <div className="number-stepper" role="group" aria-labelledby="nodes-label">
                  <button
                    type="button"
                    aria-label="노드 줄이기"
                    disabled={options.nodes <= MIN_NODES}
                    onClick={() => set('nodes', options.nodes - 1)}
                  >
                    −
                  </button>
                  <output aria-live="polite" aria-label="선택한 노드 수">
                    {options.nodes}
                  </output>
                  <button
                    type="button"
                    aria-label="노드 늘리기"
                    disabled={options.nodes >= MAX_NODES}
                    onClick={() => set('nodes', options.nodes + 1)}
                  >
                    +
                  </button>
                </div>
                <span className="muted field-hint">노드마다 Pod 1개 · 최대 {MAX_NODES}대</span>
              </div>

              <div className="field">
                <span className="field-label">용량 유형</span>
                <label className="toggle">
                  <input type="checkbox" checked={options.spot} onChange={(e) => set('spot', e.target.checked)} />
                  <span className="toggle-track" aria-hidden="true" />
                  Spot 인스턴스 선호
                </label>
                <span className="muted field-hint">job.yaml에 참고용 주석으로만 남습니다</span>
              </div>
            </div>

            <div className="form-grid">
              <Field label="작업 이름" error={errors.name} hint="소문자·숫자·하이픈">
                <input value={options.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="컨테이너 이미지" error={errors.image}>
                <input value={options.image} onChange={(e) => set('image', e.target.value)} />
              </Field>
              <Field label="총 step" error={errors.totalSteps}>
                <input
                  type="number"
                  min={1}
                  value={options.totalSteps}
                  onChange={(e) => set('totalSteps', e.target.valueAsNumber)}
                />
              </Field>
              <Field label="체크포인트 간격 (step)" error={errors.ckptEvery}>
                <input
                  type="number"
                  min={1}
                  value={options.ckptEvery}
                  onChange={(e) => set('ckptEvery', e.target.valueAsNumber)}
                />
              </Field>
              <Field label="최대 재시작 횟수" error={errors.maxRestarts} hint="Pod가 실패하면 체크포인트에서 재개">
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={options.maxRestarts}
                  onChange={(e) => set('maxRestarts', e.target.valueAsNumber)}
                />
              </Field>
            </div>
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="step-review" className="review">
            <div>
              <h3 id="step-review">검토</h3>
              <dl className="summary">
                <div>
                  <dt>총 GPU</dt>
                  <dd className="summary-big">{totalGpus(options)}개</dd>
                </div>
                <div>
                  <dt>하드웨어</dt>
                  <dd>{`${hw.gpu} × ${hw.gpus} / ${hw.instanceType} × ${options.nodes}대`}</dd>
                </div>
                <div>
                  <dt>용량 유형</dt>
                  <dd>{options.spot ? 'Spot 선호' : 'On-Demand'}</dd>
                </div>
                <div>
                  <dt>학습</dt>
                  <dd>{`${options.totalSteps} step · ${options.ckptEvery} step마다 체크포인트 · 재시작 최대 ${options.maxRestarts}회`}</dd>
                </div>
                <div>
                  <dt>파일</dt>
                  <dd>{[train?.name, ...data.map((f) => f.name)].filter(Boolean).join(', ')}</dd>
                </div>
              </dl>
            </div>
            <div className="code-preview">
              <div className="code-head">
                <span>job.yaml</span>
                <span className="muted">자동 생성 · 읽기 전용</span>
              </div>
              <pre aria-label="생성된 job.yaml">{yaml}</pre>
            </div>
          </section>
        )}
      </div>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      <div className="wizard-actions">
        <button type="button" className="btn ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || busy}>
          이전
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn primary" onClick={() => setStep(step + 1)} disabled={!stepDone[step]}>
            다음
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={launch} disabled={busy || !canEnter(3)}>
            {busy ? '실행 중…' : '실행'}
          </button>
        )}
      </div>
    </div>
  );
}
