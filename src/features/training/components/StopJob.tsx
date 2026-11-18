import { useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@/shared/ui/Icon';
import { errorMessage, stopJob } from '../api';
import { STOP_RECOVERING_HINT, isStoppable, showsStop } from '../lib/stop';
import type { Job } from '../types';

// 학습 중단 버튼 + 확인 창 (GPU-204). 목록 줄과 실행 상세에서 같이 쓴다.
// 중단하면 Backend가 JobSet을 지우고 상태가 '중단 중'(STOPPING)이 되며, 감시기 사건이 들어오면 '중단됨'이 된다.
// 실패하면 창을 닫지 않고 이유를 보여 준다.
export function StopJobButton({ job, size = 'sm', onStopped }: { job: Job; size?: 'sm' | 'md'; onStopped: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  if (!showsStop(job.status)) return null;
  const allowed = isStoppable(job.status);

  async function stop() {
    setStopping(true);
    setError('');
    try {
      await stopJob(job.id);
      setConfirming(false);
      onStopped();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStopping(false);
    }
  }

  const saved = job.progress && job.progress.lastCheckpointStep > 0
    ? `마지막으로 저장된 체크포인트(step ${job.progress.lastCheckpointStep.toLocaleString()})는 남습니다.`
    : '아직 저장된 체크포인트가 없어 학습 결과가 남지 않습니다.';
  return <>
    <Button label="학습 중단" aria-label={`${job.name} 학습 중단`} variant="secondary" size={size} icon={<Icon name="stop" size={16} />}
      isDisabled={!allowed} tooltip={allowed ? undefined : STOP_RECOVERING_HINT} onClick={() => { setError(''); setConfirming(true); }} />
    <AlertDialog
      isOpen={confirming}
      onOpenChange={(open) => { if (!stopping) setConfirming(open); }}
      title={`'${job.name}' 학습을 중단할까요?`}
      description={error ? `중단하지 못했습니다: ${error}` : `GPU에서 학습을 바로 멈춥니다. ${saved} 중단한 학습은 다시 이어서 실행할 수 없습니다.`}
      cancelLabel="계속 학습"
      actionLabel="학습 중단"
      actionVariant="destructive"
      isActionLoading={stopping}
      onAction={() => { void stop(); }}
    />
  </>;
}
