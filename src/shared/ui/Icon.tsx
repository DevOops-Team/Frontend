import { PATHS, type IconName } from './iconPaths';

export type { IconName };

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths = PATHS;
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
