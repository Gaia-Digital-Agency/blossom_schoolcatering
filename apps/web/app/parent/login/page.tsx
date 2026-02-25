import RoleLoginForm from '../../_components/role-login-form';

export default function ParentLoginPage() {
  return (
    <RoleLoginForm
      role="PARENT"
      title="Parent Login"
      usernameDefault="parent"
      passwordDefault="parent123"
      redirectPath="/parents"
    />
  );
}
