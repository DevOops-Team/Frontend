import { useEffect, useRef } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import type { UploadState } from '../lib/uploadQueue';
import { useUploads } from '../uploads';

// S3 업로드 알림 (GPU-302). 어느 화면에 있든 업로드가 시작 · 완료(학습 생성) · 실패하면 오른쪽 아래 토스트로 알린다.
// 처음 그릴 때 이미 있던 업로드는 상태만 기억하고 알리지 않는다. 취소는 사용자가 직접 한 일이라 알리지 않는다.
export function UploadToasts({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const toast = useToast();
  const pending = useUploads();
  const seen = useRef<Map<string, UploadState> | null>(null);

  useEffect(() => {
    const first = seen.current === null;
    const prev = seen.current ?? new Map<string, UploadState>();
    const next = new Map<string, UploadState>();
    for (const u of pending) {
      next.set(u.key, u.state);
      const before = prev.get(u.key);
      if (first || before === u.state) continue;
      const name = u.summary.name;
      if (u.state === 'uploading' && (before === undefined || before === 'failed' || before === 'cancelled')) {
        toast({ uniqueID: `upload-${u.key}`, body: `${name}: S3 업로드를 시작했어요` });
      } else if (u.state === 'done' && u.jobId) {
        const jobId = u.jobId;
        toast({
          uniqueID: `upload-${u.key}`,
          body: `${name}: S3 업로드를 마치고 학습을 만들었어요`,
          endContent: <Button label="상세 보기" variant="secondary" size="sm" onClick={() => onOpenJob(jobId)} />,
        });
      } else if (u.state === 'failed') {
        toast({ uniqueID: `upload-${u.key}`, type: 'error', body: `${name}: S3 업로드에 실패했어요${u.error ? ` (${u.error})` : ''}` });
      }
    }
    seen.current = next;
  }, [pending, toast, onOpenJob]);

  return null;
}
