import DeliveryDashboard from '../_components/delivery-dashboard';

export default function DeliveryYesterdayPage() {
  return <DeliveryDashboard offsetDays={-1} title="Delivery Dashboard - Yesterday" returnHref="/delivery" fixedDateLabel="Yesterday" />;
}
