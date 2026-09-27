'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

// Reads/writes the `dark` class on <html>. The initial class is set
// synchronously by an inline script in layout.tsx (before hydration) to
// avoid a flash of the wrong theme -- this component only needs to mirror
// that state and handle toggling + persistence from then on.
export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-7 w-7 items-center justify-center rounded-md text-sf-slate transition-colors hover:bg-sf-mist hover:text-sf-ink"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
