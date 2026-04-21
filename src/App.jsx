import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import ObjectsPreview from './components/ObjectsPreview';
import StatsPreview from './components/StatsPreview';
import TasksPreview from './components/TasksPreview';
import LandingCharts from './components/LandingCharts';
import Footer from './components/Footer';
import './index.css';

// Ленивая загрузка всех страниц — сокращает размер главного бандла.
// xlsx, chart.js и т.д. подгружаются только когда юзер заходит на
// конкретную страницу, которая их использует.
const ObjectsPage            = lazy(() => import('./pages/ObjectsPage'));
const ObjectPage             = lazy(() => import('./pages/ObjectPage'));
const ChecklistPage          = lazy(() => import('./pages/ChecklistPage'));
const ObjectInfoPage         = lazy(() => import('./pages/ObjectInfoPage'));
const CalculationPage        = lazy(() => import('./pages/CalculationPage'));
const AboutPage              = lazy(() => import('./pages/AboutPage'));
const QuestionsPage          = lazy(() => import('./pages/QuestionsPage'));
const PromptsPage            = lazy(() => import('./pages/PromptsPage'));
const ContractorsPage        = lazy(() => import('./pages/ContractorsPage'));
const MaterialsAnalysisPage  = lazy(() => import('./pages/MaterialsAnalysisPage'));
const AdminPage              = lazy(() => import('./pages/AdminPage'));
const LoginPage              = lazy(() => import('./pages/LoginPage'));
const WorkPricesPage         = lazy(() => import('./pages/WorkPricesPage'));
const WorkPricesFactPage     = lazy(() => import('./pages/WorkPricesFactPage'));
const TasksPage              = lazy(() => import('./pages/TasksPage'));
const CostAnalyticsPage      = lazy(() => import('./pages/CostAnalyticsPage'));
const WorkTypeAnalyticsPage  = lazy(() => import('./pages/WorkTypeAnalyticsPage'));
const PlanFactAnalysisPage   = lazy(() => import('./pages/PlanFactAnalysisPage'));
const VorPage                = lazy(() => import('./pages/VorPage'));
const VorTemplatesPage       = lazy(() => import('./pages/VorTemplatesPage'));

function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      color: 'var(--color-text-secondary, #888)',
      fontSize: 14,
    }}>
      Загрузка...
    </div>
  );
}

function HomePage() {
  return (
    <>
      <Header />
      <ObjectsPreview />
      <TasksPreview />
      <StatsPreview />
      <LandingCharts />
      <Footer />
    </>
  );
}

function InnerLayout({ children }) {
  return (
    <>
      <Header />
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
      <Footer />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/objects" element={<InnerLayout><ObjectsPage /></InnerLayout>} />
        <Route path="/objects/:id" element={<InnerLayout><ObjectPage /></InnerLayout>} />
        <Route path="/objects/:id/checklist" element={<InnerLayout><ChecklistPage /></InnerLayout>} />
        <Route path="/objects/:id/info" element={<InnerLayout><ObjectInfoPage /></InnerLayout>} />
        <Route path="/objects/:id/calculation" element={<InnerLayout><CalculationPage /></InnerLayout>} />
        <Route path="/objects/:id/work-prices" element={<InnerLayout><WorkPricesPage /></InnerLayout>} />
        <Route path="/objects/:id/work-prices-fact" element={<InnerLayout><WorkPricesFactPage /></InnerLayout>} />
        <Route path="/objects/:id/tasks" element={<InnerLayout><TasksPage /></InnerLayout>} />
        <Route path="/objects/:id/vor" element={<InnerLayout><VorPage /></InnerLayout>} />
        <Route path="/vor-templates" element={<InnerLayout><VorTemplatesPage /></InnerLayout>} />
        <Route path="/about" element={<InnerLayout><AboutPage /></InnerLayout>} />
        <Route path="/questions" element={<InnerLayout><QuestionsPage /></InnerLayout>} />
        <Route path="/prompts" element={<InnerLayout><PromptsPage /></InnerLayout>} />
        <Route path="/contractors" element={<InnerLayout><ContractorsPage /></InnerLayout>} />
        <Route path="/work-analysis" element={<InnerLayout><WorkTypeAnalyticsPage /></InnerLayout>} />
        <Route path="/materials-analysis" element={<InnerLayout><MaterialsAnalysisPage /></InnerLayout>} />
        <Route path="/analytics/total" element={<InnerLayout><CostAnalyticsPage /></InnerLayout>} />
        <Route path="/analytics/plan-fact" element={<InnerLayout><PlanFactAnalysisPage /></InnerLayout>} />
        <Route path="/login" element={
          <Suspense fallback={<PageLoader />}>
            <LoginPage />
          </Suspense>
        } />
        <Route path="/admin" element={<InnerLayout><AdminPage /></InnerLayout>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
