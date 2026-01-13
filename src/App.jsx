import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import StatsPreview from './components/StatsPreview';
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
      <StatsPreview />
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
