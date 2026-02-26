import RegisterForm from '../_components/register-form';

export default function YoungstersRegisterPage() {
  return (
    <RegisterForm
      allowedRoles={['YOUNGSTER', 'PARENT']}
      title="Parent & Youngster Registration"
      subtitle="Register youngsters or parents from this single page."
    />
  );
}
