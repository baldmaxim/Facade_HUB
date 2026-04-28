/**
 * Генерация заполненного Excel ВОР из позиций + шаблонов.
 * Использует xlsx-js-style для цветных ячеек.
 */
import XLSX from 'xlsx-js-style';
import { TEMPLATES, matchPosition, matchPositionDetailed, isHeader, detectVorStyle, classifyRowRole, detectInsulationThickness, detectInsulationType, adjustInsulationTemplate, detectInsulationLayers } from './vorMatcher.js';
import { findWorkPrice } from './vorPriceLoader.js';

const BASE_HEADERS = [
  'Номер позиции', '№ п/п', 'Затрата на строительство', 'Наличие',
  'Тип элемента', 'Тип материала', 'Наименование', 'Ед. изм.',
  'Кол-во заказчика', 'Коэфф. перевода', 'Коэфф. расхода',
  'Кол-во ГП', 'Валюта', 'Тип доставки', 'Стоим. доставки',
  'Цена за единицу', 'Итоговая сумма', 'Ссылка на КП',
  'Примечание заказчика', 'Примечание ГП',
];

const BASE_COL_WIDTHS = [14, 6, 40, 8, 10, 12, 55, 8, 14, 12, 12, 14, 8, 12, 12, 14, 16, 20, 20, 20];

const REVIEW_HEADER = 'Проверка АИ';
const REVIEW_COL_WIDTH = 70;

