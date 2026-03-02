import RoleLoginForm from '../../_components/role-login-form';

export default function ParentLoginPage() {
  return (
    <RoleLoginForm
      role="PARENT"
      title="Parent Login"
      redirectPath="/parents"
    />
  );
}
