'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/menu', label: 'Menu' },
  { href: '/admin/parents', label: 'Parents' },
  { href: '/admin/youngsters', label: 'Youngsters' },
  { href: '/admin/schools', label: 'Schools' },
  { href: '/admin/blackout-dates', label: 'Blackout Dates' },
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/delivery', label: 'Delivery' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/kitchen', label: 'Kitchen' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="dev-links admin-nav-links">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? 'page' : undefined}
          className={pathname === link.href ? 'admin-nav-item admin-nav-item-active' : 'admin-nav-item'}
        >
          {link.label}
        </Link>
      ))}
      <style jsx>{`
        .admin-nav-links :global(.admin-nav-item) {
          border: 1px solid #ccbda2;
          background: #fff;
          border-radius: 0.55rem;
          padding: 0.5rem 0.7rem;
          color: #302a22;
          text-decoration: none;
          transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.15s ease;
        }
        .admin-nav-links :global(.admin-nav-item:hover) {
          background: #f4e8d2;
          border-color: #9e6b20;
          color: #35220c;
          transform: translateY(-1px);
        }
        .admin-nav-links :global(.admin-nav-item-active) {
          background: #2f271d;
          border-color: #2f271d;
          color: #fff2d2;
          font-weight: 700;
        }
        .admin-nav-links :global(.admin-nav-item-active:hover) {
          background: #3a3125;
          border-color: #3a3125;
          color: #fff2d2;
        }
      `}</style>
    </div>
  );
}
