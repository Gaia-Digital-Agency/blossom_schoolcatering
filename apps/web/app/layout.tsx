import type { Metadata } from 'next';
import './globals.css';
import NetworkActivityIndicator from './_components/network-activity-indicator';
import BackToTopGlobal from './_components/back-to-top-global';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://34.124.244.233').replace(/\/+$/, '');

export const metadata: Metadata = {
  title: 'Blossom School Catering',
  description: 'School meal ordering platform for parents, youngsters, kitchen, delivery, and admin operations.',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/schoolcatering',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/schoolcatering/assets/logo.svg',
    apple: '/schoolcatering/assets/logo.svg'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="home-page">
        <NetworkActivityIndicator />
        {children}
        <BackToTopGlobal />
      </body>
    </html>
  );
}
