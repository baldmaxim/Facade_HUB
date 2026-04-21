import { useState } from 'react';
import { TEMPLATES } from '../lib/vorTemplates';
import './VorCodeTemplatesView.css';

// Человекопонятные названия + категория для UI-группировки
const TPL_META = {
  spk_profile:                  { label: 'Профиль стойка-ригель',        category: 'СПК' },
  spk_glass:                    { label: 'Стеклопакет',                  category: 'СПК' },
  spk_broneplenka:              { label: 'Бронеплёнка',                  category: 'СПК' },
  spk_hardware:                 { label: 'Фурнитура СПК',                category: 'СПК' },
  pvh_profile:                  { label: 'Профиль ПВХ',                  category: 'СПК' },
  doors_entrance:               { label: 'Двери входные (БКФН)',         category: 'Двери' },
  doors_tambour:                { label: 'Тамбурные двери',              category: 'Двери' },
  nvf_subsystem:                { label: 'Подсистема НВФ',               category: 'НВФ' },
  insulation:                   { label: 'Утеплитель',                   category: 'НВФ' },
  nvf_cladding_clinker:         { label: 'Облицовка: клинкер',           category: 'НВФ' },
  nvf_cladding_cassette:        { label: 'Облицовка: кассеты',           category: 'НВФ' },
  nvf_cladding_concrete_tile:   { label: 'Облицовка: бетонная плитка',   category: 'НВФ' },
  nvf_cladding_fibrobeton:      { label: 'Облицовка: фибробетон',        category: 'НВФ' },
  nvf_cladding_ceramic:         { label: 'Облицовка: керамика',          category: 'НВФ' },
  nvf_cladding_porcelain:       { label: 'Облицовка: керамогранит',      category: 'НВФ' },
  nvf_cladding_natural_stone:   { label: 'Облицовка: натуральный камень',category: 'НВФ' },
  nvf_cladding_akp:             { label: 'Облицовка: АКП',               category: 'НВФ' },
  nvf_cladding_fcp:             { label: 'Облицовка: ФЦП',               category: 'НВФ' },
  nvf_cladding_galvanized:      { label: 'Облицовка: оцинков. лист',     category: 'НВФ' },
  nvf_cladding_arch_concrete:   { label: 'Облицовка: арх. бетон',        category: 'НВФ' },
  nvf_cladding_brick:           { label: 'Облицовка: кирпич',            category: 'НВФ' },
  nvf_cladding_profiles_vertical: { label: 'Облицовка: верт. профили',   category: 'НВФ' },
  wet_facade:                   { label: 'Мокрый фасад (полный)',        category: 'Мокрый фасад' },
  wet_facade_insulation:        { label: 'Мокрый фасад (только утепление)', category: 'Мокрый фасад' },
  wet_facade_finish:            { label: 'Мокрый фасад (декор. слой)',   category: 'Мокрый фасад' },
  wet_facade_paint:             { label: 'Мокрый фасад (окраска)',       category: 'Мокрый фасад' },
  glass_railing:                { label: 'Стеклянные ограждения',        category: 'Ограждения и козырьки' },
  glass_railing_molled:         { label: 'Моллированные ограждения',     category: 'Ограждения и козырьки' },
  glass_canopy:                 { label: 'Козырёк из триплекса',         category: 'Ограждения и козырьки' },
  flashings:                    { label: 'Откосы / отливы / парапеты',   category: 'Откосы и отсечки' },
  pp_otsechi:                   { label: 'П/П отсечки',                  category: 'Откосы и отсечки' },
  vent_grilles:                 { label: 'Вентиляционные решётки',       category: 'Прочее' },
  scaffolding:                  { label: 'Леса и люльки',                category: 'Прочее' },
  kmd_spk:                      { label: 'КМД СПК',                      category: 'Прочее' },
  kmd_nvf:                      { label: 'КМД НВФ',                      category: 'Прочее' },
  mockup:                       { label: 'Мокап фасада',                 category: 'Прочее' },
};

const CATEGORY_ORDER = ['СПК', 'Двери', 'НВФ', 'Мокрый фасад', 'Ограждения и козырьки', 'Откосы и отсечки', 'Прочее'];

// Преобразует template в плоский список {work, materials[]} для рендера
function templateToWorkGroups(tpl) {
  if (tpl.workMaterials) return tpl.workMaterials;
  const works = tpl.works || [];
  const mats = tpl.materials || [];
  if (!works.length) return mats.length ? [{ work: null, materials: mats }] : [];
  return [
    ...works.slice(0, -1).map(w => ({ work: w, materials: [] })),
    { work: works[works.length - 1], materials: mats },
  ];
}

function formatCoef(v) {
  if (v === undefined || v === null) return '—';
  return String(v);
}

