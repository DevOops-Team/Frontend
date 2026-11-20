import { useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@/shared/ui/Icon';
import { errorMessage, restartJob } from '../api';
import { isRestartable } from '../lib/stop';
import type { Job } from '../types';

// 학습 다시 시작 버튼 + 확인 창 (GPU-240). 중단한 학습의 목록 줄과 실행 상세에서 같이 쓴다.
// 다시 시작하면 Backend가 다음 세대를 제출하고 상태가 '대기 중'부터 다시 바뀐다. 실패하면 창을 닫지 않고 이유를 보여 준다.
export function RestartJobButton({ job, size = 'sm', onRestarted }: { job: Job; size?: 'sm' | 'md'; onRestarted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState('');
  if (!isRestartable(job.status)) return null;

  async function restart() {
    setRestarting(true);
    setError('');
    try {
      await restartJob(job.id);
      setConfirming(false);
      onRestarted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRestarting(false);
    }
  }

  const from = job.progress && job.progress.lastCheckpointStep > 0
    ? `마지막으로 저장된 체크포인트(step ${job.progress.lastCheckpointStep.toLocaleString()}) 다음부터 이어서 학습합니다.`
    : '저장된 체크포인트가 없으면 처음부터 다시 학습합니다.';
  return <>
    <Button label="다시 시작" aria-label={`${job.name} 다시 시작`} variant="secondary" size={size} icon={<Icon name="play" size={16} />}
      onClick={() => { setError(''); setConfirming(true); }} />
    <AlertDialog
      isOpen={confirming}
      onOpenChange={(open) => { if (!restarting) setConfirming(open); }}
      title={`'${job.name}' 학습을 다시 시작할까요?`}
      description={error ? `다시 시작하지 못했습니다: ${error}` : `처음과 같은 설정으로 GPU를 다시 받아 ${from}`}
      cancelLabel="취소"
      actionLabel="다시 시작"
      isActionLoading={restarting}
      onAction={() => { void restart(); }}
    />
  </>;
}
