/**
 * Функции матчинга позиций ВОР на шаблоны.
 * 
 * matchPosition(name, note) — возвращает список шаблонов для позиции.
 * matchPositionDetailed(name, note) — то же + инфо о сработавшем правиле.
 * isHeader(pos, all) — определяет является ли позиция заголовком.
 * classifyRowRole(name) — work/material/auxiliary (для split-3 Муза).
 * detectVorStyle(positions) — simple или split-3.
 * detectInsulationThickness/Type/Layers — детекция параметров утеплителя.
 * adjustInsulationTemplate — возвращает скорректированный insulation-шаблон.
 */

import { TEMPLATES } from './vorTemplates.js';
import { MATCH_RULES } from './vorRules.js';

export { TEMPLATES };

/**
 * Определяет, является ли позиция заголовком (имеет дочерние позиции).
 */
export function isHeader(pos, allPositions = null, options = {}) {
  const priceAllWithQty = options.priceAllWithQty === true;
  const hasQty =
    (pos.qty && pos.qty !== 0) ||
    (pos.qtyCustomer && pos.qtyCustomer !== 0) ||
    (pos.qtyGp && pos.qtyGp !== 0);

  // Нет объёма — всегда заголовок
  if (!hasQty) return true;

  // Донстрой-режим: всё с объёмом расцениваем (и родителей, и дочерних)
  if (priceAllWithQty) return false;

  // Стандарт: родитель с дочерними позициями — заголовок (не дублируем объём с листьями)
  if (!pos.code || !allPositions) return false;
  const prefix = pos.code.replace(/\.$/, '');
  return allPositions.some(other =>
    other !== pos &&
    other.code &&
    other.code.startsWith(prefix + '.') &&
    other.code.length > pos.code.length
  );
}

// Внутренний раннер правил: применяет массив правил к строке поиска.
// Возвращает { templates, ruleIndex, keyword, isCustom } или null.
function runRules(rules, searchText, skipInsulation, isCustom = false) {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (skipInsulation && rule.templates.length === 1 && rule.templates[0] === 'insulation') continue;
    const matchedKeyword = rule.keywords.find(kw => {
      if (kw.includes('.*') || kw.includes('[')) return new RegExp(kw, 'i').test(searchText);
      return searchText.includes(kw);
    });
    if (matchedKeyword) {
      const templates = [];
      const seen = new Set();
      for (const t of rule.templates) {
        if (skipInsulation && t === 'insulation') continue;
        if (!seen.has(t)) { templates.push(t); seen.add(t); }
      }
      for (const t of rule.secondary) {
        if (skipInsulation && t === 'insulation') continue;
        if (!seen.has(t)) { templates.push(t); seen.add(t); }
      }
      return { templates, ruleIndex: i, keyword: matchedKeyword, isCustom };
    }
  }
  return null;
}

/**
 * Определяет шаблоны для позиции ВОР.
 * customRules — опциональные custom-правила, применяются ПОСЛЕ кодовых (fallback).
 * Первое совпадение побеждает.
 */
export function matchPosition(positionName, noteCustomer = '', customRules = []) {
  const searchText = (positionName + ' ' + (noteCustomer || '')).toLowerCase();
  const skipInsulation = /без\s+утепл|декоратив/i.test(searchText);

  const codeHit = runRules(MATCH_RULES, searchText, skipInsulation, false);
  if (codeHit) return codeHit.templates;

  const customHit = runRules(customRules, searchText, skipInsulation, true);
  if (customHit) return customHit.templates;

  return [];
}

/**
 * Как matchPosition, но возвращает сработавшее правило (keyword + признак custom/code).
 */
export function matchPositionDetailed(positionName, noteCustomer = '', customRules = []) {
  const searchText = (positionName + ' ' + (noteCustomer || '')).toLowerCase();
  const skipInsulation = /без\s+утепл|декоратив/i.test(searchText);

  const codeHit = runRules(MATCH_RULES, searchText, skipInsulation, false);
  if (codeHit) return codeHit;

  const customHit = runRules(customRules, searchText, skipInsulation, true);
  if (customHit) return customHit;

  return { templates: [], ruleIndex: -1, keyword: null, isCustom: false };
}

/**
 * Определяет стиль ВОР: simple (Сокольники) или split-3 (Муза).
 * Сканирует все названия позиций. Если есть "прочие материалы" / "вспомогательные материалы" → split-3.
 */
export function detectVorStyle(positions) {
  const auxPattern = /прочие\s+материал|вспомогательн\w*\s+материал/i;
  for (const pos of positions) {
    if (auxPattern.test(pos.name || '')) return 'split-3';
  }
  return 'simple';
}

/**
 * Классифицирует роль строки в split-3 режиме: work / material / auxiliary.
 * - auxiliary: "прочие материалы", "вспомогательные материалы"
 * - work: начинается с глагола действия (монтаж, устройство, установка, и т.д.)
 * - material: всё остальное (конкретный материал)
 */
