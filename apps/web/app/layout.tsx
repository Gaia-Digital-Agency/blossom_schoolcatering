import type { Metadata } from 'next';
import './globals.css';
import NetworkActivityIndicator from './_components/network-activity-indicator';
import BackToTopGlobal from './_components/back-to-top-global';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://34.158.47.112').replace(/\/+$/, '');

/**
 * Metadata for the website.
 * This object contains default metadata for the site, such as the title, description,
 * and icons. It is used by Next.js to populate the <head> tag of the HTML.
 */
export const metadata: Metadata = {
  title: 'Blossom School Catering',
  description: 'School meal ordering platform for families, students, kitchen, delivery, and admin operations.',
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

/**
 * The root layout for the entire application.
 * This component wraps every page and includes global components like
 * the network activity indicator and the back-to-top button.
 * @param {object} props - The component's props.
 * @param {React.ReactNode} props.children - The child components to be rendered within the layout.
 * @returns {React.ReactElement} The root layout structure.
 */
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
