import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './ContractorsPage.css';

function ContractorsPage() {
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    section: '',
    company: '',
    email: '',
    contact_person: '',
    phone: '',
    note: ''
  });
  const [saving, setSaving] = useState(false);
  const [filterSection, setFilterSection] = useState('');
  const [expandedCompanies, setExpandedCompanies] = useState(new Set());

  // Загрузка подрядчиков
  useEffect(() => {
    fetchContractors();
  }, []);

  async function fetchContractors() {
    const { data, error } = await supabase
      .from('contractors')
      .select('*')
      .order('id', { ascending: true });

    if (!error && data) {
      setContractors(data);
    }
    setLoading(false);
  }

  // Получить уникальные разделы
  const sections = [...new Set(contractors.map(c => c.section))];

  // Цвета для разделов (мягкие пастельные)
  const sectionColors = {
    'Стеклопакеты': '#e8f4f8',
    'Рекомендации на стеклопакеты': '#e8f0e8',
    'Витражные конструкции': '#f5f0e8',
    'Окна ПВХ': '#f0e8f5',
    'Гибка профилей': '#e8e8f5',
    'Переработка, противопожарные витражи, ламели, СПК и Облицовка с подсистемой': '#f5e8e8',
    'Фурнитура': '#e8f5f0',
    'Раздвижные двери': '#f5f5e8',
    'Гильотинная система': '#f0f5e8',
    'Козырьки и ограждения': '#e8f5f5',
    'Маркизы': '#f5e8f0',
    'Зенитный фонарь': '#f0e8e8'
  };

  // Получить цвет для раздела
  function getSectionColor(section) {
    if (sectionColors[section]) {
      return sectionColors[section];
    }
    let hash = 0;
    for (let i = 0; i < section.length; i++) {
      hash = section.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, 30%, 95%)`;
  }

  // Группировка по разделу и компании
  function groupContractors(data) {
    const groups = [];
    const processedKeys = new Set();

    data.forEach(item => {
      const key = `${item.section}|||${item.company || ''}`;
      if (processedKeys.has(key)) return;
      processedKeys.add(key);

      const sameCompany = data.filter(c =>
        c.section === item.section && (c.company || '') === (item.company || '')
      );

      groups.push({
        key,
        section: item.section,
        company: item.company,
        contacts: sameCompany,
        hasMultiple: sameCompany.length > 1
      });
    });

    return groups;
  }

  // Фильтрованные данные
  const filteredContractors = filterSection
    ? contractors.filter(c => c.section === filterSection)
    : contractors;

  // Сгруппированные данные
  const groupedData = groupContractors(filteredContractors);

  // Переключить развёртывание компании
  function toggleExpand(key) {
    setExpandedCompanies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }

  // Открыть модалку для добавления
  function openAddModal() {
    setEditingItem(null);
    setFormData({
      section: filterSection || '',
      company: '',
      email: '',
      contact_person: '',
      phone: '',
      note: ''
    });
    setShowModal(true);
  }

  // Открыть модалку для редактирования
  function openEditModal(item) {
    setEditingItem(item);
    setFormData({
      section: item.section,
      company: item.company || '',
      email: item.email || '',
      contact_person: item.contact_person || '',
      phone: item.phone || '',
      note: item.note || ''
    });
    setShowModal(true);
  }

  // Закрыть модалку
  function closeModal() {
    setShowModal(false);
    setEditingItem(null);
    setFormData({
      section: '',
      company: '',
      email: '',
      contact_person: '',
      phone: '',
      note: ''
    });
  }

  // Обновить поле формы
  function updateFormField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  // Сохранить
  async function handleSave() {
    if (!formData.section.trim()) return;

    setSaving(true);

    if (editingItem) {
      const { error } = await supabase
        .from('contractors')
        .update(formData)
        .eq('id', editingItem.id);

      if (!error) {
        setContractors(contractors.map(c =>
          c.id === editingItem.id ? { ...c, ...formData } : c
        ));
        closeModal();
      }
    } else {
      const { data, error } = await supabase
        .from('contractors')
        .insert([formData])
        .select()
        .single();

      if (!error && data) {
        setContractors([...contractors, data]);
        closeModal();
      }
    }

    setSaving(false);
  }

  // Удаление
  async function handleDelete(id) {
    if (!confirm('Удалить этот контакт?')) return;

    const { error } = await supabase
      .from('contractors')
      .delete()
      .eq('id', id);

    if (!error) {
      setContractors(contractors.filter(c => c.id !== id));
    }
  }

  // Копировать в буфер
  async function handleCopy(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  if (loading) {
    return (
      <main className="contractors-page">
        <div className="contractors-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="contractors-page">
      <div className="contractors-container">
        <div className="contractors-header">
          <h1 className="contractors-title">База подрядчиков</h1>
          <div className="contractors-actions">
            <select
              className="filter-select"
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
            >
              <option value="">Все разделы</option>
              {sections.map(section => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
            <button className="add-btn" onClick={openAddModal}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Добавить
            </button>
          </div>
        </div>

        <div className="contractors-table-wrapper">
          <table className="contractors-table">
            <thead>
              <tr>
                <th></th>
                <th>Раздел</th>
                <th>Компания</th>
                <th>Почта</th>
                <th>Контактное лицо</th>
                <th>Телефон</th>
                <th>Примечание</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groupedData.map((group) => {
                const isExpanded = expandedCompanies.has(group.key);
                const displayContacts = isExpanded ? group.contacts : [group.contacts[0]];

                return displayContacts.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{ backgroundColor: getSectionColor(item.section) }}
                    className={idx > 0 ? 'sub-row' : ''}
                  >
                    <td className="expand-cell">
                      {idx === 0 && group.hasMultiple && (
                        <button
                          className="expand-btn"
                          onClick={() => toggleExpand(group.key)}
                          title={isExpanded ? 'Свернуть' : 'Развернуть'}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                          >
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </button>
                      )}
                    </td>
                    <td className="section-cell">{idx === 0 ? item.section : ''}</td>
                    <td className="company-cell">{idx === 0 ? (item.company || '—') : ''}</td>
                    <td className="email-cell">
                      {item.email ? (
                        <span
                          className="copyable"
                          onClick={() => handleCopy(item.email)}
                          title="Нажмите, чтобы скопировать"
                        >
                          {item.email}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="contact-cell">{item.contact_person || '—'}</td>
                    <td className="phone-cell">
                      {item.phone ? (
                        <span
                          className="copyable"
                          onClick={() => handleCopy(item.phone)}
                          title="Нажмите, чтобы скопировать"
                        >
                          {item.phone}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="note-cell">{item.note || '—'}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="edit-btn"
                          onClick={() => openEditModal(item)}
                          title="Редактировать"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => handleDelete(item.id)}
                          title="Удалить"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>

        {groupedData.length === 0 && (
          <p className="no-data">Нет данных. Добавьте первый контакт.</p>
        )}
      </div>

      {/* Модальное окно */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingItem ? 'Редактировать контакт' : 'Добавить контакт'}
              </h2>
              <button className="modal-close" onClick={closeModal}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Раздел *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Например: Стеклопакеты"
                  value={formData.section}
                  onChange={(e) => updateFormField('section', e.target.value)}
                  list="sections-list"
                />
                <datalist id="sections-list">
                  {sections.map(section => (
                    <option key={section} value={section} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Наименование компании</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Название компании"
                  value={formData.company}
                  onChange={(e) => updateFormField('company', e.target.value)}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Почта</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={(e) => updateFormField('email', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Телефон</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="+7..."
                    value={formData.phone}
                    onChange={(e) => updateFormField('phone', e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Контактное лицо</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ФИО"
                  value={formData.contact_person}
                  onChange={(e) => updateFormField('contact_person', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Примечание</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Дополнительная информация"
                  value={formData.note}
                  onChange={(e) => updateFormField('note', e.target.value)}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeModal}>
                Отмена
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !formData.section.trim()}
              >
                {saving ? 'Сохранение...' : (editingItem ? 'Сохранить' : 'Добавить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default ContractorsPage;
