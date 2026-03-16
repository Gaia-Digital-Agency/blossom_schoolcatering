import RoleLoginForm from '../../_components/role-login-form';

export default function StudentLoginPage() {
  return (
    <RoleLoginForm
      role="YOUNGSTER"
      title="Student Login"
      redirectPath="/student"
    />
  );
}
