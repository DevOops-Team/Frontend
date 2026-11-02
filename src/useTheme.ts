import { useEffect, useState } from 'react';
export type Theme = 'light' | 'dark';
const KEY = 'devoops-google-theme';
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Private browsing may disable storage. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* The toggle still works without persistence. */ }
  }, [theme]);
  return { theme, setTheme };
}
