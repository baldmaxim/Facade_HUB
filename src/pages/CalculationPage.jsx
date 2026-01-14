import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './CalculationPage.css';

const WORK_TYPES = [
  '11.01. Устройство мокрого фасада',
  '11.02. Облицовка НВФ',
  '11.03. Подсистема НВФ + утеплитель',
  '11.04. Светопрозрачные конструкции',
  '11.05. Фурнитура',
  '11.06. Профиль алюминиевый',
  '11.07. Профиль ПВХ',
  '11.08. Тамбура (1-ые этажи и БКФН)',
  '11.09. Двери наружные по фасаду (входные и БКФН, тамбурные двери)',
  '11.10. Защита светопрозрачных конструкций',
  '11.11. СОФ',
  '11.12. Леса и люльки',
  '11.13. Ограждения, козырьки, маркизы',
  '1.1.11. Финишный клининг (фасада, светопрозрачки, отделки, покрытий благоустройства)',
  '12.09.06. МОКАП',
  '19.1. Разработка РД (включая КМД на фасады) и авторский надзор',
  '19.6. Научно-техническое сопровождение строительства'
];

function CalculationPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRefs = useRef({});

  const [newItem, setNewItem] = useState({
    svor_code: '',
    work_type: '',
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

  useEffect(() => {
    async function fetchData() {
      const [objectRes, itemsRes] = await Promise.all([
        supabase.from('objects').select('name').eq('id', id).single(),
        supabase.from('calculation_items').select('*').eq('object_id', id).order('created_at')
      ]);

      if (objectRes.data) setObject(objectRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleAddItem = async () => {
    if (!newItem.work_type && !newItem.note && !newItem.svor_code && !newItemImage) return;

    setSaving(true);

    let imageUrl = null;

    // Upload image first if exists
    if (newItemImage) {
      const fileExt = newItemImage.name.split('.').pop();
      const fileName = `new-${Date.now()}.${fileExt}`;
      const filePath = `calculation-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('object-images')
        .upload(filePath, newItemImage);

      if (uploadError) {
        console.error('Ошибка загрузки:', uploadError);
        alert('Ошибка загрузки изображения: ' + uploadError.message);
        setSaving(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('object-images')
        .getPublicUrl(filePath);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from('calculation_items')
      .insert([{
        object_id: id,
        svor_code: newItem.svor_code || null,
        work_type: newItem.work_type || null,
        note: newItem.note || null,
        image_url: imageUrl
      }])
      .select()
      .single();

    if (!error && data) {
      setItems([...items, data]);
      setNewItem({ svor_code: '', work_type: '', note: '' });
      setNewItemImage(null);
      setNewItemImagePreview(null);
    }
    setSaving(false);
  };

  const handleDeleteItem = async (itemId) => {
    const confirmed = window.confirm('Вы уверены, что хотите удалить эту запись?');
    if (!confirmed) return;

    const { error } = await supabase
      .from('calculation_items')
      .delete()
      .eq('id', itemId);

    if (!error) {
      setItems(items.filter(item => item.id !== itemId));
    }
  };

  const handleUpdateItem = async (itemId, field, value) => {
    const { error } = await supabase
      .from('calculation_items')
      .update({ [field]: value })
      .eq('id', itemId);

    if (error) {
      console.error('Ошибка сохранения:', error);
      alert('Ошибка сохранения: ' + error.message);
    } else {
      setItems(items.map(item =>
        item.id === itemId ? { ...item, [field]: value } : item
      ));
    }
  };

  const handleImageUpload = async (itemId, file) => {
    if (!file) return;

    setUploadingId(itemId);

    const fileExt = file.name.split('.').pop();
    const fileName = `${itemId}-${Date.now()}.${fileExt}`;
    const filePath = `calculation-images/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('object-images')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Ошибка загрузки:', uploadError);
      alert('Ошибка загрузки изображения: ' + uploadError.message);
      setUploadingId(null);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('object-images')
      .getPublicUrl(filePath);

    const imageUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from('calculation_items')
      .update({ image_url: imageUrl })
      .eq('id', itemId);

    if (updateError) {
      console.error('Ошибка сохранения URL:', updateError);
      alert('Ошибка сохранения: ' + updateError.message);
    } else {
      setItems(items.map(item =>
        item.id === itemId ? { ...item, image_url: imageUrl } : item
      ));
    }

    setUploadingId(null);
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

  const resetZoom = () => {
    setImageZoom(1);
    setImageDrag({ x: 0, y: 0 });
  };

  const handleNewItemImageSelect = (file) => {
    if (!file) return;
    setNewItemImage(file);
    setNewItemImagePreview(URL.createObjectURL(file));
  };

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
                  <th className="col-code">Код СВОР</th>
                  <th className="col-work">Вид работ</th>
                  <th className="col-note">Примечание</th>
                  <th className="col-image">Фото</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
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
                        value={item.work_type || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'work_type', e.target.value || null)}
                        className="table-select"
                      >
                        <option value="">—</option>
                        {WORK_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td-note">
                      <textarea
                        value={item.note || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'note', e.target.value)}
                        className="table-textarea table-textarea-note"
                        placeholder="Введите примечание"
                        rows={3}
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
                <tr className="new-row">
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
                      value={newItem.work_type}
                      onChange={(e) => setNewItem({ ...newItem, work_type: e.target.value })}
                      className="table-select"
                    >
                      <option value="">Выберите вид работ...</option>
                      {WORK_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td-note">
                    <textarea
                      value={newItem.note}
                      onChange={(e) => setNewItem({ ...newItem, note: e.target.value })}
                      className="table-textarea table-textarea-note"
                      placeholder="Примечание"
                      rows={3}
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
                      disabled={(!newItem.work_type && !newItem.note && !newItem.svor_code && !newItemImage) || saving}
                    >
                      {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {items.length === 0 && (
            <p className="empty-text">
              Нет записей. Добавьте первую запись, выбрав вид работ.
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
