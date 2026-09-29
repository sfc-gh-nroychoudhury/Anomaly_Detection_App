'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: 40, fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>
        <h2 style={{ color: '#ef4444' }}>Application Error</h2>
        <pre style={{ 
          background: '#1e293b', padding: 16, borderRadius: 8,
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
      </body>
    </html>
  );
}
