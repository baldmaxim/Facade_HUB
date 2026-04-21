import VorCodeTemplatesView from '../components/VorCodeTemplatesView';
import VorCustomTemplatesView from '../components/VorCustomTemplatesView';
import { TEMPLATES } from '../lib/vorTemplates';
import './VorTemplatesPage.css';

function VorTemplatesPage() {
  return (
    <main className="vort-page">
      <div className="vort-container">
        <h1 className="vort-title">База шаблонов ВОР</h1>
        <p className="vort-subtitle">
          Встроенных в код: {Object.keys(TEMPLATES).length} шт. (read-only). Ниже — пользовательские (можно создавать на портале).
        </p>
        <VorCodeTemplatesView />
        <VorCustomTemplatesView />
      </div>
    </main>
  );
}

export default VorTemplatesPage;
