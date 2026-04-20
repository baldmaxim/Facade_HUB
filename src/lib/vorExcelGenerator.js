/**
 * Генерация заполненного Excel ВОР из позиций + шаблонов.
 * Использует xlsx-js-style для цветных ячеек.
 */
import XLSX from 'xlsx-js-style';
import { TEMPLATES, matchPosition, isHeader, detectVorStyle, classifyRowRole, detectInsulationThickness, detectInsulationType, adjustInsulationTemplate } from './vorMatcher.js';
import { findWorkPrice } from './vorPriceLoader.js';

const HEADERS = [
  'Номер позиции', '№ п/п', 'Затрата на строительство', 'Наличие',
  'Тип элемента', 'Тип материала', 'Наименование', 'Ед. изм.',
  'Кол-во заказчика', 'Коэфф. перевода', 'Коэфф. расхода',
  'Кол-во ГП', 'Валюта', 'Тип доставки', 'Стоим. доставки',
  'Цена за единицу', 'Итоговая сумма', 'Ссылка на КП',
  'Примечание заказчика', 'Примечание ГП',
];

const COL_WIDTHS = [14, 6, 40, 8, 10, 12, 55, 8, 14, 12, 12, 14, 8, 12, 12, 14, 16, 20, 20, 20];

// Точные цвета из реального ВОР
const STYLE_HEADER   = { fill: { fgColor: { rgb: 'E0E0E0' } }, font: { bold: true, sz: 10 }, alignment: { wrapText: true } };
const STYLE_SECTION  = { fill: { fgColor: { rgb: 'FFF2CC' } }, font: { bold: true, sz: 11 } };
const STYLE_POSITION = { fill: { fgColor: { rgb: 'FFCCCC' } }, font: { bold: true, sz: 10 } };
const STYLE_WORK     = { fill: { fgColor: { rgb: 'E6D9F2' } }, font: { sz: 10 } };
const STYLE_MATERIAL = { fill: { fgColor: { rgb: 'E8F5E0' } }, font: { sz: 10 } };