function formatPrice(v) {
  if (v === undefined || v === null) return '—';
  return v.toLocaleString('ru-RU') + ' ₽';
}

export default function VorCodeTemplatesView() {
  const [query, setQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState(new Set());

  // Группируем по категориям
  const byCategory = {};
  for (const key of Object.keys(TEMPLATES)) {
    const meta = TPL_META[key] || { label: key, category: 'Прочее' };
    const category = meta.category;
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({ key, label: meta.label, tpl: TEMPLATES[key] });
  }
  // Сортировка внутри категории по label
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }

  const q = query.trim().toLowerCase();
  function matchesQuery(item) {
    if (!q) return true;
    if (item.key.toLowerCase().includes(q)) return true;
    if (item.label.toLowerCase().includes(q)) return true;
    if (item.tpl.costPath && item.tpl.costPath.toLowerCase().includes(q)) return true;
    const wgs = templateToWorkGroups(item.tpl);
    for (const wg of wgs) {
      if (wg.work && wg.work.name.toLowerCase().includes(q)) return true;
      for (const m of wg.materials) {
        if (m.name.toLowerCase().includes(q)) return true;
      }
    }
    return false;
  }

  function toggle(key) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function expandAll() {
    setExpandedKeys(new Set(Object.keys(TEMPLATES)));
  }
  function collapseAll() {
    setExpandedKeys(new Set());
  }

  const totalCount = Object.keys(TEMPLATES).length;

  return (
    <div className="vctv">
      <div className="vctv-toolbar">
        <input
          type="text"
          className="vctv-search"
          placeholder="Поиск по названию, ключу, работе или материалу..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="vctv-toolbar-actions">
          <button className="vctv-btn" onClick={expandAll}>Развернуть все</button>
          <button className="vctv-btn" onClick={collapseAll}>Свернуть все</button>
        </div>
      </div>

      <div className="vctv-info">
        Всего шаблонов: <b>{totalCount}</b>. Источник — <code>src/lib/vorTemplates.js</code>. Редактирование в коде.
      </div>

      {CATEGORY_ORDER.map(cat => {
        const items = (byCategory[cat] || []).filter(matchesQuery);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="vctv-category">
            <h3 className="vctv-category-title">{cat} <span className="vctv-count">· {items.length}</span></h3>
            <div className="vctv-list">
              {items.map(({ key, label, tpl }) => {
                const isOpen = expandedKeys.has(key);
                const wgs = templateToWorkGroups(tpl);
                const totalMats = wgs.reduce((n, wg) => n + wg.materials.length, 0);
                const totalWorks = wgs.filter(wg => wg.work).length;
                return (
                  <div key={key} className={`vctv-card ${isOpen ? 'open' : ''}`}>
                    <div className="vctv-card-head" onClick={() => toggle(key)}>
                      <span className="vctv-arrow">{isOpen ? '▼' : '▶'}</span>
                      <span className="vctv-card-label">{label}</span>
                      <code className="vctv-card-key">{key}</code>
                      <span className="vctv-card-counts">{totalWorks} работ, {totalMats} материалов</span>
                    </div>
                    {isOpen && (
                      <div className="vctv-card-body">
                        <div className="vctv-cost-path">
                          <b>Путь затрат:</b> {tpl.costPath}
                        </div>
                        {wgs.map((wg, wi) => (
                          <div key={wi} className="vctv-workgroup">
                            {wg.work && (
                              <div className="vctv-work">
                                <span className="vctv-tag vctv-tag-work">работа</span>
                                <span className="vctv-work-name">{wg.work.name}</span>
                                <span className="vctv-unit">{wg.work.unit}</span>
                                {wg.work.noteGp && <span className="vctv-note-gp">прим. ГП: {wg.work.noteGp}</span>}
                              </div>
                            )}
                            {wg.materials.length > 0 && (
                              <table className="vctv-mat-table">
                                <thead>
                                  <tr>
                                    <th>Материал</th>
                                    <th>Ед.</th>
                                    <th>Тип</th>
                                    <th title="Коэфф. перевода">Коэфф. пер.</th>
                                    <th title="Коэфф. расхода">Коэфф. расх.</th>
                                    <th>Цена</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {wg.materials.map((m, mi) => (
                                    <tr key={mi} className={m.kind === 'вспомогат.' ? 'vctv-mat-sec' : 'vctv-mat-main'}>
                                      <td>{m.name}</td>
                                      <td>{m.unit}</td>
                                      <td>{m.kind || 'основн.'}</td>
                                      <td>{formatCoef(m.j)}</td>
                                      <td>{formatCoef(m.k)}</td>
                                      <td>{formatPrice(m.price)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
