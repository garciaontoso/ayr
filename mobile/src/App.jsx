import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/layout/Header';
import TabBar from './components/layout/TabBar';
import { useOffline } from './hooks/useOffline';
import { useApp } from './context/AppContext';

const DashboardPage = lazy(() => import('./components/dashboard/DashboardPage'));
const AnalyticsPage = lazy(() => import('./components/analytics/AnalyticsPage'));
const CalendarPage = lazy(() => import('./components/calendar/CalendarPage'));
const PortfolioPage = lazy(() => import('./components/portfolio/PortfolioPage'));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage'));

const Loading = () => (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <div className="skeleton" style={{ width: 120, height: 16, margin: '0 auto 12px' }} />
    <div className="skeleton" style={{ width: 200, height: 12, margin: '0 auto' }} />
  </div>
);

export default function App() {
  const offline = useOffline();
  const { loading } = useApp();

  return (
    <div className="app-shell">
      {offline && <div className="offline-banner">Sin conexion - datos en cache</div>}
      <Header />
      <div className="app-content">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
      <TabBar />
    </div>
  );
}
