import RoleLoginForm from '../../_components/role-login-form';

export default function FamilyLoginPage() {
  return (
    <RoleLoginForm
      role="PARENT"
      title="Family Login"
      redirectPath="/family"
    />
  );
}
