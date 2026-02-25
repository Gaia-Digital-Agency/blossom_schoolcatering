import RoleLoginForm from '../../_components/role-login-form';

export default function AdminLoginPage() {
  return (
    <RoleLoginForm
      role="ADMIN"
      title="Admin Login"
      usernameDefault="admin"
      passwordDefault="admin123"
      redirectPath="/admin"
    />
  );
}
