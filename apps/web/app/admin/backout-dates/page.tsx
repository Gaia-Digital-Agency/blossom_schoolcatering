'use client';

import AdminNav from '../_components/admin-nav';

export default function AdminBackoutDatesAliasPage() {
  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Admin Backout Dates</h1>
        <AdminNav />
        <p className="auth-help">Use /admin/blackout-dates for the canonical blackout dates page.</p>
      </section>
    </main>
  );
}
