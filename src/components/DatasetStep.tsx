import { useState } from 'react';
import type { Task } from '../mock/catalog';
import { HF_SUGGESTIONS, SAMPLE_DATASETS, lookupHfDataset, type MockDataset } from '../mock/datasets';
import { formatCount } from '../lib/format';
import { countEmpty, inferType, labelDistribution, splitCounts, validateMapping, type ColumnMapping } from '../lib/mapping';
import { formatOf, parseDataset, type DatasetFormat } from '../lib/parse';
import type { DatasetSource } from '../lib/request';

export interface LoadedDataset {
  source: DatasetSource;
  ref: string; // 파일 이름 · HF ID · 샘플 ID
  title: string;
  format: DatasetFormat | 'hf';
  columns: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

interface Props {
  task: Task;
  source: DatasetSource;
  onSource: (s: DatasetSource) => void;
  dataset: LoadedDataset | null;
  onDataset: (d: LoadedDataset | null) => void;
  mapping: ColumnMapping;
  onMapping: (m: ColumnMapping) => void;
  trainPercent: number;
  onTrainPercent: (n: number) => void;
}

const SOURCES: { id: DatasetSource; label: string; hint: string }[] = [
  { id: 'upload', label: 'CSV/JSONL 업로드', hint: '브라우저에서 바로 읽어 미리 봅니다' },
  { id: 'huggingface', label: 'Hugging Face 데이터셋', hint: '데이터셋 ID로 불러오기 (목업)' },
  { id: 'sample', label: '샘플 데이터셋', hint: '바로 써 볼 수 있는 내장 데이터' },
];

const PREVIEW_ROWS = 5;
const BAR_COLORS = ['#7c3aed', '#a78bfa', '#12805c', '#e0a100', '#c42b3c', '#9b98ad'];

function fromMock(d: MockDataset, source: DatasetSource): LoadedDataset {
  return { source, ref: d.id, title: d.title, format: source === 'huggingface' ? 'hf' : 'csv', columns: d.columns, rows: d.rows, totalRows: d.totalRows };
}

export function DatasetStep({ task, source, onSource, dataset, onDataset, mapping, onMapping, trainPercent, onTrainPercent }: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hfId, setHfId] = useState('');
  const [hfError, setHfError] = useState<string | null>(null);

  const samples = SAMPLE_DATASETS.filter((d) => d.task === task.id);
  const check = dataset ? validateMapping(task, dataset.columns, mapping, dataset.rows) : null;
  const split = dataset ? splitCounts(dataset.totalRows, trainPercent) : null;
  const labelCol = task.labelRole ? mapping[task.labelRole] : '';
  const dist = dataset && labelCol && dataset.columns.includes(labelCol) ? labelDistribution(dataset.rows, labelCol) : [];
  const distTotal = dist.reduce((n, d) => n + d.count, 0);

  async function onFile(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    try {
      const text = await file.text();
      const table = parseDataset(file.name, text);
      if (table.columns.length === 0 || table.rows.length === 0) throw new Error('데이터 행이 없습니다. 첫 줄은 헤더여야 합니다');
      onDataset({ source: 'upload', ref: file.name, title: file.name, format: formatOf(file.name), columns: table.columns, rows: table.rows, totalRows: table.rows.length });
    } catch (err) {
      onDataset(null);
      setUploadError(err instanceof Error ? err.message : String(err));
    }
  }

  function loadHf(id: string) {
    setHfId(id);
    const d = lookupHfDataset(id);
    if (!d) {
      setHfError(`'${id}' 데이터셋을 찾을 수 없습니다 (목업에서는 아래 예시 ID만 지원)`);
      onDataset(null);
      return;
    }
    setHfError(d.task !== task.id ? `참고: 이 데이터셋은 '${d.title}'용입니다. 컬럼 매핑을 확인하세요.` : null);
    onDataset(fromMock(d, 'huggingface'));
  }

