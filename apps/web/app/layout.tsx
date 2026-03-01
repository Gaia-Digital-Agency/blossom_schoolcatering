import type { Metadata } from 'next';
import './globals.css';
import NetworkActivityIndicator from './_components/network-activity-indicator';
import BackToTopGlobal from './_components/back-to-top-global';

export const metadata: Metadata = {
  title: 'Blossom School Catering',
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
