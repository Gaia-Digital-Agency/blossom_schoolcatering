import DeliveryDashboard from '../_components/delivery-dashboard';

export default function DeliveryTomorrowPage() {
  return <DeliveryDashboard offsetDays={1} title="Delivery Dashboard - Tomorrow" returnHref="/delivery" fixedDateLabel="Tomorrow" />;
}
