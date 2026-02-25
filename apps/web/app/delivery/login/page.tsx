import RoleLoginForm from '../../_components/role-login-form';

export default function DeliveryLoginPage() {
  return (
    <RoleLoginForm
      role="DELIVERY"
      title="Delivery Login"
      usernameDefault="delivery"
      passwordDefault="delivery123"
      redirectPath="/delivery"
    />
  );
}
