import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './Button';

const DARK_MODE_KEY = 'ai-studio-dark-mode';

function getInitialDarkMode(): boolean {
  // Check localStorage first
  const stored = localStorage.getItem(DARK_MODE_KEY);
  if (stored !== null) {
    return stored === 'true';
  }
  // Fall back to system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(getInitialDarkMode);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(DARK_MODE_KEY, String(isDark));
  }, [isDark]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if user hasn't explicitly set a preference
      if (localStorage.getItem(DARK_MODE_KEY) === null) {
        setIsDark(e.matches);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setIsDark((prev) => !prev)}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      className="px-2"
    >
      {isDark ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </Button>
  );
}
