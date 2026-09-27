import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import SetupBanner from '@/components/SetupBanner';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'ML Behavioral Anomaly Detection',
  description: 'ML-powered per-user behavioral anomaly detection for Snowflake accounts',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Runs before hydration so the correct theme class is present on first
            paint -- avoids a flash of light-mode before React mounts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
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
