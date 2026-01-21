import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchObjectName } from '../api/objects';
import {
  fetchCalculationItems,
  fetchCostTypes,
  createCalculationItem,
  updateCalculationItem,
  deleteCalculationItem,
  uploadCalculationImage
} from '../api/calculations';
import './CalculationPage.css';

function CalculationPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [items, setItems] = useState([]);
  const [costTypes, setCostTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRefs = useRef({});

  const [newItem, setNewItem] = useState({
    svor_code: '',
    cost_type_id: '',
    note: ''
  });
  const [newItemImage, setNewItemImage] = useState(null);
  const [newItemImagePreview, setNewItemImagePreview] = useState(null);
  const newItemFileRef = useRef(null);

  const [viewingImage, setViewingImage] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageDrag, setImageDrag] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const updateTimersRef = useRef({});

  useEffect(() => {
    async function loadData() {
      try {
        const [objectData, itemsData, costTypesData] = await Promise.all([
          fetchObjectName(id),
          fetchCalculationItems(id),
          fetchCostTypes()
        ]);
        setObject(objectData);
        setItems(itemsData);
        setCostTypes(costTypesData);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handleAddItem = async () => {
    if (!newItem.cost_type_id && !newItem.note && !newItem.svor_code && !newItemImage) return;

    setSaving(true);
    try {
      let imageUrl = null;

      if (newItemImage) {
        imageUrl = await uploadCalculationImage(newItemImage, 'new');
      }

      const data = await createCalculationItem({
        object_id: id,
        svor_code: newItem.svor_code || null,
        cost_type_id: newItem.cost_type_id ? parseInt(newItem.cost_type_id) : null,
        note: newItem.note || null,
        image_url: imageUrl
      });

      setItems([...items, data]);
      setNewItem({ svor_code: '', cost_type_id: '', note: '' });
      setNewItemImage(null);
      setNewItemImagePreview(null);
    } catch (error) {
      alert('Ошибка сохранения: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    const confirmed = window.confirm('Вы уверены, что хотите удалить эту запись?');
    if (!confirmed) return;

    try {
      await deleteCalculationItem(itemId);
      setItems(items.filter(item => item.id !== itemId));
    } catch (error) {
      alert('Ошибка удаления: ' + error.message);
    }
  };

  const handleUpdateItem = async (itemId, field, value) => {
    // Сначала обновляем локальное состояние для мгновенного отклика
    setItems(items.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    ));

    // Создаем ключ для таймера на основе itemId и field
    const timerKey = `${itemId}-${field}`;

    // Отменяем предыдущий таймер, если он существует
    if (updateTimersRef.current[timerKey]) {
      clearTimeout(updateTimersRef.current[timerKey]);
    }

    // Создаем новый таймер для дебаунса (500мс после последнего изменения)
    updateTimersRef.current[timerKey] = setTimeout(async () => {
      try {
        await updateCalculationItem(itemId, field, value);
      } catch (error) {
        alert('Ошибка сохранения: ' + error.message);
        // При ошибке перезагружаем данные
        const itemsData = await fetchCalculationItems(id);
        setItems(itemsData);
      } finally {
        delete updateTimersRef.current[timerKey];
      }
    }, 500);
  };

  const handleImageUpload = async (itemId, file) => {
    if (!file) return;

    setUploadingId(itemId);
    try {
      const imageUrl = await uploadCalculationImage(file, itemId);
      await updateCalculationItem(itemId, 'image_url', imageUrl);
      setItems(items.map(item =>
        item.id === itemId ? { ...item, image_url: imageUrl } : item
      ));
    } catch (error) {
      alert('Ошибка загрузки: ' + error.message);
    } finally {
      setUploadingId(null);
    }
  };

  const openImage = (url) => {
    setViewingImage(url);
    setImageZoom(1);
    setImageDrag({ x: 0, y: 0 });
  };

  const closeImageModal = () => {
    setViewingImage(null);
    setImageZoom(1);
    setImageDrag({ x: 0, y: 0 });
  };

  const handleZoom = (delta) => {
    setImageZoom(prev => {
      const newZoom = prev + delta;
      if (newZoom < 1) return 1;
      if (newZoom > 5) return 5;
      return newZoom;
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    handleZoom(delta);
  };

  const handleMouseDown = (e) => {
    if (imageZoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - imageDrag.x, y: e.clientY - imageDrag.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setImageDrag({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleNewItemImageSelect = (file) => {
    if (!file) return;
    setNewItemImage(file);
    setNewItemImagePreview(URL.createObjectURL(file));
  };

  const handleTextareaAutoResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  // Автоматически изменяем высоту всех textarea при загрузке данных
  useEffect(() => {
    const textareas = document.querySelectorAll('.table-textarea-note');
    textareas.forEach(textarea => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
  }, [items]);

  if (loading) {
    return (
      <main className="calculation-page">
        <div className="calculation-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="calculation-page">
      <div className="calculation-container">
        <div className="calculation-header">
          <Link to={`/objects/${id}`} className="back-btn">
            ← Назад к объекту
          </Link>
          <div className="calculation-breadcrumb">
            <span className="breadcrumb-object">{object?.name}</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Нюансы расчёта</span>
          </div>
        </div>

        <h1 className="calculation-title">Нюансы расчёта</h1>

        <div className="calculation-content">
          <div className="table-wrapper">
            <table className="calculation-table">
              <thead>
                <tr>
                  <th className="col-date">Дата</th>
                  <th className="col-code">Код СВОР</th>
                  <th className="col-work">Вид затрат</th>
                  <th className="col-note">Примечание</th>
                  <th className="col-image">Изображение</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                <tr className="new-row">
                  <td className="td-date"></td>
                  <td className="td-code">
                    <textarea
                      value={newItem.svor_code}
                      onChange={(e) => setNewItem({ ...newItem, svor_code: e.target.value })}
                      className="table-textarea table-textarea-code"
                      placeholder="Код"
                      rows={1}
                    />
                  </td>
                  <td className="td-work">
                    <select
                      value={newItem.cost_type_id}
                      onChange={(e) => setNewItem({ ...newItem, cost_type_id: e.target.value })}
                      className="table-select"
                    >
                      <option value="">Выберите вид затрат</option>
                      {costTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td-note">
                    <textarea
                      value={newItem.note}
                      onChange={(e) => {
                        setNewItem({ ...newItem, note: e.target.value });
                        handleTextareaAutoResize(e);
                      }}
                      onInput={handleTextareaAutoResize}
                      className="table-textarea table-textarea-note"
                      placeholder="Примечание"
                      rows={1}
                    />
                  </td>
                  <td className="td-image">
                    <input
                      type="file"
                      accept="image/*"
                      ref={newItemFileRef}
                      style={{ display: 'none' }}
                      onChange={(e) => handleNewItemImageSelect(e.target.files[0])}
                    />
                    <div className="image-buttons">
                      <button
                        className="view-image-btn"
                        onClick={() => newItemImagePreview && openImage(newItemImagePreview)}
                        title={newItemImagePreview ? "Просмотреть" : "Нет изображения"}
                        disabled={!newItemImagePreview}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>
                      <button
                        className="upload-image-btn"
                        onClick={() => newItemFileRef.current?.click()}
                        title={newItemImagePreview ? "Заменить изображение" : "Добавить изображение"}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="17 8 12 3 7 8"></polyline>
                          <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td className="td-actions">
                    <button
                      className="save-btn"
                      onClick={handleAddItem}
                      disabled={(!newItem.cost_type_id && !newItem.note && !newItem.svor_code && !newItemImage) || saving}
                    >
                      {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </td>
                </tr>
                {items.map(item => (
                  <tr key={item.id}>
                    <td className="td-date">
                      {new Date(item.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="td-code">
                      <textarea
                        value={item.svor_code || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'svor_code', e.target.value)}
                        className="table-textarea table-textarea-code"
                        placeholder="—"
                        rows={1}
                      />
                    </td>
                    <td className="td-work">
                      <select
                        value={item.cost_type_id || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'cost_type_id', e.target.value ? parseInt(e.target.value) : null)}
                        className="table-select"
                      >
                        <option value="">—</option>
                        {costTypes.map(type => (
                          <option key={type.id} value={type.id}>{type.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td-note">
                      <textarea
                        value={item.note || ''}
                        onChange={(e) => {
                          handleUpdateItem(item.id, 'note', e.target.value);
                          handleTextareaAutoResize(e);
                        }}
                        onInput={handleTextareaAutoResize}
                        className="table-textarea table-textarea-note"
                        placeholder="Введите примечание"
                        rows={1}
                      />
                    </td>
                    <td className="td-image">
                      <input
                        type="file"
                        accept="image/*"
                        ref={el => fileInputRefs.current[item.id] = el}
                        style={{ display: 'none' }}
                        onChange={(e) => handleImageUpload(item.id, e.target.files[0])}
                      />
                      <div className="image-buttons">
                        <button
                          className="view-image-btn"
                          onClick={() => item.image_url && openImage(item.image_url)}
                          title={item.image_url ? "Открыть изображение" : "Нет изображения"}
                          disabled={!item.image_url}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>
                        <button
                          className="upload-image-btn"
                          onClick={() => fileInputRefs.current[item.id]?.click()}
                          disabled={uploadingId === item.id}
                          title={item.image_url ? "Заменить изображение" : "Загрузить изображение"}
                        >
                          {uploadingId === item.id ? (
                            <span className="uploading-spinner"></span>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                              <polyline points="17 8 12 3 7 8"></polyline>
                              <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="td-actions">
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteItem(item.id)}
                        title="Удалить"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {items.length === 0 && (
            <p className="empty-text">
              Нет записей. Добавьте первую запись, выбрав вид затрат.
            </p>
          )}
        </div>
      </div>

      {viewingImage && (
        <div className="image-modal-overlay" onClick={closeImageModal}>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <div className="image-modal-header">
              <div className="zoom-controls">
                <button
                  className="zoom-btn"
                  onClick={() => handleZoom(-0.25)}
                  title="Уменьшить"
                >
                  −
                </button>
                <span className="zoom-level">{Math.round(imageZoom * 100)}%</span>
                <button
                  className="zoom-btn"
                  onClick={() => handleZoom(0.25)}
                  title="Увеличить"
                >
                  +
                </button>
              </div>
              <button className="close-modal-btn" onClick={closeImageModal}>
                ×
              </button>
            </div>
            <div
              className="image-modal-body"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img
                src={viewingImage}
                alt="Просмотр"
                className="modal-image"
                style={{
                  transform: `scale(${imageZoom}) translate(${imageDrag.x / imageZoom}px, ${imageDrag.y / imageZoom}px)`,
                  cursor: imageZoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default CalculationPage;