  return (
    <section aria-labelledby="step-data">
      <h3 id="step-data">데이터셋</h3>
      <div className="segmented" role="radiogroup" aria-label="데이터 출처">
        {SOURCES.map((s) => (
          <label key={s.id} className="seg" data-selected={s.id === source}>
            <input
              type="radio"
              name="data-source"
              className="visually-hidden"
              checked={s.id === source}
              onChange={() => {
                onSource(s.id);
                onDataset(null);
                setUploadError(null);
                setHfError(null);
              }}
            />
            <span className="seg-title">{s.label}</span>
            <span className="small muted">{s.hint}</span>
          </label>
        ))}
      </div>

      {source === 'upload' && (
        <div className="dropzone">
          <label className="btn">
            파일 선택
            <input className="visually-hidden" type="file" accept=".csv,.jsonl,.json,.ndjson" aria-label="데이터셋 파일" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <span className="muted small">CSV(첫 줄 헤더) 또는 JSONL(줄마다 객체 하나)</span>
          {uploadError && (
            <span role="alert" className="field-error">
              {uploadError}
            </span>
          )}
        </div>
      )}

      {source === 'huggingface' && (
        <div className="dropzone">
          <form
            className="hf-form"
            onSubmit={(e) => {
              e.preventDefault();
              loadHf(hfId);
            }}
          >
            <input className="text-input" value={hfId} onChange={(e) => setHfId(e.target.value)} placeholder="예: e9t/nsmc" aria-label="Hugging Face 데이터셋 ID" />
            <button type="submit" className="btn" disabled={!hfId.trim()}>
              불러오기
            </button>
          </form>
          <div className="chips">
            {HF_SUGGESTIONS.map((id) => (
              <button key={id} type="button" className="chip-btn" onClick={() => loadHf(id)}>
                {id}
              </button>
            ))}
          </div>
          {hfError && <span className={dataset ? 'small muted' : 'field-error'}>{hfError}</span>}
        </div>
      )}

      {source === 'sample' && (
        <div className="sample-list">
          {samples.map((d) => (
            <button key={d.id} type="button" className="option-card" data-selected={dataset?.ref === d.id} onClick={() => onDataset(fromMock(d, 'sample'))}>
              <span className="option-title">{d.title}</span>
              <span className="small mono muted">{d.id}</span>
              <span className="small muted">{`${formatCount(d.totalRows)}행 · 컬럼 ${d.columns.join(', ')}`}</span>
            </button>
          ))}
        </div>
      )}

      {dataset && (
        <div className="dataset-panel">
          <div className="section-head">
            <h4>
              {dataset.title} <span className="muted small">· 전체 {formatCount(dataset.totalRows)}행 · 컬럼 {dataset.columns.length}개</span>
            </h4>
          </div>
          <ul className="chips" aria-label="감지된 컬럼">
            {dataset.columns.map((c) => {
              const empty = countEmpty(dataset.rows, c);
              return (
                <li key={c}>
                  <span className="chip-name">{c}</span> <span className="muted small">{inferType(dataset.rows, c)}</span>
                  {empty > 0 && <span className="chip-warn small"> 빈 값 {empty}</span>}
                </li>
              );
            })}
          </ul>
          <div className="table-wrap preview">
            <table aria-label="데이터 미리보기">
              <thead>
                <tr>
                  {dataset.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <tr key={i}>
                    {dataset.columns.map((c) => (
                      <td key={c} className="small">
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">{`앞 ${Math.min(PREVIEW_ROWS, dataset.rows.length)}행 미리보기`}</p>

          <div className="mapping-grid">
            <div>
              <h4>컬럼 매핑</h4>
              <p className="small muted">데이터셋 컬럼이 어떤 역할인지 알려 주세요. 이름이 비슷하면 자동으로 채웠습니다.</p>
              <div className="mapping">
                {task.roles.map((role) => (
                  <label key={role.key} className="mapping-row">
                    <span>
                      <span className="field-label">{role.label}</span> <code className="role-key">{role.key}</code>
                      {role.required && <span className="req"> *</span>}
                      <span className="small muted mapping-hint">{role.hint}</span>
                    </span>
                    <select value={mapping[role.key] ?? ''} onChange={(e) => onMapping({ ...mapping, [role.key]: e.target.value })} aria-label={`${role.label} 컬럼`}>
                      <option value="">{role.required ? '컬럼 선택…' : '사용 안 함'}</option>
                      {dataset.columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {task.id === 'tabular' && (
                <p className="small muted">
                  특성 열: {dataset.columns.filter((c) => !Object.values(mapping).includes(c)).join(', ') || '없음'}
                </p>
              )}
              {check && check.errors.length > 0 && (
                <ul className="issues" role="alert">
                  {check.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {check && check.warnings.length > 0 && (
                <ul className="issues warn">
                  {check.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="split-box">
              <h4>학습 / 검증 분할</h4>
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={trainPercent}
                onChange={(e) => onTrainPercent(Number(e.target.value))}
                aria-label="학습 데이터 비율"
              />
              <div className="split-legend small">
                <span>
                  학습 <strong>{trainPercent}%</strong> · {formatCount(split!.train)}행
                </span>
                <span>
                  검증 <strong>{100 - trainPercent}%</strong> · {formatCount(split!.validation)}행
                </span>
              </div>

              {dist.length > 0 && (
                <div className="dist">
                  <h4>라벨 분포</h4>
                  <div className="dist-bar" aria-hidden="true">
                    {dist.map((d, i) => (
                      <span key={d.label} style={{ width: `${(d.count / distTotal) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                    ))}
                  </div>
                  <ul className="dist-legend" aria-label="라벨 분포">
                    {dist.map((d, i) => (
                      <li key={d.label} className="small">
                        <span className="swatch" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
                        {d.label} <span className="muted">{`${d.count}행 · ${Math.round((d.count / distTotal) * 100)}%`}</span>
                      </li>
                    ))}
                  </ul>
                  {dataset.rows.length < dataset.totalRows && <p className="small muted">미리보기 {dataset.rows.length}행 기준</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
