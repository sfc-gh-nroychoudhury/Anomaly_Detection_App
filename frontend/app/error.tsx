'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
  }, [error]);

  return (
    <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ color: '#ef4444' }}>Something went wrong</h2>
      <pre style={{ 
        background: '#1e293b', color: '#e2e8f0', padding: 16, borderRadius: 8,
        overflow: 'auto', fontSize: 13, maxHeight: 400 
      }}>
        {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
      <button 
        onClick={reset}
        style={{ marginTop: 16, padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  );
}
