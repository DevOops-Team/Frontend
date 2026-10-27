import { useState, type FormEvent } from 'react';
import type { JobInput } from '../api';

interface Props {
  onSubmit: (input: JobInput) => Promise<{ id: string }>;
}

export function UploadForm({ onSubmit }: Props) {
  const [job, setJob] = useState<File | null>(null);
  const [train, setTrain] = useState<File | null>(null);
  const [data, setData] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = job !== null && train !== null && data.length > 0 && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!job || !train) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await onSubmit({ job, train, data });
      setResult(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        job.yaml
        <input type="file" accept=".yaml,.yml" onChange={(e) => setJob(e.target.files?.[0] ?? null)} />
      </label>
      <label>
        train.py
        <input type="file" accept=".py" onChange={(e) => setTrain(e.target.files?.[0] ?? null)} />
      </label>
      <label>
        학습 데이터
        <input type="file" multiple onChange={(e) => setData(Array.from(e.target.files ?? []))} />
      </label>
      <button type="submit" disabled={!ready}>
        제출
      </button>
      {result && <p>제출됨: {result}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
