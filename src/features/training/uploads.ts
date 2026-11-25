import { useSyncExternalStore } from 'react';
import { submitJob } from './api';
import { createUploadQueue } from './lib/uploadQueue';

// 앱 전체에서 하나. 화면을 옮겨도(개요 ↔ 새 학습 ↔ 상세) 업로드는 계속된다.
export const uploads = createUploadQueue(submitJob);

// 업로드는 이 탭의 메모리에만 있어 새로 고침하면 끊긴다. 보내는 중이면 브라우저 확인 창을 띄운다.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!uploads.hasActive()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

export function useUploads() {
  return useSyncExternalStore(uploads.subscribe, uploads.list);
}
