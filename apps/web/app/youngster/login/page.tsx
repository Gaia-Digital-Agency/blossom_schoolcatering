import RoleLoginForm from '../../_components/role-login-form';

export default function YoungsterLoginPage() {
  return (
    <RoleLoginForm
      role="YOUNGSTER"
      title="Youngster Login"
      usernameDefault="youngster"
      passwordDefault="youngster123"
      redirectPath="/youngsters"
    />
  );
}
