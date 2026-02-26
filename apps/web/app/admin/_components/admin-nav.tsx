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
    <div className="dev-links">
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
          {pathname === link.href ? `• ${link.label}` : link.label}
        </Link>
      ))}
    </div>
  );
}
