import KitchenDashboard from '../_components/kitchen-dashboard';

export default function KitchenYesterdayPage() {
  return <KitchenDashboard offsetDays={-1} title="Kitchen Dashboard - Yesterday" showOrderBoards={false} />;
}
