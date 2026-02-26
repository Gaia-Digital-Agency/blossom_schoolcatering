'use client';

import AdminNav from '../_components/admin-nav';

export default function AdminKitchenPage() {
  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Admin Kitchen</h1>
        <AdminNav />
        <p className="auth-help">Kitchen summary and allergen management page scaffolded for Step 9.</p>
      </section>
    </main>
  );
}
