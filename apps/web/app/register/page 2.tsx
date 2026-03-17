import Link from 'next/link';

export default function RegisterPage() {
  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Registration</h1>
        <p className="auth-help">Delivery registration is handled by Admin Panel only.</p>
        <div className="dev-links">
          <Link href="/register/youngsters">Register Student (Includes Family)</Link>
          <Link href="/login">Back to Login</Link>
        </div>
        <div className="quick-credentials" style={{ marginTop: '0.8rem' }}>
          <p><strong>For Testing Note</strong></p>
          <p>Student Register: url: /register/youngsters (view only)</p>
          <p>Student Login: url: /login | user: youngster | pw: teameditor123</p>
          <p>Family Login: url: /login | user: parent | pw: teameditor123</p>
          <p>Delivery Login: url: /delivery/login | user: delivery | pw: teameditor123</p>
          <p>Kitchen Login: url: /kitchen/login | user: kitchen | pw: teameditor123</p>
          <p>Admin Login: url: /admin/login | user: admin | pw: teameditor123</p>
        </div>
      </section>
    </main>
  );
}
