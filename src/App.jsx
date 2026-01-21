import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import ObjectsPreview from './components/ObjectsPreview';
import StatsPreview from './components/StatsPreview';
import LandingCharts from './components/LandingCharts';
import Footer from './components/Footer';
import ObjectsPage from './pages/ObjectsPage';
import ObjectPage from './pages/ObjectPage';
import ChecklistPage from './pages/ChecklistPage';
import ObjectInfoPage from './pages/ObjectInfoPage';
import CalculationPage from './pages/CalculationPage';
import AboutPage from './pages/AboutPage';
import QuestionsPage from './pages/QuestionsPage';
import PromptsPage from './pages/PromptsPage';
import ContractorsPage from './pages/ContractorsPage';
import WorkAnalysisPage from './pages/WorkAnalysisPage';
import MaterialsAnalysisPage from './pages/MaterialsAnalysisPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import WorkPricesPage from './pages/WorkPricesPage';
import WorkPricesFactPage from './pages/WorkPricesFactPage';
import TasksPage from './pages/TasksPage';
import CostAnalyticsPage from './pages/CostAnalyticsPage';
import WorkTypeAnalyticsPage from './pages/WorkTypeAnalyticsPage';
import PlanFactAnalysisPage from './pages/PlanFactAnalysisPage';
import './index.css';

function HomePage() {
  return (
    <>
      <Header />
      <ObjectsPreview />
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
      {children}
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
        <Route path="/about" element={<InnerLayout><AboutPage /></InnerLayout>} />
        <Route path="/questions" element={<InnerLayout><QuestionsPage /></InnerLayout>} />
        <Route path="/prompts" element={<InnerLayout><PromptsPage /></InnerLayout>} />
        <Route path="/contractors" element={<InnerLayout><ContractorsPage /></InnerLayout>} />
        <Route path="/work-analysis" element={<InnerLayout><WorkTypeAnalyticsPage /></InnerLayout>} />
        <Route path="/materials-analysis" element={<InnerLayout><MaterialsAnalysisPage /></InnerLayout>} />
        <Route path="/analytics/total" element={<InnerLayout><CostAnalyticsPage /></InnerLayout>} />
        <Route path="/analytics/plan-fact" element={<InnerLayout><PlanFactAnalysisPage /></InnerLayout>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<InnerLayout><AdminPage /></InnerLayout>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