export function classifyRowRole(name) {
  const lower = (name || '').toLowerCase().trim();
  if (/прочие\s+материал|вспомогательн\w*\s+материал/.test(lower)) return 'auxiliary';
  if (/^(монтаж|устройство|установка|сборка|демонтаж|оклейка|затирка|изготовление|разработка|утепление\s|наружная\s+облицовк|заполнение|монтаж\/демонтаж|отделка)/.test(lower)) return 'work';
  return 'material';
}

/**
 * Определяет толщину утеплителя из названия позиции и примечания.
 * Приоритет: название > примечание > дефолт 150мм.
 */
export function detectInsulationThickness(name, note) {
  const nameStr = name || '';
  const noteStr = note || '';

  // Паттерн 1: явное "NNN мм" (основной)
  const patternMm = /(\d{2,3})\s*мм/;
  // Паттерн 2: "толщ" + число (без "мм")
  const patternTolsch = /толщ\.?\s*(\d{2,3})/i;
  // Паттерн 3: габариты "x NNN" — последнее число = толщина
  const patternDim = /\d+\s*[xх×]\s*\d+\s*[xх×]\s*(\d{2,3})/i;

  // Любая толщина в разумном диапазоне (30-300мм)
  for (const str of [nameStr, noteStr]) {
    for (const pat of [patternMm, patternTolsch, patternDim]) {
      const m = str.match(pat);
      if (m) {
        const mm = parseInt(m[1]);
        if (mm >= 30 && mm <= 300) return mm;
      }
    }
  }
  return 150;
}

/**
 * Определяет тип утеплителя из названия/примечания.
 * 'foam_glass' — пеностекло, 'xps' — ЭППС/экструдированный пенополистирол,
 * 'mineral' — минераловатный (дефолт).
 */
export function detectInsulationType(name, note) {
  const s = ((name || '') + ' ' + (note || '')).toLowerCase();
  if (/пеностекл/.test(s)) return 'foam_glass';
  if (/эппс|экструдирован.*пенополистирол|пенополистирол.*экструдирован/.test(s)) return 'xps';
  return 'mineral';
}

/**
 * Возвращает скорректированный шаблон утеплителя под толщину, тип и слои.
 * Формула толщины:
 *   - Всегда 2 слоя: наружный = 50мм (j=0.05), внутренний = (толщина - 50)мм / 1000
 *   - Если толщина ≤ 50мм → 1 слой, j = толщина / 1000
 *   - Оба слоя называются одинаково (бренд/тип без суффиксов)
 *   - layers: { outer, inner } — ручные толщины из названия позиции "X+Y мм"
 */
export function adjustInsulationTemplate(thickness, insulationType = 'mineral', layers = null) {
  const base = TEMPLATES.insulation;

  let outerMm, innerMm;
  if (layers) {
    outerMm = layers.outer;
    innerMm = layers.inner;
  } else {
    outerMm = 50;
    innerMm = thickness - 50;
  }
  const oneLayer = (layers ? innerMm <= 0 : thickness <= 50);

  const outerJ = outerMm / 1000;
  const innerJ = innerMm / 1000;

  const works = base.works.map(w => ({
    ...w,
    name: oneLayer
      ? `Утепление в 1 слой (${thickness} мм)`
      : `Утепление в 2 слоя (${thickness} мм)`,
  }));

  // Имя утеплителя по типу
  const insulationName = insulationType === 'foam_glass' ? 'Утеплитель пеностекло'
                       : insulationType === 'xps' ? 'Утеплитель ЭППС'
                       : 'Утеплитель ТЕХНОВЕНТ ОПТИМА';

  let materials;
  const [mat0, mat1, mem, dub0, dub1] = base.materials;
  if (oneLayer) {
    materials = [
      { ...mat0, name: insulationName, j: outerJ },
      { ...mem },
      { ...dub0 },
      { ...dub1 },
    ];
  } else {
    materials = [
      { ...mat0, name: insulationName, j: outerJ },
      { ...mat1, name: insulationName, j: innerJ },
      { ...mem },
      { ...dub0 },
      { ...dub1 },
    ];
  }

  return { ...base, works, materials };
}

/**
 * Определяет слои утеплителя из формата "X+Y мм" в названии позиции.
 * Возвращает { outer, inner } (оба в мм), или null если не найдено.
 */
export function detectInsulationLayers(name, note) {
  const s = ((name || '') + ' ' + (note || '')).toLowerCase();
  const m = s.match(/(\d+)\s*\+\s*(\d+)\s*мм/);
  if (m) {
    const a = parseInt(m[1]);
    const b = parseInt(m[2]);
    if (a >= 30 && a <= 200 && b >= 30 && b <= 200) {
      return { outer: Math.min(a, b), inner: Math.max(a, b) };
    }
  }
  return null;
}
