import type { Metadata, Viewport } from 'next';
import WorkerShell from './worker-shell';

export const metadata: Metadata = {
  title: 'RouteTire — Panel Pracownika',
  description: 'Aplikacja mobilna dla pracowników terenowych',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RouteTire',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return <WorkerShell>{children}</WorkerShell>;
}
