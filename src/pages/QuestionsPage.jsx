import { useState } from 'react';
import useSWR from 'swr';
import { fetchQuestions, createQuestion, updateQuestion, deleteQuestion } from '../api/questions';
import './QuestionsPage.css';

function QuestionsPage() {
  const { data: questions = [], isLoading: loading, mutate } = useSWR('questions', fetchQuestions);

  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [formQuestion, setFormQuestion] = useState('');
  const [formCondition, setFormCondition] = useState('');
  const [saving, setSaving] = useState(false);

  // Открыть модалку для добавления
  function openAddModal() {
    setEditingQuestion(null);
    setFormQuestion('');
    setFormCondition('');
    setShowModal(true);
  }

  // Открыть модалку для редактирования
  function openEditModal(item) {
    setEditingQuestion(item);
    setFormQuestion(item.question);
    setFormCondition(item.condition || '');
    setShowModal(true);
  }

  // Закрыть модалку
  function closeModal() {
    setShowModal(false);
    setEditingQuestion(null);
    setFormQuestion('');
    setFormCondition('');
  }

  // Сохранить (добавить или обновить)
  async function handleSave() {
    if (!formQuestion.trim()) return;

    setSaving(true);
    try {
      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, { question: formQuestion, condition: formCondition });
      } else {
        await createQuestion({ question: formQuestion, condition: formCondition });
      }
      await mutate();
      closeModal();
    } catch (err) {
      console.error('Ошибка сохранения вопроса:', err);
    } finally {
      setSaving(false);
    }
  }

  // Удаление вопроса
  async function handleDelete(id) {
    if (!confirm('Удалить этот вопрос?')) return;
    try {
      await deleteQuestion(id);
      await mutate();
    } catch (err) {
      console.error('Ошибка удаления вопроса:', err);
    }
  }

  if (loading) {
    return (
      <main className="questions-page">
        <div className="questions-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="questions-page">
      <div className="questions-container">
        <div className="questions-header">
          <h1 className="questions-title">Типовые вопросы заказчику</h1>
          <button className="add-question-btn" onClick={openAddModal}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Добавить вопрос
          </button>
        </div>

        <div className="questions-table-wrapper">
          <table className="questions-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Вопрос</th>
                <th>Когда/Почему задаем</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {questions.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td className="question-text">{item.question}</td>
                  <td className={`condition-text ${item.condition === 'Всегда' ? 'always' : ''}`}>
                    {item.condition || '—'}
                  </td>
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
              ))}
            </tbody>
          </table>
        </div>

        {questions.length === 0 && (
          <p className="no-questions">Нет вопросов. Добавьте первый вопрос.</p>
        )}
      </div>

      {/* Модальное окно добавления/редактирования */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingQuestion ? 'Редактировать вопрос' : 'Добавить вопрос'}
              </h2>
              <button className="modal-close" onClick={closeModal}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Вопрос</label>
                <textarea
                  className="form-textarea"
                  placeholder="Введите текст вопроса..."
                  value={formQuestion}
                  onChange={(e) => setFormQuestion(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label>Когда/Почему задаем</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Например: Если не указано в проекте"
                  value={formCondition}
                  onChange={(e) => setFormCondition(e.target.value)}
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
                disabled={saving || !formQuestion.trim()}
              >
                {saving ? 'Сохранение...' : (editingQuestion ? 'Сохранить' : 'Добавить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default QuestionsPage;
