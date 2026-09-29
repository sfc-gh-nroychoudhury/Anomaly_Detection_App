import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import SetupBanner from '@/components/SetupBanner';
import ThemeScript from '@/components/ThemeScript';

const inter = localFont({
  src: [
    { path: '../public/fonts/Inter-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/Inter-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/Inter-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/Inter-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'ML Behavioral Anomaly Detection',
  description: 'ML-powered per-user behavioral anomaly detection for Snowflake accounts',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <ThemeScript />
      </head>
      <body>
        <div className="flex h-screen w-full overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <SetupBanner />
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-7xl px-10 py-9">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
