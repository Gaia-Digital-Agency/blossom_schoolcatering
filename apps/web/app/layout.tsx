import type { Metadata } from 'next';
import './globals.css';
import NetworkActivityIndicator from './_components/network-activity-indicator';

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
      </body>
    </html>
  );
}
