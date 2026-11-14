export type IconName = 'grid' | 'add' | 'sun' | 'moon' | 'layers' | 'check' | 'arrow' | 'chip' | 'back' | 'cross' | 'clock' | 'play' | 'stop' | 'doc';

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    add: <path d="M12 5v14M5 12h14" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4L19 5" /></>,
    moon: <path d="M20 15.2A8.5 8.5 0 018.8 4a8.6 8.6 0 1011.2 11.2z" />,
    layers: <><path d="M12 3L2 8l10 5 10-5-10-5zM2 12l10 5 10-5M2 16l10 5 10-5" /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    arrow: <path d="M5 12h14m-6-6l6 6-6 6" />,
    back: <path d="M19 12H5m6-6l-6 6 6 6" />,
    chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" /></>,
    cross: <path d="M6 6l12 12M18 6L6 18" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    play: <path d="M8 5.5v13l10-6.5z" />,
    stop: <><circle cx="12" cy="12" r="8.5" /><path d="M6 18L18 6" /></>,
    doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5m-5 4h5" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
