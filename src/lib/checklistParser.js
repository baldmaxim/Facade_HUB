import { STATUS_ALIASES, CHECKLIST_STATUS, DEFAULT_CHECKLIST_ITEMS } from '../data/checklistItems';

/**
 * Парсит данные из Google Sheets / CSV формата
 * Ожидаемый формат: "Номер\tНазвание\tСтатус\tПримечание" или через запятую
 *
 * @param {string} csvText - Текст из Google Sheets или CSV
 * @returns {Array} - Массив объектов чек-листа
 */
export function parseGoogleSheetData(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return [];
  }

  const lines = csvText.trim().split('\n');
  const result = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Определяем разделитель (табуляция или запятая)
    const separator = line.includes('\t') ? '\t' : ',';
    const parts = line.split(separator).map(p => p.trim());

    if (parts.length < 2) continue;

    // Пытаемся извлечь номер
    const idMatch = parts[0].match(/^\d+/);
    const id = idMatch ? parseInt(idMatch[0], 10) : null;

    // Находим соответствующий элемент из дефолтного списка
    const defaultItem = id
      ? DEFAULT_CHECKLIST_ITEMS.find(item => item.id === id)
      : null;

    // Извлекаем название (если id есть, берём следующую колонку)
    const nameIndex = id ? 1 : 0;
    const name = parts[nameIndex] || (defaultItem?.name) || '';

    // Извлекаем статус
    const statusIndex = id ? 2 : 1;
    const rawStatus = (parts[statusIndex] || '').toLowerCase().trim();
    const status = parseStatus(rawStatus);

    // Извлекаем примечание
    const noteIndex = id ? 3 : 2;
    const note = parts.slice(noteIndex).join(separator).trim();

    result.push({
      id: id || result.length + 1,
      name: name || (defaultItem?.name) || `Элемент ${result.length + 1}`,
      status,
      note,
      customValue: ''
    });
  }

  return result;
}

/**
 * Парсит строку статуса в enum значение
 * @param {string} rawStatus - Строка статуса на русском
 * @returns {string|null} - Enum значение статуса
 */
export function parseStatus(rawStatus) {
  if (!rawStatus) return null;

  const normalized = rawStatus.toLowerCase().trim();

  // Проверяем прямое совпадение с алиасами
  if (STATUS_ALIASES[normalized]) {
    return STATUS_ALIASES[normalized];
  }

  // Проверяем частичное совпадение
  for (const [alias, status] of Object.entries(STATUS_ALIASES)) {
    if (normalized.includes(alias) || alias.includes(normalized)) {
      return status;
    }
  }

  return null;
}

/**
 * Экспортирует чек-лист в JSON формат
 * @param {Array} checklist - Массив элементов чек-листа
 * @returns {string} - JSON строка
 */
export function exportToJSON(checklist) {
  return JSON.stringify(checklist, null, 2);
}

/**
 * Экспортирует чек-лист в CSV формат
 * @param {Array} checklist - Массив элементов чек-листа
 * @returns {string} - CSV строка
 */
export function exportToCSV(checklist) {
  const STATUS_LABELS = {
    [CHECKLIST_STATUS.ACCOUNTED]: 'Учтено',
    [CHECKLIST_STATUS.NOT_ACCOUNTED]: 'Не учтено',
    [CHECKLIST_STATUS.MISSING_NOT_ACCOUNTED]: 'Отсутствует в проекте',
    [CHECKLIST_STATUS.MISSING_BUT_ACCOUNTED]: 'Отсутствует, но учтено',
    [CHECKLIST_STATUS.INSUFFICIENT_INFO]: 'Недостаточно информации'
  };

  const header = '№;Название;Статус;Примечание';
  const rows = checklist.map(item => {
    const statusLabel = item.status ? STATUS_LABELS[item.status] : '';
    return `${item.id};${item.name};${statusLabel};${item.note || ''}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Скачивает файл
 * @param {string} content - Содержимое файла
 * @param {string} filename - Имя файла
 * @param {string} mimeType - MIME тип
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Мержит импортированные данные с существующим чек-листом
 * @param {Array} existing - Существующий чек-лист
 * @param {Array} imported - Импортированные данные
 * @returns {Array} - Объединённый чек-лист
 */
export function mergeChecklists(existing, imported) {
  const result = [...existing];

  for (const importedItem of imported) {
    const existingIndex = result.findIndex(item => item.id === importedItem.id);

    if (existingIndex !== -1) {
      // Обновляем существующий элемент
      result[existingIndex] = {
        ...result[existingIndex],
        status: importedItem.status || result[existingIndex].status,
        note: importedItem.note || result[existingIndex].note,
        customValue: importedItem.customValue || result[existingIndex].customValue
      };
    }
  }

  return result;
}
