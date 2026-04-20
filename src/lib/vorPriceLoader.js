/**
 * Загрузка прайса работ из Excel и лукап цены по (tplKey, workName).
 *
 * Структура Excel:
 *   A: costPath
 *   B: Наименование работы
 *   C: Ед. изм.
 *   D: Цена за единицу
 *   E: Ключ шаблона (tplKey) — служебное
 *
 * Возвращаемый Map: key = tplKey, value = Array<{ name, price, costPath }>
 */
import XLSX from 'xlsx-js-style';

/**
 * Парсит Excel-буфер с прайсом работ.
 * Принимает Uint8Array или ArrayBuffer. Возвращает Map<tplKey, Array<entry>>.
 */
export function loadWorkPrices(data) {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const priceMap = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const costPath = row[0] ? String(row[0]).trim() : '';
    const name = row[1] ? String(row[1]).trim() : '';
    const price = row[3];
    const tplKey = row[4] ? String(row[4]).trim() : '';
    if (!name || !tplKey) continue;
    if (price == null || price === '') continue;
    const num = typeof price === 'number' ? price : parseFloat(price);
    if (!Number.isFinite(num) || num <= 0) continue;

    const entry = { name, price: num, costPath };
    if (!priceMap.has(tplKey)) priceMap.set(tplKey, []);
    priceMap.get(tplKey).push(entry);
  }

  return priceMap;
}

/**
 * Находит цену работы по (tplKey, workName).
 * Алгоритм:
 *   1. Точное совпадение имени (trim, lowercase)
 *   2. Если одна запись для tplKey — используем её (покрывает insulation с динамическим именем)
 *   3. Префиксное совпадение по первому слову имени
 */
export function findWorkPrice(priceMap, tplKey, workName, costPath = null) {
  if (!priceMap) return null;
  const wn = (workName || '').toLowerCase().trim();

  // Сначала ищем в записях этого tplKey
  const entries = priceMap.get(tplKey);
  if (entries && entries.length) {
    // 1. Точное совпадение имени
    const exact = entries.find(e => e.name.toLowerCase().trim() === wn);
    if (exact) return exact.price;

    // 2. Единственная запись для ключа — используем её (покрывает insulation с динамическим именем)
    if (entries.length === 1) return entries[0].price;

    // 3. Префиксное совпадение по первому значимому слову
    for (const e of entries) {
      const firstWord = e.name.trim().toLowerCase().split(/[\s(,]/)[0];
      if (firstWord && wn.startsWith(firstWord)) return e.price;
    }
  }

  // Fallback: ищем по (costPath, name) во всех записях — одна цена может покрывать несколько tplKey
  if (costPath) {
    for (const [, es] of priceMap) {
      for (const e of es) {
        if (e.costPath === costPath && e.name.toLowerCase().trim() === wn) return e.price;
      }
    }
  }

  return null;
}
