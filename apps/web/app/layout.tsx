import type { Metadata } from 'next';
import './globals.css';

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
      <body className="home-page">{children}</body>
    </html>
  );
}
