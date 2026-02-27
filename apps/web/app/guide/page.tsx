import Link from 'next/link';

export default function GuidePage() {
  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Guides and T&amp;C</h1>
        <p className="auth-help">Tap each section to expand.</p>

        <div className="guide-list">
          <details>
            <summary>User Guide: Parent</summary>
            <p>Open <code>/schoolcatering/parent/login</code>, then use <code>/schoolcatering/parents</code>.</p>
            <p>Parent can manage linked youngsters, build draft cart from search, place orders, and view billing.</p>
          </details>

          <details>
            <summary>User Guide: Youngster</summary>
            <p>Open <code>/schoolcatering/youngster/login</code>, then use <code>/schoolcatering/youngsters</code>.</p>
            <p>Youngster can review profile, nutrition badge, and place own orders from Session Menu and Cart.</p>
          </details>

          <details>
            <summary>User Guide: Delivery</summary>
            <p>Open <code>/schoolcatering/delivery/login</code>, then use <code>/schoolcatering/delivery</code>.</p>
            <p>Assignments are grouped by school and only visible for mapped schools.</p>
          </details>

          <details>
            <summary>User Guide: Kitchen</summary>
            <p>Open <code>/schoolcatering/kitchen/login</code>, then use <code>/schoolcatering/kitchen</code>.</p>
            <p>Kitchen can monitor daily orders, allergen alerts, and order readiness flow.</p>
          </details>

          <details>
            <summary>User Guide: Billing &amp; Payment</summary>
            <p>Parents upload payment proof from billing section. Admin verifies billing and can generate receipt.</p>
          </details>

          <details>
            <summary>User Guide: Menu</summary>
            <p>Admin manages menu items, ingredients, sessions, and availability from <code>/schoolcatering/admin/menu</code>.</p>
          </details>

          <details>
            <summary>User Guide: Terms &amp; Condition</summary>
            <p>Orders follow session availability, cutoff windows, weekend and blackout-date restrictions.</p>
          </details>

          <details>
            <summary>User Guide: Contact Us</summary>
            <p>For support, contact school catering operations team or admin support channel.</p>
          </details>
        </div>

        <div className="dev-links">
          <Link href="/">Back to Home</Link>
          <Link href="/login">Go to Login</Link>
          <Link href="/register/youngsters">Go to Register</Link>
        </div>
      </section>
    </main>
  );
}
