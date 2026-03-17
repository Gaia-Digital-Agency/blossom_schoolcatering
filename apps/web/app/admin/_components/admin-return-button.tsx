'use client';

import LogoutButton from '../../_components/logout-button';

export default function AdminReturnButton() {
  return <LogoutButton returnHref="/admin" showLogout={false} showRecord={false} sticky={false} />;
}
