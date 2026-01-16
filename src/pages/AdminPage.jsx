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

  // Works state
  const [showWorksModal, setShowWorksModal] = useState(false);
  const [works, setWorks] = useState([]);
  const [newWork, setNewWork] = useState({ name: '', unit_id: '' });
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [editingWork, setEditingWork] = useState(null);

  // Facade elements state
  const [showFacadeElementsModal, setShowFacadeElementsModal] = useState(false);
  const [facadeElements, setFacadeElements] = useState([]);
  const [newFacadeElement, setNewFacadeElement] = useState('');
  const [loadingFacadeElements, setLoadingFacadeElements] = useState(false);
  const [editingFacadeElement, setEditingFacadeElement] = useState(null);

  // Status state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statuses, setStatuses] = useState([]);
  const [newStatus, setNewStatus] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [editingStatus, setEditingStatus] = useState(null);

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
      setCostTypes(data || []);
    }
  };

  // Fetch works
  const fetchWorks = async () => {
    const { data, error } = await supabase
      .from('work_types')
      .select('*, unit:unit_id(name)')
      .order('name');

    if (!error && data) {
      setWorks(data);
    }
  };

  // Fetch facade elements
  const fetchFacadeElements = async () => {
    const { data, error } = await supabase
      .from('facade_element')
      .select('*')
      .order('name');

    if (!error && data) {
      setFacadeElements(data);
    }
  };

  // Fetch statuses
  const fetchStatuses = async () => {
    const { data, error } = await supabase
      .from('status')
      .select('*')
      .order('name');

    if (!error && data) {
      setStatuses(data);
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

  useEffect(() => {
    if (showWorksModal) {
      fetchUnits();
      fetchWorks();
    }
  }, [showWorksModal]);

  useEffect(() => {
    if (showFacadeElementsModal) {
      fetchFacadeElements();
    }
  }, [showFacadeElementsModal]);

  useEffect(() => {
    if (showStatusModal) {
      fetchStatuses();
    }
  }, [showStatusModal]);

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

  // Works handlers
  const handleAddWork = async (e) => {
    e.preventDefault();
    if (!newWork.name.trim()) return;

    setLoadingWorks(true);
    const { error } = await supabase
      .from('work_types')
      .insert({
        name: newWork.name.trim(),
        unit_id: newWork.unit_id || null
      });

    if (!error) {
      setNewWork({ name: '', unit_id: '' });
      fetchWorks();
    }
    setLoadingWorks(false);
  };

  const handleUpdateWork = async (e) => {
    e.preventDefault();
    if (!editingWork || !editingWork.name.trim()) return;

    setLoadingWorks(true);
    const { error } = await supabase
      .from('work_types')
      .update({
        name: editingWork.name.trim(),
        unit_id: editingWork.unit_id || null
      })
      .eq('id', editingWork.id);

    if (!error) {
      setEditingWork(null);
      fetchWorks();
    }
    setLoadingWorks(false);
  };

  const handleDeleteWork = async (id) => {
    if (!confirm('Удалить этот вид работ?')) return;

    const { error } = await supabase
      .from('work_types')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchWorks();
    }
  };

  // Facade elements handlers
  const handleAddFacadeElement = async (e) => {
    e.preventDefault();
    if (!newFacadeElement.trim()) return;

    setLoadingFacadeElements(true);
    const { error } = await supabase
      .from('facade_element')
      .insert({ name: newFacadeElement.trim() });

    if (!error) {
      setNewFacadeElement('');
      fetchFacadeElements();
    }
    setLoadingFacadeElements(false);
  };

  const handleUpdateFacadeElement = async (e) => {
    e.preventDefault();
    if (!editingFacadeElement || !editingFacadeElement.name.trim()) return;

    setLoadingFacadeElements(true);
    const { error } = await supabase
      .from('facade_element')
      .update({ name: editingFacadeElement.name.trim() })
      .eq('id', editingFacadeElement.id);

    if (!error) {
      setEditingFacadeElement(null);
      fetchFacadeElements();
    }
    setLoadingFacadeElements(false);
  };

  const handleDeleteFacadeElement = async (id) => {
    if (!confirm('Удалить этот элемент фасада?')) return;

    const { error } = await supabase
      .from('facade_element')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchFacadeElements();
    }
  };

  // Status handlers
  const handleAddStatus = async (e) => {
    e.preventDefault();
    if (!newStatus.trim()) return;

    setLoadingStatus(true);
    const { error } = await supabase
      .from('status')
      .insert({ name: newStatus.trim() });

    if (!error) {
      setNewStatus('');
      fetchStatuses();
    }
    setLoadingStatus(false);
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!editingStatus || !editingStatus.name.trim()) return;

    setLoadingStatus(true);
    const { error } = await supabase
      .from('status')
      .update({ name: editingStatus.name.trim() })
      .eq('id', editingStatus.id);

    if (!error) {
      setEditingStatus(null);
      fetchStatuses();
    }
    setLoadingStatus(false);
  };

  const handleDeleteStatus = async (id) => {
    if (!confirm('Удалить этот статус?')) return;

    const { error } = await supabase
      .from('status')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchStatuses();
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

          <div className="admin-card" onClick={() => setShowWorksModal(true)}>
            <div className="admin-card-icon">
              <span>🔧</span>
            </div>
            <h3 className="admin-card-title">Виды работ</h3>
            <p className="admin-card-description">Управление справочником видов работ</p>
          </div>

          <div className="admin-card" onClick={() => setShowFacadeElementsModal(true)}>
            <div className="admin-card-icon">
              <span>🏗️</span>
            </div>
            <h3 className="admin-card-title">Элементы фасада</h3>
            <p className="admin-card-description">Управление элементами фасада для чек-листа</p>
          </div>

          <div className="admin-card" onClick={() => setShowStatusModal(true)}>
            <div className="admin-card-icon">
              <span>📋</span>
            </div>
            <h3 className="admin-card-title">Статусы</h3>
            <p className="admin-card-description">Управление статусами для чек-листа</p>
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

      {/* Works Modal */}
      {showWorksModal && (
        <div className="admin-modal-overlay" onClick={() => setShowWorksModal(false)}>
          <div className="admin-modal admin-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Виды работ</h2>
              <button
                className="admin-modal-close"
                onClick={() => setShowWorksModal(false)}
              >
                &times;
              </button>
            </div>

            <form className="admin-form admin-form-work" onSubmit={editingWork ? handleUpdateWork : handleAddWork}>
              <input
                type="text"
                className="admin-input admin-input-wide"
                placeholder="Название вида работ..."
                value={editingWork ? editingWork.name : newWork.name}
                onChange={(e) => editingWork
                  ? setEditingWork({ ...editingWork, name: e.target.value })
                  : setNewWork({ ...newWork, name: e.target.value })
                }
              />
              <select
                className="admin-select"
                value={editingWork ? (editingWork.unit_id || '') : newWork.unit_id}
                onChange={(e) => editingWork
                  ? setEditingWork({ ...editingWork, unit_id: e.target.value })
                  : setNewWork({ ...newWork, unit_id: e.target.value })
                }
              >
                <option value="">Без ед. изм.</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
              <button
                type="submit"
                className="admin-add-btn"
                disabled={loadingWorks || !(editingWork ? editingWork.name.trim() : newWork.name.trim())}
              >
                {editingWork ? 'Сохранить' : 'Добавить'}
              </button>
              {editingWork && (
                <button
                  type="button"
                  className="admin-cancel-btn"
                  onClick={() => setEditingWork(null)}
                >
                  Отмена
                </button>
              )}
            </form>

            <div className="admin-list">
              {works.length === 0 ? (
                <p className="admin-list-empty">Нет видов работ</p>
              ) : (
                works.map((work) => (
                  <div key={work.id} className={`admin-list-item ${editingWork?.id === work.id ? 'editing' : ''}`}>
                    <div className="admin-list-item-info">
                      <span className="admin-list-item-name">{work.name}</span>
                      <span className="admin-list-item-unit">{work.unit?.name || '—'}</span>
                    </div>
                    <div className="admin-list-item-actions">
                      <button
                        className="admin-list-item-edit"
                        onClick={() => setEditingWork({ id: work.id, name: work.name, unit_id: work.unit_id || '' })}
                        title="Редактировать"
                      >
                        &#9998;
                      </button>
                      <button
                        className="admin-list-item-delete"
                        onClick={() => handleDeleteWork(work.id)}
                        title="Удалить"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Facade Elements Modal */}
      {showFacadeElementsModal && (
        <div className="admin-modal-overlay" onClick={() => setShowFacadeElementsModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Элементы фасада</h2>
              <button
                className="admin-modal-close"
                onClick={() => setShowFacadeElementsModal(false)}
              >
                &times;
              </button>
            </div>

            <form className="admin-form" onSubmit={editingFacadeElement ? handleUpdateFacadeElement : handleAddFacadeElement}>
              <input
                type="text"
                className="admin-input"
                placeholder="Название элемента фасада..."
                value={editingFacadeElement ? editingFacadeElement.name : newFacadeElement}
                onChange={(e) => editingFacadeElement
                  ? setEditingFacadeElement({ ...editingFacadeElement, name: e.target.value })
                  : setNewFacadeElement(e.target.value)
                }
              />
              <button
                type="submit"
                className="admin-add-btn"
                disabled={loadingFacadeElements || !(editingFacadeElement ? editingFacadeElement.name.trim() : newFacadeElement.trim())}
              >
                {editingFacadeElement ? 'Сохранить' : 'Добавить'}
              </button>
              {editingFacadeElement && (
                <button
                  type="button"
                  className="admin-cancel-btn"
                  onClick={() => setEditingFacadeElement(null)}
                >
                  Отмена
                </button>
              )}
            </form>

            <div className="admin-list">
              {facadeElements.length === 0 ? (
                <p className="admin-list-empty">Нет элементов фасада</p>
              ) : (
                facadeElements.map((element) => (
                  <div key={element.id} className={`admin-list-item ${editingFacadeElement?.id === element.id ? 'editing' : ''}`}>
                    <span className="admin-list-item-name">{element.name}</span>
                    <div className="admin-list-item-actions">
                      <button
                        className="admin-list-item-edit"
                        onClick={() => setEditingFacadeElement({ id: element.id, name: element.name })}
                        title="Редактировать"
                      >
                        &#9998;
                      </button>
                      <button
                        className="admin-list-item-delete"
                        onClick={() => handleDeleteFacadeElement(element.id)}
                        title="Удалить"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {showStatusModal && (
        <div className="admin-modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Статусы</h2>
              <button
                className="admin-modal-close"
                onClick={() => setShowStatusModal(false)}
              >
                &times;
              </button>
            </div>

            <form className="admin-form" onSubmit={editingStatus ? handleUpdateStatus : handleAddStatus}>
              <input
                type="text"
                className="admin-input"
                placeholder="Название статуса..."
                value={editingStatus ? editingStatus.name : newStatus}
                onChange={(e) => editingStatus
                  ? setEditingStatus({ ...editingStatus, name: e.target.value })
                  : setNewStatus(e.target.value)
                }
              />
              <button
                type="submit"
                className="admin-add-btn"
                disabled={loadingStatus || !(editingStatus ? editingStatus.name.trim() : newStatus.trim())}
              >
                {editingStatus ? 'Сохранить' : 'Добавить'}
              </button>
              {editingStatus && (
                <button
                  type="button"
                  className="admin-cancel-btn"
                  onClick={() => setEditingStatus(null)}
                >
                  Отмена
                </button>
              )}
            </form>

            <div className="admin-list">
              {statuses.length === 0 ? (
                <p className="admin-list-empty">Нет статусов</p>
              ) : (
                statuses.map((status) => (
                  <div key={status.id} className={`admin-list-item ${editingStatus?.id === status.id ? 'editing' : ''}`}>
                    <span className="admin-list-item-name">{status.name}</span>
                    <div className="admin-list-item-actions">
                      <button
                        className="admin-list-item-edit"
                        onClick={() => setEditingStatus({ id: status.id, name: status.name })}
                        title="Редактировать"
                      >
                        &#9998;
                      </button>
                      <button
                        className="admin-list-item-delete"
                        onClick={() => handleDeleteStatus(status.id)}
                        title="Удалить"
                      >
                        &times;
                      </button>
                    </div>
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
