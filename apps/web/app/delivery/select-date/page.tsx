import DeliveryDashboard from '../_components/delivery-dashboard';

export default function DeliverySelectDatePage() {
  return <DeliveryDashboard offsetDays={0} title="Delivery Dashboard - Select Date" returnHref="/delivery" dateMode="select" />;
}