const BORDER = {
  top: { style: 'thin', color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
  left: { style: 'thin', color: { rgb: 'CCCCCC' } },
  right: { style: 'thin', color: { rgb: 'CCCCCC' } },
};

function styledCell(value, style) {
  return { v: value === '' || value === null || value === undefined ? '' : value, s: { ...style, border: BORDER } };
}

/**
 * Парсит пустой ВОР Excel → массив секций с позициями.
 */
export function parseEmptyVor(data) {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const sections = [];
  let currentSection = '';
  let currentPositions = [];

  for (const row of rows) {
    if (!row || row.every(c => c === null || c === undefined || c === '')) continue;

    const colA = row[0];
    const colE = String(row[4] || '').trim().toLowerCase();
    const colG = row[6] ? String(row[6]).trim() : '';
    if (colG.toLowerCase() === 'наименование') continue;
    const colH = row[7] ? String(row[7]).trim() : '';
    const colI = row[8];
    const colL = row[11];
    const colS = row[18] ? String(row[18]).trim() : '';
    const colT = row[19] ? String(row[19]).trim() : '';

    if (colE.includes('суб-раб') || colE.includes('суб-мат') || colE.includes('sub-')) continue;

    const hasQty = (colI !== null && colI !== undefined && colI !== '') ||
                   (colL !== null && colL !== undefined && colL !== '');

    if (colG && colG.length > 3 && hasQty) {
      let posCode = colA ? String(colA).trim() : '';
      if (posCode.includes('-') && (posCode.includes(':') || posCode.includes('00'))) posCode = '';

      currentPositions.push({
        code: posCode,
        name: colG,
        unit: colH,
        qtyCustomer: typeof colI === 'number' ? colI : (parseFloat(colI) || null),
        qtyGp: typeof colL === 'number' ? colL : (parseFloat(colL) || null),
        qty: (typeof colL === 'number' ? colL : parseFloat(colL)) || (typeof colI === 'number' ? colI : parseFloat(colI)) || 0,
        noteCustomer: colS,
        noteGp: colT,
      });
    } else if (colG && colG.length > 3) {
      const text = [row[6], row[5], row[4], row[3], row[2], row[1], row[0]]
        .find(v => v && String(v).trim().length > 3);
      if (text) {
        if (currentSection && currentPositions.length > 0) {
          sections.push({ name: currentSection, positions: currentPositions });
          currentPositions = [];
        }
        currentSection = String(text).trim();
      }
    }
  }

  if (currentPositions.length > 0) {
    sections.push({ name: currentSection || 'Без раздела', positions: currentPositions });
  }

  return { sections, stats: { totalPositions: sections.reduce((s, sec) => s + sec.positions.length, 0), totalSections: sections.length } };
}

/**
 * Генерирует заполненный Excel ВОР и возвращает Blob для скачивания.
 */
export function generateFilledVor(parsed, options = {}) {
  const { sections } = parsed;
  const hdrOpts = { priceAllWithQty: options.priceAllWithQty === true };
  const workPrices = options.workPrices || null; // Map<tplKey, Array<{name, price}>>
  let totalWorkPricesFilled = 0;
  const ws = {};
  let R = 0; // текущая строка
  const merges = [];
  const NC = 20; // число колонок

  // ─── Заголовок ──────────────────────────────────────────────────
  for (let c = 0; c < NC; c++) {
    ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(HEADERS[c], STYLE_HEADER);
  }
  R++;

  let totalMatched = 0;
  let totalWorks = 0;
  let totalMaterials = 0;
  let totalHeaders = 0;
  const unmatched = [];

  // Собираем ВСЕ позиции для определения заголовков
  const allPositions = sections.flatMap(s => s.positions);

  // Определяем стиль ВОР: simple (Сокольники) или split-3 (Муза)
  const vorStyle = detectVorStyle(allPositions);

  // Предварительный проход: определяем какие шаблоны имеют ОТДЕЛЬНЫЕ позиции
  // Если есть отдельная строка "леса" — не вставлять scaffolding в другие позиции
  // Если есть отдельная строка "защита СПК" — не вставлять spk_broneplenka в другие
  // Проверяем КАЖДУЮ позицию отдельно, чтобы regex .* не пересекал границы позиций
  const excludeFromSecondary = new Set();
  for (const p of allPositions) {
    const text = (p.name + ' ' + (p.noteCustomer || '')).toLowerCase();
    if (/лес[аоы]|люльк|подмост|подмащив/.test(text)) {
      excludeFromSecondary.add('scaffolding');
    }
    if (/оклейк.*бронир|бронир.*пленк|бронир.*плёнк|защит.*светопрозр|защит.*спк|защит.*стекл.*конструкц/.test(text)) {
      excludeFromSecondary.add('spk_broneplenka');
    }
    if (/разработк.*км.*спк|км.*спк.*разработк/.test(text)) {
      excludeFromSecondary.add('kmd_spk');
    }
    if (/разработк.*км.*нвф|км.*нвф.*разработк/.test(text)) {
      excludeFromSecondary.add('kmd_nvf');
    }
  }

  // Убираем secondary шаблоны, но если ВСЕ шаблоны попадают под исключение — оставляем
  function filterExcluded(tplKeys) {
    if (excludeFromSecondary.size === 0) return tplKeys;
    const filtered = tplKeys.filter(k => !excludeFromSecondary.has(k));
    return filtered.length > 0 ? filtered : tplKeys;
  }

  // Для основных материалов облицовки — использовать описание заказчика:
  // приоритет — название позиции, если нет специфики — примечание.
  // Лукап цены работы по (tplKey, workName) + fallback по costPath
  function priceForWork(tplKey, workName, costPath) {
    if (!workPrices) return null;
    const p = findWorkPrice(workPrices, tplKey, workName, costPath);
    if (p) totalWorkPricesFilled++;
    return p;
  }

  function getCustomerMaterialName(pos) {
    const name = (pos.name || '').trim();
    const note = (pos.noteCustomer || '').trim();
    // Чистим префиксы "НВФ.", "Облицовка:", "- " и суффикс "без утеплителя"
    const cleanName = name
      .replace(/^нвф\.?\s*/i, '')
      .replace(/^облицовк[аи]:?\s*/i, '')
      .replace(/^[-–—]\s*/, '')
      .replace(/,?\s*без\s+утеплен\w*\s*$/i, '')
      .trim();
    // Если название слишком общее (короче 15 символов или просто "облицовка") — берём примечание
    const genericPatterns = /^устройство\s+облицовк|^облицовк$|^фасад\s*$/i;
    if (cleanName.length < 15 || genericPatterns.test(cleanName)) {
      if (note.length > 10) return note;
    }
    return cleanName || note || name;
  }

  function getTemplate(key, posName, posNote, clusterThickness) {
    if (key === 'insulation') {
      const t = clusterThickness || (posName ? detectInsulationThickness(posName, posNote) : 150);
      const type = posName ? detectInsulationType(posName, posNote) : 'mineral';
      return adjustInsulationTemplate(t, type);
    }
    return TEMPLATES[key];
  }

  for (const section of sections) {
    // ─── Раздел (жёлтый) ──────────────────────────────────────────
    ws[XLSX.utils.encode_cell({ r: R, c: 0 })] = styledCell(section.name, STYLE_SECTION);
    for (let c = 1; c < NC; c++) {
      ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell('', STYLE_SECTION);
    }
    merges.push({ s: { r: R, c: 0 }, e: { r: R, c: NC - 1 } });
    R++;

    let clusterTemplates = []; // для split-3: накопитель шаблонов до строки "Прочие материалы"
    const sectionHasAux = section.positions.some(p => classifyRowRole(p.name) === 'auxiliary');

    // Pre-compute roles and matches for cluster detection
    const posInfos = sectionHasAux ? section.positions.map(p => ({
      role: classifyRowRole(p.name),
      tplKeys: isHeader(p, allPositions, hdrOpts) ? [] :
        filterExcluded(matchPosition(p.name, p.noteCustomer)),
    })) : [];

    // Post-process: material rows after a wet_facade_insulation work inherit it
    // (заменяем НВФ insulation на мокрый, если предыдущая работа — клеевое утепление)
    if (sectionHasAux) {
      let inWetCluster = false;
      for (const info of posInfos) {
        if (info.role === 'work') {
          inWetCluster = info.tplKeys.includes('wet_facade_insulation');
        } else if (info.role === 'auxiliary') {
          inWetCluster = false;
        } else if (info.role === 'material' && inWetCluster && info.tplKeys.includes('insulation')) {
          info.tplKeys = info.tplKeys.map(k => k === 'insulation' ? 'wet_facade_insulation' : k);
        }
      }
    }

    // Post-process: распространить толщину утеплителя на весь кластер
    // (работа часто без толщины, материал в том же кластере — с толщиной)
    if (sectionHasAux) {
      let clusterStart = 0;
      for (let i = 0; i <= posInfos.length; i++) {
        const isEnd = i === posInfos.length || posInfos[i].role === 'auxiliary';
        if (!isEnd) continue;
        // Ищем явную толщину в позициях кластера [clusterStart, i)
        let clusterThickness = null;
        for (let j = clusterStart; j < i; j++) {
          if (posInfos[j].tplKeys.includes('insulation')) {
            const p = section.positions[j];
            const t = detectInsulationThickness(p.name, p.noteCustomer);
            const hasExplicit = /(\d{2,3})\s*мм|толщ/i.test(p.name + ' ' + (p.noteCustomer || ''));
            if (hasExplicit) { clusterThickness = t; break; }
          }
        }
        // Применяем ко всем insulation позициям кластера
        if (clusterThickness != null) {
          for (let j = clusterStart; j < i; j++) {
            if (posInfos[j].tplKeys.includes('insulation')) {
              posInfos[j].insulationThickness = clusterThickness;
            }
          }
        }
        clusterStart = i + 1;
      }
    }

    // A 'work' position is clustered if a 'material' position with overlapping templates
    // exists between it and the next 'auxiliary' position
    function isClusteredWork(idx) {
      const myKeys = new Set(posInfos[idx].tplKeys);
      if (myKeys.size === 0) return false;
      for (let j = idx + 1; j < posInfos.length; j++) {
        if (posInfos[j].role === 'auxiliary') return false;
        if (posInfos[j].role === 'material' && posInfos[j].tplKeys.some(k => myKeys.has(k))) return true;
      }
      return false;
    }

    // A 'material' position is clustered if a matching 'work' exists BEFORE it (no aux boundary between)
    function isClusteredMaterial(idx) {
      const myKeys = new Set(posInfos[idx].tplKeys);
      if (myKeys.size === 0) return false;
      for (let j = idx - 1; j >= 0; j--) {
        if (posInfos[j].role === 'auxiliary') return false;
        if (posInfos[j].role === 'work' && posInfos[j].tplKeys.some(k => myKeys.has(k))) return true;
      }
      return false;
    }

    let clusterInsulationThickness = 150; // per-cluster insulation thickness

    for (let posIdx = 0; posIdx < section.positions.length; posIdx++) {
      const pos = section.positions[posIdx];

      // ─── Позиция (розовая) ────────────────────────────────────────
      const posData = new Array(NC).fill('');
      posData[0] = pos.code;
      posData[6] = pos.name;
      posData[7] = pos.unit;
      if (pos.qtyCustomer != null) posData[8] = pos.qtyCustomer;
      if (pos.qtyGp != null) posData[11] = pos.qtyGp;
      if (pos.noteCustomer) posData[18] = pos.noteCustomer;
      if (pos.noteGp) posData[19] = pos.noteGp;
      for (let c = 0; c < NC; c++) {
        ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(posData[c], STYLE_POSITION);
      }
      R++;

      // Заголовки НЕ расцениваются
      if (isHeader(pos, allPositions, hdrOpts)) {
        totalHeaders++;
        continue;
      }

      // ─── split-3 режим (Муза) — только для разделов с "Прочие материалы"
      if (vorStyle === 'split-3' && sectionHasAux) {
        const role = classifyRowRole(pos.name);

        if (role === 'auxiliary') {
          // "Прочие материалы" — вспомогательные из всех шаблонов кластера
          if (clusterTemplates.length === 0) {
            unmatched.push(pos.name.slice(0, 60));
            continue;
          }
          totalMatched++;

          // Пустая работа для привязки (от первого шаблона в кластере)
          const firstTplKey = clusterTemplates[0];
          const firstTpl = firstTplKey === 'insulation'
            ? adjustInsulationTemplate(clusterInsulationThickness)
            : TEMPLATES[firstTplKey];
          if (firstTpl && firstTpl.works.length > 0) {
            const w = firstTpl.works[0];
            const wd = new Array(NC).fill('');
            wd[2] = firstTpl.costPath;
            wd[4] = 'суб-раб';
            wd[6] = w.name;
            wd[7] = w.unit;
            wd[12] = 'RUB';
            const p = priceForWork(firstTplKey, w.name, firstTpl.costPath);
            if (p) wd[15] = p;
            for (let c = 0; c < NC; c++) {
              ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
            }
            R++;
            totalWorks++;
          }

          // Все вспомогательные материалы из кластера (без дубликатов)
          const seen = new Set();
          for (const key of clusterTemplates) {
            const tpl = key === 'insulation'
              ? adjustInsulationTemplate(clusterInsulationThickness)
              : TEMPLATES[key];
            if (!tpl) continue;
            for (const m of tpl.materials) {
              if (m.kind !== 'вспомогат.') continue;
              if (seen.has(m.name)) continue;
              seen.add(m.name);
              const md = new Array(NC).fill('');
              md[2] = tpl.costPath;
              md[3] = 'да';
              md[4] = 'суб-мат';
              md[5] = m.kind;
              md[6] = m.name;
              md[7] = m.unit;
              if (m.j != null) md[9] = m.j;
              if (m.k != null) md[10] = m.k;
              md[12] = 'RUB';
              md[13] = 'в цене';
              if (m.price) md[15] = m.price;
              for (let c = 0; c < NC; c++) {
                ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(md[c], STYLE_MATERIAL);
              }
              R++;
              totalMaterials++;
            }
          }
          clusterTemplates = [];
          clusterInsulationThickness = 150; // reset for next cluster
          continue;
        }

        // role === 'work' или 'material' — матчим
        let tplKeys = filterExcluded(matchPosition(pos.name, pos.noteCustomer));
        // Если в кластере уже wet_facade_insulation, 'insulation' (НВФ) заменяем на него
        if (clusterTemplates.includes('wet_facade_insulation')) {
          tplKeys = tplKeys.map(k => k === 'insulation' ? 'wet_facade_insulation' : k);
          tplKeys = [...new Set(tplKeys)];
        }
        if (tplKeys.length === 0) {
          unmatched.push(pos.name.slice(0, 60));
          continue;
        }
        totalMatched++;

        const isStandalone =
          (role === 'work' && !isClusteredWork(posIdx)) ||
          (role === 'material' && !isClusteredMaterial(posIdx));
        if (isStandalone) {
          // ─── Standalone: works + all materials (как simple mode), без накопления ───
          for (const key of tplKeys) {
            const tpl = getTemplate(key, pos.name, pos.noteCustomer, posInfos[posIdx] && posInfos[posIdx].insulationThickness);
            if (!tpl) continue;
            const costPath = tpl.costPath;
            for (const w of tpl.works) {
              const wd = new Array(NC).fill('');
              wd[2] = costPath;
              wd[4] = 'суб-раб';
              wd[6] = w.name;
              wd[7] = w.unit;
              wd[12] = 'RUB';
              const p = priceForWork(key, w.name, tpl.costPath);
              if (p) wd[15] = p;
              for (let c = 0; c < NC; c++) {
                ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
              }
              R++;
              totalWorks++;
            }
            for (const m of tpl.materials) {
              const md = new Array(NC).fill('');
              md[2] = costPath;
              md[3] = 'да';
              md[4] = 'суб-мат';
              md[5] = m.kind || 'основн.';
              md[6] = (key.startsWith('nvf_cladding') && m.kind === 'основн.') ? getCustomerMaterialName(pos) : m.name;
              md[7] = m.unit;
              if (m.j != null) md[9] = m.j;
              if (m.k != null) md[10] = m.k;
              md[12] = 'RUB';
              md[13] = 'в цене';
              if (m.price) md[15] = m.price;
              for (let c = 0; c < NC; c++) {
                ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(md[c], STYLE_MATERIAL);
              }
              R++;
              totalMaterials++;
            }
          }
          continue;
        }

        // ─── Clustered work or material: accumulate templates ───
        for (const k of tplKeys) {
          if (!clusterTemplates.includes(k)) clusterTemplates.push(k);
          if (k === 'insulation') {
            clusterInsulationThickness = detectInsulationThickness(pos.name, pos.noteCustomer);
          }
        }

        if (role === 'work') {
          // ТОЛЬКО работы (без материалов)
          for (const key of tplKeys) {
            const tpl = getTemplate(key, pos.name, pos.noteCustomer, posInfos[posIdx] && posInfos[posIdx].insulationThickness);
            if (!tpl) continue;
            for (const w of tpl.works) {
              const wd = new Array(NC).fill('');
              wd[2] = tpl.costPath;
              wd[4] = 'суб-раб';
              wd[6] = w.name;
              wd[7] = w.unit;
              wd[12] = 'RUB';
              const p = priceForWork(key, w.name, tpl.costPath);
              if (p) wd[15] = p;
              for (let c = 0; c < NC; c++) {
                ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
              }
              R++;
              totalWorks++;
            }
          }
        } else {
          // role === 'material': пустая работа + только основные материалы
          for (const key of tplKeys) {
            const tpl = getTemplate(key, pos.name, pos.noteCustomer, posInfos[posIdx] && posInfos[posIdx].insulationThickness);
            if (!tpl) continue;

            // Пустая работа для привязки
            if (tpl.works.length > 0) {
              const w = tpl.works[0];
              const wd = new Array(NC).fill('');
              wd[2] = tpl.costPath;
              wd[4] = 'суб-раб';
              wd[6] = w.name;
              wd[7] = w.unit;
              wd[12] = 'RUB';
              const p = priceForWork(key, w.name, tpl.costPath);
              if (p) wd[15] = p;
              for (let c = 0; c < NC; c++) {
                ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
              }
              R++;
              totalWorks++;
            }

            // Только основные материалы
            for (const m of tpl.materials) {
              if (m.kind !== 'основн.') continue;
              const md = new Array(NC).fill('');
              md[2] = tpl.costPath;
              md[3] = 'да';
              md[4] = 'суб-мат';
              md[5] = m.kind;
              md[6] = key.startsWith('nvf_cladding') ? getCustomerMaterialName(pos) : m.name;
              md[7] = m.unit;
              if (m.j != null) md[9] = m.j;
              if (m.k != null) md[10] = m.k;
              md[12] = 'RUB';
              md[13] = 'в цене';
              if (m.price) md[15] = m.price;
              for (let c = 0; c < NC; c++) {
                ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(md[c], STYLE_MATERIAL);
              }
              R++;
              totalMaterials++;
            }
          }
        }
        continue;
      }

      // ─── simple режим (Сокольники — существующая логика) ─────────
      // Матчинг — убираем шаблоны, у которых есть отдельные позиции
      let tplKeys = filterExcluded(matchPosition(pos.name, pos.noteCustomer));
      if (tplKeys.length === 0) {
        unmatched.push(pos.name.slice(0, 60));
        continue;
      }

      totalMatched++;

      for (const key of tplKeys) {
        const tpl = getTemplate(key, pos.name, pos.noteCustomer, posInfos[posIdx] && posInfos[posIdx].insulationThickness);
        if (!tpl) continue;

        // Путь затрат — из шаблона
        const costPath = tpl.costPath;

        // Работы (сиреневые) — без объёмов, заполняются позже
        for (const w of tpl.works) {
          const wd = new Array(NC).fill('');
          wd[2] = costPath;
          wd[4] = 'суб-раб';
          wd[6] = w.name;
          wd[7] = w.unit;
          wd[12] = 'RUB';
          const p = priceForWork(key, w.name, tpl.costPath);
          if (p) wd[15] = p;
          for (let c = 0; c < NC; c++) {
            ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
          }
          R++;
          totalWorks++;
        }

        // Материалы (зелёные) — коэффициенты и цены из шаблонов, без объёмов
        for (const m of tpl.materials) {
          const md = new Array(NC).fill('');
          md[2] = costPath;
          md[3] = 'да';
          md[4] = 'суб-мат';
          md[5] = m.kind || 'основн.';
          md[6] = (key.startsWith('nvf_cladding') && m.kind === 'основн.') ? getCustomerMaterialName(pos) : m.name;
          md[7] = m.unit;
          if (m.j != null) md[9] = m.j;
          if (m.k != null) md[10] = m.k;
          md[12] = 'RUB';
          md[13] = 'в цене';
          if (m.price) md[15] = m.price;
          for (let c = 0; c < NC; c++) {
            ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(md[c], STYLE_MATERIAL);
          }
          R++;
          totalMaterials++;
        }
      }
    }
  }

  // Метаданные листа
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: R - 1, c: NC - 1 } });
  ws['!cols'] = COL_WIDTHS.map(w => ({ wch: w }));
  ws['!merges'] = merges;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ВОР расценённый');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });

  return {
    blob,
    stats: {
      totalPositions: sections.reduce((s, sec) => s + sec.positions.length, 0),
      totalHeaders,
      totalMatched,
      totalWorks,
      totalMaterials,
      totalWorkPricesFilled,
      totalRows: R,
      unmatched,
      vorStyle,
    },
  };
}

/**
 * Скачивание файла в браузере.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
