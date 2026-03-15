import RoleLoginForm from '../../_components/role-login-form';

/**
 * Renders the login page for the Admin role.
 * This component utilizes the reusable `RoleLoginForm` to create a
 * login form tailored for administrators.
 */
export default function AdminLoginPage() {
  return (
    <RoleLoginForm
      role="ADMIN"
      title="Admin Login"
      redirectPath="/admin"
    />
  );
}
