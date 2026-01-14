import * as XLSX from 'xlsx';
import { WORK_TYPES } from '../data/workTypes';

/**
 * Нормализует строку для сравнения: убирает номера, лишние пробелы, приводит к нижнему регистру
 */
function normalizeWorkName(name) {
  if (!name) return '';
  return name
    .toString()
    .replace(/^\d+\.\d+\.?\s*/, '') // Убираем номер вида "10.01. " или "01.07. "
    .replace(/\s+/g, ' ')           // Множественные пробелы в один
    .trim()
    .toLowerCase();
}

/**
 * Находит work_type_id по названию из Excel
 */
function findWorkTypeId(excelName) {
  const normalizedExcel = normalizeWorkName(excelName);
  if (!normalizedExcel) return null;

  // Точное совпадение после нормализации
  for (const wt of WORK_TYPES) {
    const normalizedWt = normalizeWorkName(wt.name);
    if (normalizedExcel === normalizedWt) {
      return wt.id;
    }
  }

  // Частичное совпадение - ищем по ключевым словам
  for (const wt of WORK_TYPES) {
    const normalizedWt = normalizeWorkName(wt.name);
    // Проверяем, содержит ли одна строка другую
    if (normalizedExcel.includes(normalizedWt) || normalizedWt.includes(normalizedExcel)) {
      return wt.id;
    }
  }

  // Специальные соответствия для сложных случаев
  const specialMappings = {
    'устройство мокрого фасада': 1,
    'мокрый фасад': 1,
    'облицовка нвф': 2,
    'подсистема нвф': 3,
    'светопрозрачные': 4,
    'фурнитура': 5,
    'профиль алюминиевый': 6,
    'алюминиевый профиль': 6,
    'профиль пвх': 7,
    'пвх профиль': 7,
    'тамбура': 8,
    'двери наружные': 9,
    'входные двери': 9,
    'защита светопрозрачных': 10,
    'соф': 11,
    'леса и люльки': 12,
    'леса': 12,
    'люльки': 12,
    'ограждения': 13,
    'козырьки': 13,
    'маркизы': 13,
    'клининг': 14,
    'финишный клининг': 14,
    'мокап': 15,
    'разработка рд': 16,
    'кмд': 16,
    'авторский надзор': 16,
    'научно-техническое': 17,
    'нтс': 17
  };

  for (const [keyword, id] of Object.entries(specialMappings)) {
    if (normalizedExcel.includes(keyword)) {
      return id;
    }
  }

  return null;
}

/**
 * Парсит число из ячейки Excel
 */
function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  // Убираем пробелы и заменяем запятую на точку
  const cleaned = value.toString().replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Парсит Excel файл и возвращает данные для обновления object_works
 * @param {File} file - Excel файл
 * @returns {Promise<{data: Array, logs: Array, errors: Array}>}
 */
export async function parseExcelFile(file) {
  const logs = [];
  const errors = [];
  const data = [];

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    logs.push(`Загружен файл: ${file.name}`);
    logs.push(`Лист: ${sheetName}, всего строк: ${rows.length}`);

    // Данные начинаются со строки 3 (индекс 2)
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue; // Пропускаем пустые строки

      const workName = row[0];
      const volume = parseNumber(row[2]);           // Столбец C (индекс 2)
      const workPerUnit = parseNumber(row[13]);     // Столбец N (индекс 13)
      const materialsPerUnit = parseNumber(row[14]); // Столбец O (индекс 14)

      // Пропускаем строки без числовых данных
      if (volume === null && workPerUnit === null && materialsPerUnit === null) {
        continue;
      }

      const workTypeId = findWorkTypeId(workName);

      if (workTypeId) {
        data.push({
          work_type_id: workTypeId,
          volume,
          work_per_unit: workPerUnit,
          materials_per_unit: materialsPerUnit
        });
        logs.push(`✓ Строка ${i + 1}: "${workName}" → work_type_id: ${workTypeId}`);
      } else {
        errors.push(`Строка ${i + 1}: не найдено соответствие для "${workName}"`);
      }
    }

    logs.push(`Всего распознано: ${data.length} записей`);
    if (errors.length > 0) {
      logs.push(`Не распознано: ${errors.length} строк`);
    }

  } catch (error) {
    errors.push(`Ошибка парсинга файла: ${error.message}`);
  }

  return { data, logs, errors };
}

export { normalizeWorkName, findWorkTypeId };
