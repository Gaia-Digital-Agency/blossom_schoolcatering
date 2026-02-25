import RoleLoginForm from '../../_components/role-login-form';

export default function KitchenLoginPage() {
  return (
    <RoleLoginForm
      role="KITCHEN"
      title="Kitchen Login"
      usernameDefault="kitchen"
      passwordDefault="kitchen123"
      redirectPath="/kitchen"
    />
  );
}
