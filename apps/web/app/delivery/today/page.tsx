import DeliveryDashboard from '../_components/delivery-dashboard';

export default function DeliveryTodayPage() {
  return <DeliveryDashboard offsetDays={0} title="Delivery Dashboard - Today" returnHref="/delivery" fixedDateLabel="Today" />;
}
