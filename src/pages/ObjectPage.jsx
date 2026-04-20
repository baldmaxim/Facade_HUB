import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchObjectById, updateObject } from '../api/objects';
import { fetchAllObjectStatuses } from '../api/objectStatus';
import { supabase } from '../lib/supabase';
import VorFillModal from '../components/VorFillModal';
import './ObjectPage.css';

function ObjectPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showVorFillModal, setShowVorFillModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    developer: '',
    status_id: '',
    image: null
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [objectStatuses, setObjectStatuses] = useState([]);

  useEffect(() => {
    async function loadObject() {
      try {
        const data = await fetchObjectById(id);
        setObject(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    async function loadStatuses() {
      try {
        const statuses = await fetchAllObjectStatuses();
        setObjectStatuses(statuses);
      } catch (err) {
        console.error('Ошибка загрузки статусов:', err);
      }
    }

    loadObject();
    loadStatuses();
  }, [id]);

  if (loading) {
    return (
      <main className="object-page">
        <div className="object-container">
          <p className="loading-text">Загрузка...</p>
        </div>
      </main>
    );
  }

  if (error || !object) {
    return (
      <main className="object-page">
        <div className="object-container">
          <p className="error-text">Объект не найден</p>
          <Link to="/objects" className="back-link">Вернуться к списку</Link>
        </div>
      </main>
    );
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const openEditModal = () => {
    setEditForm({
      name: object.name,
      address: object.address,
      developer: object.developer,
      status_id: object.status_id || '',
      image: null
    });
    setImagePreview(object.image_url);
    setShowEditModal(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setEditForm({ ...editForm, image: file });
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let imageUrl = object.image_url;

      // Загружаем новое изображение если выбрано
      if (editForm.image) {
        const fileExt = editForm.image.name.split('.').pop();
        const fileName = `${id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('object-images')
          .upload(fileName, editForm.image);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('object-images')
          .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
      }

      // Обновляем объект через API
      const data = await updateObject(id, {
        name: editForm.name,
        address: editForm.address,
        developer: editForm.developer,
        status_id: editForm.status_id
      });

      // Если изображение изменилось, обновляем его отдельно
      if (editForm.image && imageUrl !== object.image_url) {
        const { error } = await supabase
          .from('objects')
          .update({ image_url: imageUrl })
          .eq('id', id);

        if (error) throw error;
        data.image_url = imageUrl;
      }

      setObject(data);
      setShowEditModal(false);
    } catch (err) {
      console.error('Ошибка сохранения:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="object-page">
      <div className="object-profile">
        <div className="profile-cover">
          {object.image_url ? (
            <img src={object.image_url} alt={object.name} className="cover-image" />
          ) : (
            <div className="cover-placeholder">
              <span>Нет изображения</span>
            </div>
          )}
        </div>

        <div className="profile-content">
          <div className="profile-header">
            <div className="profile-name-row">
              <h1 className="profile-name">{object.name}</h1>
              <button className="edit-btn" onClick={openEditModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            </div>
            <p className="profile-meta">
              Добавлен {formatDate(object.created_at)}
            </p>
          </div>

          <div className="profile-section">
            <h2 className="section-title">Информация об объекте</h2>
            <div className="profile-details">
              <div className="detail-card">
                <div className="detail-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </div>
                <div className="detail-content">
                  <span className="detail-label">Адрес</span>
                  <span className="detail-value">{object.address}</span>
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                </div>
                <div className="detail-content">
                  <span className="detail-label">Застройщик</span>
                  <span className="detail-value">{object.developer}</span>
                </div>
              </div>

              {object.object_status && (
                <div className="detail-card">
                  <div className="detail-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <div className="detail-content">
                    <span className="detail-label">Статус</span>
                    <span className="detail-value">{object.object_status.name}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="profile-section">
            <h2 className="section-title">Тендерный расчет</h2>
            <div className="profile-tabs">
              <Link to={`/objects/${id}/tasks`} className="tab-btn tab-btn-tasks tab-btn-full">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <span>Задачи</span>
              </Link>
              <button type="button" className="tab-btn tab-btn-tasks tab-btn-full" onClick={() => setShowVorFillModal(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>Заполнение ВОРа</span>
              </button>
              <Link to={`/objects/${id}/checklist`} className="tab-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <span>Чеклист</span>
              </Link>
              <Link to={`/objects/${id}/info`} className="tab-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <span>Затраты на строительство</span>
              </Link>
              <Link to={`/objects/${id}/calculation`} className="tab-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="2" width="16" height="20" rx="2"></rect>
                  <line x1="8" y1="6" x2="16" y2="6"></line>
                  <line x1="8" y1="10" x2="16" y2="10"></line>
                  <line x1="8" y1="14" x2="12" y2="14"></line>
                </svg>
                <span>Нюансы расчёта</span>
              </Link>
              <Link to={`/objects/${id}/work-prices`} className="tab-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <span>Цены работ на тендере</span>
              </Link>
            </div>
          </div>

          <div className="profile-section">
            <h2 className="section-title">Фактическая стоимость</h2>
            {object.object_status?.name === 'Объекты СУ-10' ? (
              <div className="profile-tabs">
                <Link to={`/objects/${id}/work-prices-fact`} className="tab-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                  <span>Фактическая цена работ</span>
                </Link>
              </div>
            ) : (
              <div className="empty-section">
                <p className="empty-section-text">Доступно только для объектов со статусом "Объекты СУ-10"</p>
              </div>
            )}
          </div>

          <div className="profile-actions">
            <Link to="/objects" className="action-btn secondary">
              Назад к объектам
            </Link>
          </div>
        </div>
      </div>

      {showVorFillModal && (
        <VorFillModal
          objectId={id}
          objectName={object?.name}
          onClose={() => setShowVorFillModal(false)}
        />
      )}

      {showEditModal && (
        <div className="edit-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="edit-modal" onClick={e => e.stopPropagation()}>
            <h3 className="edit-modal-title">Редактировать объект</h3>

            <div className="edit-form">
              <div className="edit-field">
                <label>Название</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>

              <div className="edit-field">
                <label>Адрес</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>

              <div className="edit-field">
                <label>Застройщик</label>
                <input
                  type="text"
                  value={editForm.developer}
                  onChange={e => setEditForm({ ...editForm, developer: e.target.value })}
                />
              </div>

              <div className="edit-field">
                <label>Статус объекта</label>
                <select
                  value={editForm.status_id}
                  onChange={e => setEditForm({ ...editForm, status_id: e.target.value })}
                >
                  <option value="">Без статуса</option>
                  {objectStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="edit-field">
                <label>Изображение</label>
                <div className="edit-image-upload">
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview" className="edit-image-preview" />
                  )}
                  <label className="edit-image-btn">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      hidden
                    />
                    {imagePreview ? 'Изменить' : 'Загрузить'}
                  </label>
                </div>
              </div>
            </div>

            <div className="edit-modal-actions">
              <button
                className="edit-modal-btn cancel"
                onClick={() => setShowEditModal(false)}
                disabled={saving}
              >
                Отмена
              </button>
              <button
                className="edit-modal-btn save"
                onClick={handleSave}
                disabled={saving || !editForm.name.trim()}
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default ObjectPage;
