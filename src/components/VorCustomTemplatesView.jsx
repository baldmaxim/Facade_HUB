import { useEffect, useState } from 'react';
import { fetchCustomTemplates, createCustomTemplate, updateCustomTemplate, deleteCustomTemplate } from '../api/vorCustomTemplates';
import { TEMPLATES } from '../lib/vorTemplates';
import VorCustomTemplateEditor from './VorCustomTemplateEditor';
import './VorCustomTemplatesView.css';

const CATEGORIES = ['СПК', 'Двери', 'НВФ', 'Мокрый фасад', 'Ограждения и козырьки', 'Откосы и отсечки', 'Прочее'];

export default function VorCustomTemplatesView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null); // null = создание, иначе редактирование

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await fetchCustomTemplates();
      setRows(data);
    } catch (err) {
      setError('Ошибка загрузки: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingRow(null);
    setEditorOpen(true);
  }
  function openEdit(row) {
    setEditingRow(row);
    setEditorOpen(true);
  }

  async function handleSave(formData) {
    try {
      // Проверка: ключ не должен совпадать с кодовыми
      if (!editingRow && TEMPLATES[formData.key]) {
        setError(`Ключ "${formData.key}" занят кодовым шаблоном. Выбери другой.`);
        return;
      }
      if (editingRow) {
        const updated = await updateCustomTemplate(editingRow.key, {
          label: formData.label,
          category: formData.category,
          cost_path: formData.cost_path,
          data: formData.data,
          keywords: formData.keywords,
          secondary: formData.secondary,
          sort_order: formData.sort_order || 0,
        });
        setRows(prev => prev.map(r => r.key === editingRow.key ? updated : r));
      } else {
        const created = await createCustomTemplate(formData);
        setRows(prev => [...prev, created]);
      }
      setEditorOpen(false);
      setEditingRow(null);
      setError(null);
    } catch (err) {
      setError('Ошибка сохранения: ' + err.message);
    }
  }

  async function handleDelete(key) {
    if (!confirm('Удалить custom-шаблон?')) return;
    try {
      await deleteCustomTemplate(key);
      setRows(prev => prev.filter(r => r.key !== key));
    } catch (err) {
      setError('Ошибка удаления: ' + err.message);
    }
  }

  const byCategory = {};
  for (const row of rows) {
    const cat = row.category || 'Прочее';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(row);
  }

  return (
    <div className="vctm">
      <div className="vctm-header">
        <h3 className="vctm-title">Пользовательские шаблоны <span className="vctm-count">· {rows.length}</span></h3>
        <button className="vctm-btn-primary" onClick={openCreate}>+ Создать шаблон</button>
      </div>

      <p className="vctm-info">
        Подбираются к позициям только если ни одно кодовое правило не сработало (fallback).
        Сначала проверяется 36 встроенных шаблонов, потом ваши.
      </p>

      {error && <div className="vctm-error">{error}</div>}

      {loading ? (
        <div className="vctm-loading">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="vctm-empty">
          Пока нет пользовательских шаблонов. Создай первый если встретишь позицию, которую движок не распознаёт.
        </div>
      ) : (
        CATEGORIES.map(cat => {
          const items = byCategory[cat] || [];
          if (items.length === 0) return null;
          return (
            <div key={cat} className="vctm-cat">
              <div className="vctm-cat-title">{cat} · {items.length}</div>
              <div className="vctm-list">
                {items.map(r => (
                  <div key={r.key} className="vctm-card">
                    <div className="vctm-card-main">
                      <div className="vctm-card-label">{r.label}</div>
                      <code className="vctm-card-key">{r.key}</code>
                      <div className="vctm-card-path">{r.cost_path}</div>
                      <div className="vctm-card-kw">
                        {r.keywords.length > 0 ? r.keywords.map(k => (
                          <code key={k} className="vctm-kw">{k}</code>
                        )) : <span className="vctm-kw-none">без ключей — не матчится</span>}
                      </div>
                    </div>
                    <div className="vctm-card-actions">
                      <button className="vctm-btn" onClick={() => openEdit(r)}>Ред.</button>
                      <button className="vctm-btn vctm-btn-danger" onClick={() => handleDelete(r.key)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {editorOpen && (
        <VorCustomTemplateEditor
          initial={editingRow}
          onSave={handleSave}
          onClose={() => { setEditorOpen(false); setEditingRow(null); }}
        />
      )}
    </div>
  );
}
