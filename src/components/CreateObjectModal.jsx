import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createObject } from '../api/objects';
import { uploadObjectImage } from '../api/storage';
import { fetchAllObjectStatuses } from '../api/objectStatus';
import './CreateObjectModal.css';

function CreateObjectModal({ isOpen, onClose, onSuccess }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    developer: '',
    status_id: ''
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [objectStatuses, setObjectStatuses] = useState([]);

  useEffect(() => {
    async function loadStatuses() {
      try {
        const statuses = await fetchAllObjectStatuses();
        setObjectStatuses(statuses);
        // Устанавливаем первый статус по умолчанию
        if (statuses.length > 0 && !formData.status_id) {
          setFormData(prev => ({ ...prev, status_id: statuses[0].id }));
        }
      } catch (err) {
        console.error('Ошибка загрузки статусов:', err);
      }
    }

    if (isOpen) {
      loadStatuses();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let imageUrl = null;

      if (imageFile) {
        imageUrl = await uploadObjectImage(imageFile);
      }

      const data = await createObject({
        name: formData.name,
        address: formData.address,
        developer: formData.developer,
        image_url: imageUrl,
        status_id: formData.status_id
      });

      onSuccess?.();
      onClose();
      navigate(`/objects/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">Новый объект</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">Название объекта</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="form-input"
              placeholder="ЖК Пример"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Адрес</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              className="form-input"
              placeholder="г. Москва, ул. Примерная, д. 1"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Застройщик</label>
            <input
              type="text"
              name="developer"
              value={formData.developer}
              onChange={handleInputChange}
              className="form-input"
              placeholder="Название компании"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Статус объекта</label>
            <select
              name="status_id"
              value={formData.status_id}
              onChange={handleInputChange}
              className="form-input"
              required
            >
              <option value="">Выберите статус</option>
              {objectStatuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Изображение</label>
            <div className="image-upload">
              {imagePreview ? (
                <div className="image-preview">
                  <img src={imagePreview} alt="Preview" />
                  <button
                    type="button"
                    className="remove-image"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                  >
                    Удалить
                  </button>
                </div>
              ) : (
                <label className="upload-area">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="file-input"
                  />
                  <span className="upload-text">
                    Нажмите для загрузки изображения
                  </span>
                </label>
              )}
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Создание...' : 'Создать объект'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateObjectModal;
