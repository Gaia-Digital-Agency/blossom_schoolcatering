import RoleLoginForm from '../../_components/role-login-form';

export default function AdminLoginPage() {
  return (
    <RoleLoginForm
      role="ADMIN"
      title="Admin Login"
      redirectPath="/admin"
    />
  );
}
