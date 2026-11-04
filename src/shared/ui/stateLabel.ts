// 상태 코드 → 화면에 보이는 한국어 이름. StateBadge와 FilterBar가 같이 쓴다.
export const STATE_LABEL: Record<string, string> = {
  PENDING: '대기 중',
  RUNNING: '실행 중',
  SUCCEEDED: '성공',
  FAILED: '실패',
  CANCELLED: '취소됨',
  REQUESTED: '요청됨',
  ACTIVE: '실행 중',
  INFEASIBLE: '실행 불가',
};
