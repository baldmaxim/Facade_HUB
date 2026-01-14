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
import SuppliersPage from './pages/SuppliersPage';
import WorkAnalysisPage from './pages/WorkAnalysisPage';
import MaterialsAnalysisPage from './pages/MaterialsAnalysisPage';
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
        <Route path="/about" element={<InnerLayout><AboutPage /></InnerLayout>} />
        <Route path="/questions" element={<InnerLayout><QuestionsPage /></InnerLayout>} />
        <Route path="/prompts" element={<InnerLayout><PromptsPage /></InnerLayout>} />
        <Route path="/contractors" element={<InnerLayout><ContractorsPage /></InnerLayout>} />
        <Route path="/suppliers" element={<InnerLayout><SuppliersPage /></InnerLayout>} />
        <Route path="/work-analysis" element={<InnerLayout><WorkAnalysisPage /></InnerLayout>} />
        <Route path="/materials-analysis" element={<InnerLayout><MaterialsAnalysisPage /></InnerLayout>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
