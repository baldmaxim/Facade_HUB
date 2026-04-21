import { useState } from 'react';
import useSWR from 'swr';
import { fetchPrompts, createPrompt, updatePrompt, deletePrompt } from '../api/prompts';
import './PromptsPage.css';

function PromptsPage() {
  const { data: prompts = [], isLoading: loading, mutate } = useSWR('prompts', fetchPrompts);

  const [showModal, setShowModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [formPurpose, setFormPurpose] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Открыть модалку для добавления
  function openAddModal() {
    setEditingPrompt(null);
    setFormPurpose('');
    setFormPrompt('');
    setShowModal(true);
  }

  // Открыть модалку для редактирования
  function openEditModal(item) {
    setEditingPrompt(item);
    setFormPurpose(item.purpose);
    setFormPrompt(item.prompt);
    setShowModal(true);
  }

  // Закрыть модалку
  function closeModal() {
    setShowModal(false);
    setEditingPrompt(null);
    setFormPurpose('');
    setFormPrompt('');
  }

  // Сохранить (добавить или обновить)
  async function handleSave() {
    if (!formPurpose.trim() || !formPrompt.trim()) return;

    setSaving(true);
    try {
      if (editingPrompt) {
        await updatePrompt(editingPrompt.id, { purpose: formPurpose, prompt: formPrompt });
      } else {
        await createPrompt({ purpose: formPurpose, prompt: formPrompt });
      }
      await mutate();
      closeModal();
    } catch (err) {
      console.error('Ошибка сохранения промта:', err);
    } finally {
      setSaving(false);
    }
  }

  // Удаление промта
  async function handleDelete(id) {
    if (!confirm('Удалить этот промт?')) return;
    try {
      await deletePrompt(id);
      await mutate();
    } catch (err) {
      console.error('Ошибка удаления промта:', err);
    }
  }

  // Копировать промт
  async function handleCopy(item) {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  if (loading) {
    return (
      <main className="prompts-page">
        <div className="prompts-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="prompts-page">
      <div className="prompts-container">
        <div className="prompts-header">
          <h1 className="prompts-title">Промты</h1>
          <button className="add-prompt-btn" onClick={openAddModal}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Добавить промт
          </button>
        </div>

        <div className="prompts-table-wrapper">
          <table className="prompts-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Цель</th>
                <th>Промт</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td className="purpose-text">{item.purpose}</td>
                  <td className="prompt-text">
                    <div className="prompt-content">{item.prompt}</div>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className={`copy-btn ${copiedId === item.id ? 'copied' : ''}`}
                        onClick={() => handleCopy(item)}
                        title="Копировать"
                      >
                        {copiedId === item.id ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                      </button>
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
              ))}
            </tbody>
          </table>
        </div>

        {prompts.length === 0 && (
          <p className="no-prompts">Нет промтов. Добавьте первый промт.</p>
        )}
      </div>

      {/* Модальное окно добавления/редактирования */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingPrompt ? 'Редактировать промт' : 'Добавить промт'}
              </h2>
              <button className="modal-close" onClick={closeModal}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Цель</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Например: Анализ ТЗ"
                  value={formPurpose}
                  onChange={(e) => setFormPurpose(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Промт</label>
                <textarea
                  className="form-textarea"
                  placeholder="Введите текст промта..."
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  rows={12}
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
                disabled={saving || !formPurpose.trim() || !formPrompt.trim()}
              >
                {saving ? 'Сохранение...' : (editingPrompt ? 'Сохранить' : 'Добавить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default PromptsPage;
