import useSWR from 'swr';
import { fetchVorHistory, deleteVorHistoryItem } from '../api/vorHistory';
import './VorHistoryList.css';

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(2) + ' МБ';
}

export default function VorHistoryList({ objectId }) {
  const swrKey = ['vor-history', objectId];
  const { data: items = [], isLoading, mutate } = useSWR(
    swrKey,
    () => fetchVorHistory(objectId)
  );

  async function handleDelete(item) {
    if (!confirm(`Удалить версию от ${formatDateTime(item.created_at)}?`)) return;
    try {
      await deleteVorHistoryItem(item.id, item.file_path);
      await mutate();
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
  }

  if (isLoading) {
    return <div className="vhl-loading">Загрузка истории...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="vhl-empty">
        История пока пустая. Каждая сгенерированная версия ВОР будет автоматически
        сохраняться — сможешь скачать или откатиться.
      </div>
    );
  }

  return (
    <div className="vhl-list">
      {items.map(item => {
        const s = item.stats || {};
        return (
          <div key={item.id} className="vhl-row">
            <div className="vhl-row-main">
              <div className="vhl-row-date">{formatDateTime(item.created_at)}</div>
              <div className="vhl-row-name">{item.file_name}</div>
              <div className="vhl-row-meta">
                {s.totalPositions != null && <span>позиций: {s.totalPositions}</span>}
                {s.totalMatched != null && <span>распознано: {s.totalMatched}</span>}
                {s.totalWorks != null && <span>работ: {s.totalWorks}</span>}
                {s.totalMaterials != null && <span>матер.: {s.totalMaterials}</span>}
                {item.size_bytes && <span className="vhl-size">{formatSize(item.size_bytes)}</span>}
              </div>
            </div>
            <div className="vhl-row-actions">
              <a className="vhl-btn-primary" href={item.file_url} target="_blank" rel="noreferrer" download={item.file_name}>
                Скачать
              </a>
              <button className="vhl-btn-danger" onClick={() => handleDelete(item)} title="Удалить эту версию">
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
