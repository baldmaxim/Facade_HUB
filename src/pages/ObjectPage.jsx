import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './ObjectPage.css';

function ObjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [object, setObject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    developer: '',
    image: null
  });
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    async function fetchObject() {
      const { data, error } = await supabase
        .from('objects')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setObject(data);
      }
      setLoading(false);
    }

    fetchObject();
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Удаляем связанные данные
      await supabase.from('checklist_items').delete().eq('object_id', id);
      await supabase.from('object_info').delete().eq('object_id', id);
      await supabase.from('calculations').delete().eq('object_id', id);

      // Удаляем сам объект
      const { error } = await supabase.from('objects').delete().eq('id', id);

      if (error) throw error;

      navigate('/objects');
    } catch (err) {
      console.error('Ошибка удаления:', err);
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const openEditModal = () => {
    setEditForm({
      name: object.name,
      address: object.address,
      developer: object.developer,
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

      // Обновляем объект
      const { data, error } = await supabase
        .from('objects')
        .update({
          name: editForm.name,
          address: editForm.address,
          developer: editForm.developer,
          image_url: imageUrl
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

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
          </div>

          <div className="profile-tabs">
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
              <span>Информация об объекте</span>
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
          </div>

          <div className="profile-actions">
            <Link to="/objects" className="action-btn secondary">
              Назад к объектам
            </Link>
          </div>

          <div className="danger-zone">
            <button
              className="delete-btn"
              onClick={() => setShowDeleteModal(true)}
            >
              удалить объект
            </button>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div className="delete-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="delete-modal" onClick={e => e.stopPropagation()}>
            <div className="delete-modal-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3 className="delete-modal-title">Удалить объект?</h3>
            <p className="delete-modal-text">
              Объект «{object.name}» и все связанные данные (чеклист, информация, расчёты) будут удалены безвозвратно.
            </p>
            <div className="delete-modal-actions">
              <button
                className="delete-modal-btn cancel"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Отмена
              </button>
              <button
                className="delete-modal-btn confirm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
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