function formatReviewCell(r) {
  const icon = r.verdict === 'green' ? '🟢' : r.verdict === 'red' ? '🔴' : '🟡';
  const head = `${icon} Оценка: ${r.score ?? 0}/100 — ${r.comment || ''}`.trim();
  return r.reasoning && r.reasoning.trim() ? `${head}\n\nРазбор:\n${r.reasoning.trim()}` : head;
}

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
  const overrides = options.overrides || null;   // Map<positionObject, string[]> — ручной override шаблонов
  const customTemplates = options.customTemplates || {}; // { key: tpl } — custom-шаблоны из БД
  const customRules = options.customRules || [];         // fallback-правила из БД
  const reviews = options.reviews instanceof Map && options.reviews.size > 0 ? options.reviews : null;
  // Map<positionObject, addition[]> — пользовательские дополнения от tech-advisor.
  // Каждый addition: { type: 'material'|'work', name, unit, qtyPerUnit, reason }.
  // Рендерятся отдельными строками после штатных строк позиции, costPath наследуется
  // от первого шаблона позиции, qtyPerUnit идёт в колонку «Коэфф. перевода» (j).
  const appliedTechAdditions = options.appliedTechAdditions instanceof Map && options.appliedTechAdditions.size > 0
    ? options.appliedTechAdditions
    : null;
  const ALL_TEMPLATES = { ...TEMPLATES, ...customTemplates };
  let totalWorkPricesFilled = 0;
  const ws = {};
  let R = 0; // текущая строка
  const merges = [];
  const HEADERS    = reviews ? [...BASE_HEADERS, REVIEW_HEADER] : BASE_HEADERS;
  const COL_WIDTHS = reviews ? [...BASE_COL_WIDTHS, REVIEW_COL_WIDTH] : BASE_COL_WIDTHS;
  const NC = HEADERS.length; // 20 или 21

  // Резолвим шаблоны: сначала override, потом стандартный matchPosition (+ custom rules)
  function matchPos(pos) {
    if (overrides && overrides.has(pos)) return overrides.get(pos);
    return matchPosition(pos.name, pos.noteCustomer || '', customRules);
  }
  // То же, но с деталями правила (ruleDefaultThickness и т.д.)
  function matchPosDetailed(pos) {
    if (overrides && overrides.has(pos)) return { templates: overrides.get(pos), ruleDefaultThickness: undefined };
    return matchPositionDetailed(pos.name, pos.noteCustomer || '', customRules);
  }

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
  // Если есть отдельная позиция утеплителя (только insulation, без НВФ-облицовки) —
  // не добавлять insulation как вторичный шаблон к другим позициям
  for (const p of allPositions) {
    const keys = matchPos(p);
    if (keys.length === 1 && keys[0] === 'insulation') {
      excludeFromSecondary.add('insulation');
      break;
    }
  }

  // Все шаблоны, появляющиеся как primary-ключи в любой позиции ВОРа.
  // Используется expandChain'ом: если companion из requiredChain уже заведён
  // как самостоятельная позиция — не подмешиваем его внутрь главной (избегаем дублей).
  const primaryKeysInVor = new Set();
  for (const p of allPositions) {
    for (const k of matchPos(p)) primaryKeysInVor.add(k);
  }

  // Убираем secondary шаблоны, но если ВСЕ шаблоны попадают под исключение — оставляем.
  // Если позиция явно упоминает утепление — insulation не убираем.
  function filterExcluded(tplKeys, posName = '') {
    if (excludeFromSecondary.size === 0) return tplKeys;
    if (excludeFromSecondary.has('insulation') && /утеплен|утеплит/i.test(posName)) {
      return tplKeys;
    }
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

  // Нормализует шаблон в массив [{work, materials[]}] для чередованного рендеринга.
  // Если в шаблоне есть workMaterials — используем его.
  // Иначе старый формат: все work'и первыми, materials — после последней работы.
  function getWorkGroups(tpl) {
    if (tpl.workMaterials) return tpl.workMaterials;
    const works = tpl.works || [];
    const mats = tpl.materials || [];
    if (!works.length) return mats.length ? [{ work: null, materials: mats }] : [];
    return [
      ...works.slice(0, -1).map(w => ({ work: w, materials: [] })),
      { work: works[works.length - 1], materials: mats },
    ];
  }
  // Плоский список работ / материалов. Единый источник истины —
  // workMaterials если есть, иначе works/materials (старый формат).
  function tplWorks(tpl) {
    if (tpl.workMaterials) return tpl.workMaterials.map(wm => wm.work).filter(Boolean);
    return tpl.works || [];
  }
  function tplMaterials(tpl) {
    if (tpl.workMaterials) return tpl.workMaterials.flatMap(wm => wm.materials);
    return tpl.materials || [];
  }

  // Расширяет массив tplKeys обязательными «спутниками» из поля requiredChain
  // (см. encyclopediaFasad.md Раздел 14). Глубина 2, защита от рекурсии и дублей.
  function expandChain(tplKeys) {
    const result = [...tplKeys];
    const visited = new Set(tplKeys);
    let frontier = tplKeys;
    for (let depth = 0; depth < 2; depth++) {
      const next = [];
      for (const k of frontier) {
        const tpl = ALL_TEMPLATES[k];
        const chain = tpl && tpl.requiredChain;
        if (!chain) continue;
        for (const c of chain) {
          if (visited.has(c)) continue;
          if (excludeFromSecondary.has(c)) continue;
          if (primaryKeysInVor.has(c)) continue;
          visited.add(c);
          result.push(c);
          next.push(c);
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }
    return [...new Set(result)];
  }

  // Рендер applied additions (от tech-advisor) после штатных строк позиции.
  // Возвращает количество отрендеренных строк (для счётчиков). costPath наследуется
  // от первого шаблона позиции (из tplKeys[0]) — приемлемо для смежных по технологии
  // упущений (мембрана к НВФ, дюбели к утеплителю и т.п.).
  function renderAppliedAdditions(pos, tplKeys) {
    if (!appliedTechAdditions) return;
    const items = appliedTechAdditions.get(pos);
    if (!items || items.length === 0) return;
    const firstKey = tplKeys && tplKeys[0];
    const firstTpl = firstKey ? ALL_TEMPLATES[firstKey] : null;
    const costPath = firstTpl?.costPath || '';
    for (const a of items) {
      const isWork = a.type === 'work';
      const style = isWork ? STYLE_WORK : STYLE_MATERIAL;
      const row = new Array(NC).fill('');
      row[2] = costPath;
      if (!isWork) row[3] = 'да';
      row[4] = isWork ? 'суб-раб' : 'суб-мат';
      if (!isWork) row[5] = 'основн.';
      row[6] = a.name;
      row[7] = a.unit;
      if (typeof a.qtyPerUnit === 'number' && a.qtyPerUnit > 0) row[9] = a.qtyPerUnit;
      row[12] = 'RUB';
      if (!isWork) row[13] = 'в цене';
      for (let c = 0; c < NC; c++) {
        ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(row[c], style);
      }
      R++;
      if (isWork) totalWorks++; else totalMaterials++;
    }
  }

  function getTemplate(key, posName, posNote, clusterThickness, ruleDefaultThickness) {
    if (key === 'insulation') {
      const t = clusterThickness || (posName ? (detectInsulationThickness(posName, posNote) ?? ruleDefaultThickness ?? 150) : ruleDefaultThickness ?? 150);
      const type = posName ? detectInsulationType(posName, posNote) : 'mineral';
      const layers = posName ? detectInsulationLayers(posName, posNote) : null;
      return adjustInsulationTemplate(t, type, layers);
    }
    if (key === 'wet_facade') {
      const t = clusterThickness || (posName ? (detectInsulationThickness(posName, posNote) ?? ruleDefaultThickness ?? 150) : ruleDefaultThickness ?? 150);
      const type = posName ? detectInsulationType(posName, posNote) : 'mineral';
      const layers = posName ? detectInsulationLayers(posName, posNote) : null;
      const insTpl = adjustInsulationTemplate(t, type, layers);
      const base = TEMPLATES.wet_facade;
      // Insert only the m3 insulation rows after ROCKglue (index 1)
      const insMats = insTpl.materials.filter(m => m.unit === 'м3');
      const materials = [
        ...base.materials.slice(0, 2),
        ...insMats,
        ...base.materials.slice(2),
      ];
      return { ...base, materials };
    }
    return ALL_TEMPLATES[key];
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
    const posInfos = sectionHasAux ? section.positions.map(p => {
      const det = matchPosDetailed(p);
      return {
        role: classifyRowRole(p.name),
        tplKeys: isHeader(p, allPositions, hdrOpts) ? [] :
          expandChain(filterExcluded(det.templates, p.name)),
        ruleDefaultThickness: det.ruleDefaultThickness,
      };
    }) : [];

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
            if (hasExplicit && t != null) { clusterThickness = t; break; }
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

    // Семейство шаблонов для кластеризации — wet_facade/_finish/_paint/_insulation считаются одним
    function keyFamily(k) {
      if (/^wet_facade/.test(k)) return 'wet_facade_family';
      return k;
    }
    function toFamilySet(keys) {
      return new Set(keys.map(keyFamily));
    }

    // A 'work' position is clustered if a 'material' position with overlapping templates
    // exists between it and the next 'auxiliary' position
    function isClusteredWork(idx) {
      const myFam = toFamilySet(posInfos[idx].tplKeys);
      if (myFam.size === 0) return false;
      for (let j = idx + 1; j < posInfos.length; j++) {
        if (posInfos[j].role === 'auxiliary') return false;
        if (posInfos[j].role === 'material' && posInfos[j].tplKeys.some(k => myFam.has(keyFamily(k)))) return true;
      }
      return false;
    }

    // A 'material' position is clustered if a matching 'work' exists BEFORE it (no aux boundary between)
    function isClusteredMaterial(idx) {
      const myFam = toFamilySet(posInfos[idx].tplKeys);
      if (myFam.size === 0) return false;
      for (let j = idx - 1; j >= 0; j--) {
        if (posInfos[j].role === 'auxiliary') return false;
        if (posInfos[j].role === 'work' && posInfos[j].tplKeys.some(k => myFam.has(keyFamily(k)))) return true;
      }
      return false;
    }

    let clusterInsulationThickness = 150; // per-cluster insulation thickness
    let clusterMaterialUnits = new Set(); // per-cluster: units of material-role positions (для фильтра auxiliary)

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
      if (reviews) {
        const r = reviews.get(pos);
        if (r) {
          posData[20] = formatReviewCell(r);
        }
      }
      for (let c = 0; c < NC; c++) {
        const cell = styledCell(posData[c], STYLE_POSITION);
        if (c === 20 && reviews) {
          cell.s = { ...cell.s, alignment: { wrapText: true, vertical: 'top' } };
        }
        ws[XLSX.utils.encode_cell({ r: R, c })] = cell;
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
            : ALL_TEMPLATES[firstTplKey];
          const firstTplWorks = firstTpl ? tplWorks(firstTpl) : [];
          if (firstTpl && firstTplWorks.length > 0) {
            const w = firstTplWorks[0];
            const wd = new Array(NC).fill('');
            wd[2] = firstTpl.costPath;
            wd[4] = 'суб-раб';
            wd[6] = w.name;
            wd[7] = w.unit;
            wd[12] = 'RUB';
            const p = priceForWork(firstTplKey, w.name, firstTpl.costPath);
            if (p) wd[15] = p;
            if (w.noteGp) wd[19] = w.noteGp;
            for (let c = 0; c < NC; c++) {
              ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
            }
            R++;
            totalWorks++;
          }

          // Все материалы кластера с unit, не совпадающим с unit material-позиций (мембрана+крепёж уходят сюда; сам утеплитель расценён выше). Дедуп по name|unit|j|k.
          const seen = new Set();
          for (const key of clusterTemplates) {
            const tpl = key === 'insulation'
              ? adjustInsulationTemplate(clusterInsulationThickness)
              : ALL_TEMPLATES[key];
            if (!tpl) continue;
            for (const m of tplMaterials(tpl)) {
              const mUnit = (m.unit || '').toString().toLowerCase();
              if (clusterMaterialUnits.size > 0 && clusterMaterialUnits.has(mUnit)) continue;
              const dedupKey = `${m.name}|${mUnit}|${m.j ?? ''}|${m.k ?? ''}`;
              if (seen.has(dedupKey)) continue;
              seen.add(dedupKey);
              const md = new Array(NC).fill('');
              md[2] = tpl.costPath;
              md[3] = 'да';
              md[4] = 'суб-мат';
              md[5] = m.kind || 'основн.';
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
          clusterMaterialUnits = new Set(); // reset for next cluster
          continue;
        }

        // role === 'work' или 'material' — матчим
        let tplKeys = expandChain(filterExcluded(matchPos(pos), pos.name));
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
          // ─── Standalone: чередованный рендеринг работа→материалы ───
          for (const key of tplKeys) {
            const tpl = getTemplate(key, pos.name, pos.noteCustomer, posInfos[posIdx] && posInfos[posIdx].insulationThickness, posInfos[posIdx] && posInfos[posIdx].ruleDefaultThickness);
            if (!tpl) continue;
            const costPath = tpl.costPath;
            for (const { work: w, materials: wMats } of getWorkGroups(tpl)) {
              if (w) {
                const wd = new Array(NC).fill('');
                wd[2] = costPath;
                wd[4] = 'суб-раб';
                wd[6] = w.name;
                wd[7] = w.unit;
                wd[12] = 'RUB';
                const p = priceForWork(key, w.name, tpl.costPath);
                if (p) wd[15] = p;
                if (w.noteGp) wd[19] = w.noteGp;
                for (let c = 0; c < NC; c++) {
                  ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
                }
                R++;
                totalWorks++;
              }
              for (const m of wMats) {
                const md = new Array(NC).fill('');
                md[2] = costPath;
                md[3] = 'да';
                md[4] = 'суб-мат';
                md[5] = m.kind || 'основн.';
                md[6] = (key.startsWith('nvf_cladding') && m.kind === 'основн.' && !m.noOverride && !tpl.preserveTemplateName) ? getCustomerMaterialName(pos) : m.name;
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
          renderAppliedAdditions(pos, tplKeys);
          continue;
        }

        // ─── Clustered work or material: accumulate templates ───
        for (const k of tplKeys) {
          if (!clusterTemplates.includes(k)) clusterTemplates.push(k);
          if (k === 'insulation') {
            const posRuleDef = posInfos[posIdx] && posInfos[posIdx].ruleDefaultThickness;
            clusterInsulationThickness = detectInsulationThickness(pos.name, pos.noteCustomer) ?? posRuleDef ?? 150;
          }
        }

        if (role === 'work') {
          // ТОЛЬКО работы (без материалов)
          for (const key of tplKeys) {
            const tpl = getTemplate(key, pos.name, pos.noteCustomer, posInfos[posIdx] && posInfos[posIdx].insulationThickness, posInfos[posIdx] && posInfos[posIdx].ruleDefaultThickness);
            if (!tpl) continue;
            for (const w of tplWorks(tpl)) {
              const wd = new Array(NC).fill('');
              wd[2] = tpl.costPath;
              wd[4] = 'суб-раб';
              wd[6] = w.name;
              wd[7] = w.unit;
              wd[12] = 'RUB';
              const p = priceForWork(key, w.name, tpl.costPath);
              if (p) wd[15] = p;
              if (w.noteGp) wd[19] = w.noteGp;
              for (let c = 0; c < NC; c++) {
                ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
              }
              R++;
              totalWorks++;
            }
          }
        } else {
          // role === 'material': пустая работа + основные материалы с unit == pos.unit (мембрана/крепёж с другим unit уйдут в auxiliary-позицию).
          const posUnit = (pos.unit || '').toString().toLowerCase();
          if (posUnit) clusterMaterialUnits.add(posUnit);
          for (const key of tplKeys) {
            const tpl = getTemplate(key, pos.name, pos.noteCustomer, posInfos[posIdx] && posInfos[posIdx].insulationThickness, posInfos[posIdx] && posInfos[posIdx].ruleDefaultThickness);
            if (!tpl) continue;

            // Пустая работа для привязки
            const tplW = tplWorks(tpl);
            if (tplW.length > 0) {
              const w = tplW[0];
              const wd = new Array(NC).fill('');
              wd[2] = tpl.costPath;
              wd[4] = 'суб-раб';
              wd[6] = w.name;
              wd[7] = w.unit;
              wd[12] = 'RUB';
              const p = priceForWork(key, w.name, tpl.costPath);
              if (p) wd[15] = p;
              if (w.noteGp) wd[19] = w.noteGp;
              for (let c = 0; c < NC; c++) {
                ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
              }
              R++;
              totalWorks++;
            }

            for (const m of tplMaterials(tpl)) {
              if (m.kind !== 'основн.') continue;
              if (posUnit && (m.unit || '').toString().toLowerCase() !== posUnit) continue;
              const md = new Array(NC).fill('');
              md[2] = tpl.costPath;
              md[3] = 'да';
              md[4] = 'суб-мат';
              md[5] = m.kind;
              md[6] = (key.startsWith('nvf_cladding') && !tpl.preserveTemplateName) ? getCustomerMaterialName(pos) : m.name;
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
        renderAppliedAdditions(pos, tplKeys);
        continue;
      }

      // ─── simple режим (Сокольники — существующая логика) ─────────
      // Матчинг — убираем шаблоны, у которых есть отдельные позиции
      const simpleMatch = matchPosDetailed(pos);
      let tplKeys = expandChain(filterExcluded(simpleMatch.templates, pos.name));
      if (tplKeys.length === 0) {
        unmatched.push(pos.name.slice(0, 60));
        continue;
      }

      totalMatched++;
      const simpleRuleDef = simpleMatch.ruleDefaultThickness;

      for (const key of tplKeys) {
        const tpl = getTemplate(key, pos.name, pos.noteCustomer, undefined, simpleRuleDef);
        if (!tpl) continue;

        const costPath = tpl.costPath;

        // Чередованный рендеринг: работа → её материалы (поддерживает workMaterials)
        for (const { work: w, materials: wMats } of getWorkGroups(tpl)) {
          if (w) {
            const wd = new Array(NC).fill('');
            wd[2] = costPath;
            wd[4] = 'суб-раб';
            wd[6] = w.name;
            wd[7] = w.unit;
            wd[12] = 'RUB';
            const p = priceForWork(key, w.name, tpl.costPath);
            if (p) wd[15] = p;
            if (w.noteGp) wd[19] = w.noteGp;
            for (let c = 0; c < NC; c++) {
              ws[XLSX.utils.encode_cell({ r: R, c })] = styledCell(wd[c], STYLE_WORK);
            }
            R++;
            totalWorks++;
          }
          for (const m of wMats) {
            const md = new Array(NC).fill('');
            md[2] = costPath;
            md[3] = 'да';
            md[4] = 'суб-мат';
            md[5] = m.kind || 'основн.';
            md[6] = (key.startsWith('nvf_cladding') && m.kind === 'основн.' && !m.noOverride && !tpl.preserveTemplateName) ? getCustomerMaterialName(pos) : m.name;
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
      renderAppliedAdditions(pos, tplKeys);
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
