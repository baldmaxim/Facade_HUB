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
  const [editingCostType, setEditingCostType] = useState(null);

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

  // Object status state
  const [showObjectStatusModal, setShowObjectStatusModal] = useState(false);
  const [objectStatuses, setObjectStatuses] = useState([]);
  const [newObjectStatus, setNewObjectStatus] = useState('');
  const [loadingObjectStatus, setLoadingObjectStatus] = useState(false);
  const [editingObjectStatus, setEditingObjectStatus] = useState(null);

  // Team members state
  const [showTeamMembersModal, setShowTeamMembersModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [newTeamMember, setNewTeamMember] = useState({ name: '', role: '', description: '', photo: null, sort_order: 0, color: '#3b82f6' });
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false);
  const [editingTeamMember, setEditingTeamMember] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // Task statuses state
  const [showTaskStatusesModal, setShowTaskStatusesModal] = useState(false);
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [newTaskStatus, setNewTaskStatus] = useState('');
  const [loadingTaskStatuses, setLoadingTaskStatuses] = useState(false);
  const [editingTaskStatus, setEditingTaskStatus] = useState(null);

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

  // Fetch object statuses
  const fetchObjectStatuses = async () => {
    const { data, error } = await supabase
      .from('object_status')
      .select('*')
      .order('created_at');

    if (!error && data) {
      setObjectStatuses(data);
    }
  };

  // Fetch team members
  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!error && data) {
      setTeamMembers(data);
    }
  };

  // Fetch task statuses
  const fetchTaskStatuses = async () => {
    const { data, error } = await supabase
      .from('task_statuses')
      .select('*')
      .order('created_at');

    if (!error && data) {
      setTaskStatuses(data);
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

  useEffect(() => {
    if (showObjectStatusModal) {
      fetchObjectStatuses();
    }
  }, [showObjectStatusModal]);

  useEffect(() => {
    if (showTeamMembersModal) {
      fetchTeamMembers();
    }
  }, [showTeamMembersModal]);

  useEffect(() => {
    if (showTaskStatusesModal) {
      fetchTaskStatuses();
    }
  }, [showTaskStatusesModal]);

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

  const handleEditCostType = (costType) => {
    setEditingCostType(costType);
  };

  const handleSaveCostType = async () => {
    if (!editingCostType?.name.trim()) return;

    const { error } = await supabase
      .from('cost_types')
      .update({ name: editingCostType.name.trim() })
      .eq('id', editingCostType.id);

    if (!error) {
      setEditingCostType(null);
      fetchCostTypes();
    }
  };

  const handleCancelEditCostType = () => {
    setEditingCostType(null);
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

  // Object Status handlers
  const handleAddObjectStatus = async (e) => {
    e.preventDefault();
    if (!newObjectStatus.trim()) return;

    setLoadingObjectStatus(true);
    const { error } = await supabase
      .from('object_status')
      .insert({ name: newObjectStatus.trim() });

    if (!error) {
      setNewObjectStatus('');
      fetchObjectStatuses();
    }
    setLoadingObjectStatus(false);
  };

  const handleUpdateObjectStatus = async (e) => {
    e.preventDefault();
    if (!editingObjectStatus || !editingObjectStatus.name.trim()) return;

    setLoadingObjectStatus(true);
    const { error } = await supabase
      .from('object_status')
      .update({ name: editingObjectStatus.name.trim() })
      .eq('id', editingObjectStatus.id);

    if (!error) {
      setEditingObjectStatus(null);
      fetchObjectStatuses();
    }
    setLoadingObjectStatus(false);
  };

  const handleDeleteObjectStatus = async (id) => {
    if (!confirm('Удалить этот статус объекта?')) return;

    const { error } = await supabase
      .from('object_status')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchObjectStatuses();
    }
  };

  // Team members handlers
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (editingTeamMember) {
        setEditingTeamMember({ ...editingTeamMember, photo: file });
      } else {
        setNewTeamMember({ ...newTeamMember, photo: file });
      }
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleAddTeamMember = async (e) => {
    e.preventDefault();
    if (!newTeamMember.name.trim() || !newTeamMember.role.trim()) return;

    setLoadingTeamMembers(true);
    try {
      let photoUrl = null;

      // Upload photo if selected
      if (newTeamMember.photo) {
        const fileExt = newTeamMember.photo.name.split('.').pop();
        const fileName = `team/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('object-images')
          .upload(fileName, newTeamMember.photo);

        if (uploadError) {
          console.error('Ошибка загрузки фото:', uploadError);
          alert('Ошибка загрузки фото: ' + uploadError.message);
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from('object-images')
          .getPublicUrl(fileName);

        photoUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('team_members')
        .insert({
          name: newTeamMember.name.trim(),
          role: newTeamMember.role.trim(),
          description: newTeamMember.description.trim() || null,
          photo_url: photoUrl,
          sort_order: parseInt(newTeamMember.sort_order) || 0,
          color: newTeamMember.color || '#3b82f6'
        });

      if (error) {
        console.error('Ошибка сохранения члена команды:', error);
        alert('Ошибка сохранения: ' + error.message);
        throw error;
      }

      setNewTeamMember({ name: '', role: '', description: '', photo: null, sort_order: 0, color: '#3b82f6' });
      setPhotoPreview(null);
      fetchTeamMembers();
    } catch (err) {
      console.error('Ошибка добавления члена команды:', err);
    } finally {
      setLoadingTeamMembers(false);
    }
  };

  const handleUpdateTeamMember = async (e) => {
    e.preventDefault();
    if (!editingTeamMember || !editingTeamMember.name.trim() || !editingTeamMember.role.trim()) return;

    setLoadingTeamMembers(true);
    try {
      let photoUrl = editingTeamMember.photo_url;

      // Upload new photo if selected
      if (editingTeamMember.photo) {
        const fileExt = editingTeamMember.photo.name.split('.').pop();
        const fileName = `team/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('object-images')
          .upload(fileName, editingTeamMember.photo);

        if (uploadError) {
          console.error('Ошибка загрузки фото:', uploadError);
          alert('Ошибка загрузки фото: ' + uploadError.message);
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from('object-images')
          .getPublicUrl(fileName);

        photoUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('team_members')
        .update({
          name: editingTeamMember.name.trim(),
          role: editingTeamMember.role.trim(),
          description: editingTeamMember.description.trim() || null,
          photo_url: photoUrl,
          sort_order: parseInt(editingTeamMember.sort_order) || 0,
          color: editingTeamMember.color || '#3b82f6'
        })
        .eq('id', editingTeamMember.id);

      if (error) {
        console.error('Ошибка сохранения члена команды:', error);
        alert('Ошибка сохранения: ' + error.message);
        throw error;
      }

      setEditingTeamMember(null);
      setPhotoPreview(null);
      fetchTeamMembers();
    } catch (err) {
      console.error('Ошибка обновления члена команды:', err);
    } finally {
      setLoadingTeamMembers(false);
    }
  };

  const handleDeleteTeamMember = async (id) => {
    if (!confirm('Удалить этого члена команды?')) return;

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchTeamMembers();
    }
  };

  const handleEditTeamMember = (member) => {
    setEditingTeamMember({ ...member, photo: null });
    setPhotoPreview(member.photo_url);
  };

  const handleCancelEditTeamMember = () => {
    setEditingTeamMember(null);
    setPhotoPreview(null);
  };

  // Task statuses handlers
  const handleAddTaskStatus = async (e) => {
    e.preventDefault();
    if (!newTaskStatus.trim()) return;

    setLoadingTaskStatuses(true);
    const { error } = await supabase
      .from('task_statuses')
      .insert({ status: newTaskStatus.trim() });

    if (!error) {
      setNewTaskStatus('');
      fetchTaskStatuses();
    }
    setLoadingTaskStatuses(false);
  };

  const handleUpdateTaskStatus = async (e) => {
    e.preventDefault();
    if (!editingTaskStatus || !editingTaskStatus.status.trim()) return;

    setLoadingTaskStatuses(true);
    const { error } = await supabase
      .from('task_statuses')
      .update({ status: editingTaskStatus.status.trim() })
      .eq('id', editingTaskStatus.id);

    if (!error) {
      setEditingTaskStatus(null);
      fetchTaskStatuses();
    }
    setLoadingTaskStatuses(false);
  };

  const handleDeleteTaskStatus = async (id) => {
    if (!confirm('Удалить этот статус задачи?')) return;

    const { error } = await supabase
      .from('task_statuses')
      .delete()
      .eq('id', id);

    if (!error) {
      fetchTaskStatuses();
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

          <div className="admin-card" onClick={() => setShowObjectStatusModal(true)}>
            <div className="admin-card-icon">
              <span>🏢</span>
            </div>
            <h3 className="admin-card-title">Статусы объектов</h3>
            <p className="admin-card-description">Управление статусами объектов (Тендер, СУ-10, Проиграли)</p>
          </div>

          <div className="admin-card" onClick={() => setShowTeamMembersModal(true)}>
            <div className="admin-card-icon">
              <span>👥</span>
            </div>
            <h3 className="admin-card-title">Члены команды</h3>
            <p className="admin-card-description">Управление членами команды для назначения на задачи</p>
          </div>

          <div className="admin-card" onClick={() => setShowTaskStatusesModal(true)}>
            <div className="admin-card-icon">
              <span>📋</span>
            </div>
            <h3 className="admin-card-title">Статусы задач</h3>
            <p className="admin-card-description">Управление статусами задач (Не начата, В процессе, Завершена)</p>
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
                    {editingCostType?.id === costType.id ? (
                      <>
                        <input
                          type="text"
                          className="admin-edit-input"
                          value={editingCostType.name}
                          onChange={(e) => setEditingCostType({ ...editingCostType, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCostType();
                            if (e.key === 'Escape') handleCancelEditCostType();
                          }}
                          autoFocus
                        />
                        <button
                          className="admin-list-item-save"
                          onClick={handleSaveCostType}
                          title="Сохранить"
                        >
                          ✓
                        </button>
                        <button
                          className="admin-list-item-cancel"
                          onClick={handleCancelEditCostType}
                          title="Отмена"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className="admin-list-item-name"
                          onDoubleClick={() => handleEditCostType(costType)}
                          style={{ cursor: 'pointer' }}
                          title="Двойной клик для редактирования"
                        >
                          {costType.name}
                        </span>
                        <div className="admin-list-item-actions">
                          <button
                            className="admin-list-item-edit"
                            onClick={() => handleEditCostType(costType)}
                            title="Редактировать"
                          >
                            ✎
                          </button>
                          <button
                            className="admin-list-item-delete"
                            onClick={() => handleDeleteCostType(costType.id)}
                            title="Удалить"
                          >
                            &times;
                          </button>
                        </div>
                      </>
                    )}
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

      {/* Object Status Modal */}
      {showObjectStatusModal && (
        <div className="admin-modal-overlay" onClick={() => setShowObjectStatusModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Статусы объектов</h2>
              <button
                className="admin-modal-close"
                onClick={() => setShowObjectStatusModal(false)}
              >
                &times;
              </button>
            </div>

            <form className="admin-form" onSubmit={editingObjectStatus ? handleUpdateObjectStatus : handleAddObjectStatus}>
              <input
                type="text"
                className="admin-input"
                placeholder="Название статуса (например: Тендер, Объекты СУ-10, Проиграли)..."
                value={editingObjectStatus ? editingObjectStatus.name : newObjectStatus}
                onChange={(e) => editingObjectStatus
                  ? setEditingObjectStatus({ ...editingObjectStatus, name: e.target.value })
                  : setNewObjectStatus(e.target.value)
                }
              />
              <button
                type="submit"
                className="admin-add-btn"
                disabled={loadingObjectStatus || !(editingObjectStatus ? editingObjectStatus.name.trim() : newObjectStatus.trim())}
              >
                {editingObjectStatus ? 'Сохранить' : 'Добавить'}
              </button>
              {editingObjectStatus && (
                <button
                  type="button"
                  className="admin-cancel-btn"
                  onClick={() => setEditingObjectStatus(null)}
                >
                  Отмена
                </button>
              )}
            </form>

            <div className="admin-list">
              {objectStatuses.length === 0 ? (
                <p className="admin-list-empty">Нет статусов объектов</p>
              ) : (
                objectStatuses.map((status) => (
                  <div key={status.id} className={`admin-list-item ${editingObjectStatus?.id === status.id ? 'editing' : ''}`}>
                    <span className="admin-list-item-name">{status.name}</span>
                    <div className="admin-list-item-actions">
                      <button
                        className="admin-list-item-edit"
                        onClick={() => setEditingObjectStatus({ id: status.id, name: status.name })}
                        title="Редактировать"
                      >
                        &#9998;
                      </button>
                      <button
                        className="admin-list-item-delete"
                        onClick={() => handleDeleteObjectStatus(status.id)}
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

      {/* Team Members Modal */}
      {showTeamMembersModal && (
        <div className="admin-modal-overlay" onClick={() => setShowTeamMembersModal(false)}>
          <div className="admin-modal admin-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Члены команды</h2>
              <button
                className="admin-modal-close"
                onClick={() => {
                  setShowTeamMembersModal(false);
                  setEditingTeamMember(null);
                  setPhotoPreview(null);
                }}
              >
                &times;
              </button>
            </div>

            <form className="admin-form admin-form-team" onSubmit={editingTeamMember ? handleUpdateTeamMember : handleAddTeamMember}>
              <div className="team-photo-upload">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="team-photo-preview" />
                ) : (
                  <div className="team-photo-placeholder">
                    <span>📷</span>
                  </div>
                )}
                <label className="team-photo-btn">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    hidden
                  />
                  {photoPreview ? 'Изменить фото' : 'Загрузить фото'}
                </label>
              </div>

              <div className="team-form-fields">
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Имя..."
                  value={editingTeamMember ? editingTeamMember.name : newTeamMember.name}
                  onChange={(e) => editingTeamMember
                    ? setEditingTeamMember({ ...editingTeamMember, name: e.target.value })
                    : setNewTeamMember({ ...newTeamMember, name: e.target.value })
                  }
                  required
                />
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Должность..."
                  value={editingTeamMember ? editingTeamMember.role : newTeamMember.role}
                  onChange={(e) => editingTeamMember
                    ? setEditingTeamMember({ ...editingTeamMember, role: e.target.value })
                    : setNewTeamMember({ ...newTeamMember, role: e.target.value })
                  }
                  required
                />
                <div className="form-row">
                  <input
                    type="number"
                    className="admin-input admin-input-short"
                    placeholder="Порядок..."
                    value={editingTeamMember ? editingTeamMember.sort_order : newTeamMember.sort_order}
                    onChange={(e) => editingTeamMember
                      ? setEditingTeamMember({ ...editingTeamMember, sort_order: e.target.value })
                      : setNewTeamMember({ ...newTeamMember, sort_order: e.target.value })
                    }
                  />
                  <div className="color-picker-wrapper">
                    <label className="color-picker-label">Цвет</label>
                    <input
                      type="color"
                      className="color-picker"
                      value={editingTeamMember ? (editingTeamMember.color || '#3b82f6') : newTeamMember.color}
                      onChange={(e) => editingTeamMember
                        ? setEditingTeamMember({ ...editingTeamMember, color: e.target.value })
                        : setNewTeamMember({ ...newTeamMember, color: e.target.value })
                      }
                    />
                  </div>
                </div>
                <textarea
                  className="admin-textarea"
                  placeholder="Описание..."
                  rows="3"
                  value={editingTeamMember ? editingTeamMember.description : newTeamMember.description}
                  onChange={(e) => editingTeamMember
                    ? setEditingTeamMember({ ...editingTeamMember, description: e.target.value })
                    : setNewTeamMember({ ...newTeamMember, description: e.target.value })
                  }
                />
              </div>

              <div className="team-form-buttons">
                <button
                  type="submit"
                  className="admin-add-btn"
                  disabled={loadingTeamMembers || (editingTeamMember
                    ? (!editingTeamMember.name.trim() || !editingTeamMember.role.trim())
                    : (!newTeamMember.name.trim() || !newTeamMember.role.trim())
                  )}
                >
                  {editingTeamMember ? 'Сохранить' : 'Добавить'}
                </button>
                {editingTeamMember && (
                  <button
                    type="button"
                    className="admin-cancel-btn"
                    onClick={handleCancelEditTeamMember}
                  >
                    Отмена
                  </button>
                )}
              </div>
            </form>

            <div className="admin-list">
              {teamMembers.length === 0 ? (
                <p className="admin-list-empty">Нет членов команды</p>
              ) : (
                teamMembers.map((member) => (
                  <div key={member.id} className={`admin-list-item team-member-item ${editingTeamMember?.id === member.id ? 'editing' : ''}`}>
                    <div className="team-member-info">
                      {member.photo_url && (
                        <img src={member.photo_url} alt={member.name} className="team-member-avatar" />
                      )}
                      <div className="team-member-details">
                        <div className="team-member-name">{member.name}</div>
                        <div className="team-member-role">{member.role}</div>
                        {member.description && (
                          <div className="team-member-description">{member.description}</div>
                        )}
                      </div>
                      <div className="team-member-order">#{member.sort_order}</div>
                    </div>
                    <div className="admin-list-item-actions">
                      <button
                        className="admin-list-item-edit"
                        onClick={() => handleEditTeamMember(member)}
                        title="Редактировать"
                      >
                        &#9998;
                      </button>
                      <button
                        className="admin-list-item-delete"
                        onClick={() => handleDeleteTeamMember(member.id)}
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

      {/* Task Statuses Modal */}
      {showTaskStatusesModal && (
        <div className="admin-modal-overlay" onClick={() => setShowTaskStatusesModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">Статусы задач</h2>
              <button
                className="admin-modal-close"
                onClick={() => {
                  setShowTaskStatusesModal(false);
                  setEditingTaskStatus(null);
                }}
              >
                &times;
              </button>
            </div>

            <form className="admin-form" onSubmit={editingTaskStatus ? handleUpdateTaskStatus : handleAddTaskStatus}>
              <input
                type="text"
                className="admin-input"
                placeholder="Название статуса..."
                value={editingTaskStatus ? editingTaskStatus.status : newTaskStatus}
                onChange={(e) => editingTaskStatus
                  ? setEditingTaskStatus({ ...editingTaskStatus, status: e.target.value })
                  : setNewTaskStatus(e.target.value)
                }
                required
              />
              <div className="admin-form-buttons">
                <button
                  type="submit"
                  className="admin-add-btn"
                  disabled={loadingTaskStatuses || (editingTaskStatus ? !editingTaskStatus.status.trim() : !newTaskStatus.trim())}
                >
                  {editingTaskStatus ? 'Сохранить' : 'Добавить'}
                </button>
                {editingTaskStatus && (
                  <button
                    type="button"
                    className="admin-cancel-btn"
                    onClick={() => setEditingTaskStatus(null)}
                  >
                    Отмена
                  </button>
                )}
              </div>
            </form>

            <div className="admin-list">
              {taskStatuses.length === 0 ? (
                <p className="admin-list-empty">Нет статусов задач</p>
              ) : (
                taskStatuses.map((status) => (
                  <div key={status.id} className={`admin-list-item ${editingTaskStatus?.id === status.id ? 'editing' : ''}`}>
                    <span>{status.status}</span>
                    <div className="admin-list-item-actions">
                      <button
                        className="admin-list-item-edit"
                        onClick={() => setEditingTaskStatus(status)}
                        title="Редактировать"
                      >
                        &#9998;
                      </button>
                      <button
                        className="admin-list-item-delete"
                        onClick={() => handleDeleteTaskStatus(status.id)}
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
