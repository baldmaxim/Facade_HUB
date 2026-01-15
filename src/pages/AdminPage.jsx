import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './AdminPage.css';

function AdminPage() {
  // Units state
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [units, setUnits] = useState([]);
  const [newUnit, setNewUnit] = useState('');
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Cost types state
  const [showCostTypesModal, setShowCostTypesModal] = useState(false);
  const [costTypes, setCostTypes] = useState([]);
  const [newCostType, setNewCostType] = useState('');
  const [loadingCostTypes, setLoadingCostTypes] = useState(false);

  // Fetch units
  const fetchUnits = async () => {
    const { data, error } = await supabase
      .from('unit')
      .select('*')
      .order('name');

    if (!error && data) {
      setUnits(data);
    }
  };

  // Fetch cost types
  const fetchCostTypes = async () => {
    const { data, error } = await supabase
      .from('cost_types')
      .select('*')
      .order('name');

    if (error) {
      console.error('Ошибка загрузки видов затрат:', error.message, error.code, error);
    } else {
      console.log('Загружено видов затрат:', data?.length || 0);
      setCostTypes(data || []);
    }
  };

  useEffect(() => {
    if (showUnitsModal) {
      fetchUnits();
    }
  }, [showUnitsModal]);

  useEffect(() => {
    if (showCostTypesModal) {
      fetchUnits();
      fetchCostTypes();
    }
  }, [showCostTypesModal]);

  // Units handlers
  const handleAddUnit = async (e) => {
    e.preventDefault();
    if (!newUnit.trim()) return;

    setLoadingUnits(true);
    const { error } = await supabase
      .from('unit')
      .insert({ name: newUnit.trim() });

    if (!error) {
      setNewUnit('');
      fetchUnits();
    }
    setLoadingUnits(false);
  };

  const handleDeleteUnit = async (id) => {
    const { error } = await supabase
      .from('unit')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchUnits();
    }
  };

  // Cost types handlers
  const handleAddCostType = async (e) => {
    e.preventDefault();
    if (!newCostType.trim()) return;

    setLoadingCostTypes(true);
    const { error } = await supabase
      .from('cost_types')
      .insert({ name: newCostType.trim() });

    if (!error) {
      setNewCostType('');
      fetchCostTypes();
    }
    setLoadingCostTypes(false);
  };

  const handleDeleteCostType = async (id) => {
    const { error } = await supabase
      .from('cost_types')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchCostTypes();
    }
  };

  return (
    <main className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1 className="admin-title">Управление</h1>
          <p className="admin-subtitle">Панель администратора</p>
        </div>

        <div className="admin-grid">
          <div className="admin-card" onClick={() => setShowUnitsModal(true)}>
            <div className="admin-card-icon">
              <span>📏</span>
            </div>
            <h3 className="admin-card-title">Единицы измерения</h3>
            <p className="admin-card-description">Управление справочником единиц измерения</p>
          </div>

          <div className="admin-card" onClick={() => setShowCostTypesModal(true)}>
            <div className="admin-card-icon">
              <span>💰</span>
            </div>
            <h3 className="admin-card-title">Виды затрат</h3>
            <p className="admin-card-description">Управление видами затрат на строительство</p>
          </div>

          <div className="admin-card">
            <div className="admin-card-icon">
              <span>👥</span>
            </div>
            <h3 className="admin-card-title">Пользователи</h3>
            <p className="admin-card-description">Управление пользователями и ролями</p>
          </div>

          <div className="admin-card">
            <div className="admin-card-icon">
              <span>⚙️</span>
            </div>
            <h3 className="admin-card-title">Настройки</h3>
            <p className="admin-card-description">Общие настройки платформы</p>
          </div>
        </div>
      </div>

      {/* Units Modal */}
      {showUnitsModal && (
        <div className="admin-modal-overlay" onClick={() => setShowUnitsModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Единицы измерения</h2>
              <button
                className="admin-modal-close"
                onClick={() => setShowUnitsModal(false)}
              >
                &times;
              </button>
            </div>

            <form className="admin-form" onSubmit={handleAddUnit}>
              <input
                type="text"
                className="admin-input"
                placeholder="Новая единица измерения..."
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
              />
              <button
                type="submit"
                className="admin-add-btn"
                disabled={loadingUnits || !newUnit.trim()}
              >
                Добавить
              </button>
            </form>

            <div className="admin-list">
              {units.length === 0 ? (
                <p className="admin-list-empty">Нет единиц измерения</p>
              ) : (
                units.map((unit) => (
                  <div key={unit.id} className="admin-list-item">
                    <span className="admin-list-item-name">{unit.name}</span>
                    <button
                      className="admin-list-item-delete"
                      onClick={() => handleDeleteUnit(unit.id)}
                      title="Удалить"
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cost Types Modal */}
      {showCostTypesModal && (
        <div className="admin-modal-overlay" onClick={() => setShowCostTypesModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Виды затрат</h2>
              <button
                className="admin-modal-close"
                onClick={() => setShowCostTypesModal(false)}
              >
                &times;
              </button>
            </div>

            <form className="admin-form" onSubmit={handleAddCostType}>
              <input
                type="text"
                className="admin-input"
                placeholder="Название вида затрат..."
                value={newCostType}
                onChange={(e) => setNewCostType(e.target.value)}
              />
              <button
                type="submit"
                className="admin-add-btn"
                disabled={loadingCostTypes || !newCostType.trim()}
              >
                Добавить
              </button>
            </form>

            <div className="admin-list">
              {costTypes.length === 0 ? (
                <p className="admin-list-empty">Нет видов затрат</p>
              ) : (
                costTypes.map((costType) => (
                  <div key={costType.id} className="admin-list-item">
                    <span className="admin-list-item-name">{costType.name}</span>
                    <button
                      className="admin-list-item-delete"
                      onClick={() => handleDeleteCostType(costType.id)}
                      title="Удалить"
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default AdminPage;
