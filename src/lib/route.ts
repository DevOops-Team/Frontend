export type TrainingTab = 'pipelines' | 'custom' | 'hpt';

export type Route =
  | { page: 'dashboard' }
  | { page: 'datasets' }
  | { page: 'training'; tab: TrainingTab }
  | { page: 'create' }
  | { page: 'pipeline'; id: string }
  | { page: 'hpt'; id: string }
  | { page: 'models' }
  | { page: 'model'; id: string }
  | { page: 'endpoints' };

export type Navigate = (r: Route) => void;

// 왼쪽 메뉴에서 어떤 항목을 강조할지
export function section(r: Route): 'dashboard' | 'datasets' | 'training' | 'models' | 'endpoints' {
  switch (r.page) {
    case 'create':
    case 'pipeline':
    case 'hpt':
    case 'training':
      return 'training';
    case 'model':
      return 'models';
    default:
      return r.page;
  }
}
