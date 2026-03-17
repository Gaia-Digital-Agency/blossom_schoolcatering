'use client';

import { usePathname } from 'next/navigation';
import AdminHub from './admin-hub';

export default function AdminNav() {
  const pathname = usePathname();

  if (pathname === '/admin') {
    return <AdminHub />;
  }

  return null;
}
