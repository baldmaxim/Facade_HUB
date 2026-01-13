import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import ProjectsTable from './components/ProjectsTable';
import Footer from './components/Footer';
import ObjectsPage from './pages/ObjectsPage';
import ObjectPage from './pages/ObjectPage';
import ChecklistPage from './pages/ChecklistPage';
import ObjectInfoPage from './pages/ObjectInfoPage';
import CalculationPage from './pages/CalculationPage';
import './index.css';

function HomePage() {
  return (
    <>
      <Hero />
      <ProjectsTable />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/objects" element={<ObjectsPage />} />
        <Route path="/objects/:id" element={<ObjectPage />} />
        <Route path="/objects/:id/checklist" element={<ChecklistPage />} />
        <Route path="/objects/:id/info" element={<ObjectInfoPage />} />
        <Route path="/objects/:id/calculation" element={<CalculationPage />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}

export default App;
