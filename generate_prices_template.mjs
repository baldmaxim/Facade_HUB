import fs from 'fs';
import XLSX from 'xlsx-js-style';
import { TEMPLATES } from './src/lib/vorMatcher.js';

// Собираем уникальные (costPath, workName) со всех шаблонов
const rows = [];
const seen = new Set();

// Упорядоченный список шаблонов для более логичного вывода
const orderedKeys = [
  'spk_profile', 'spk_glass', 'spk_broneplenka', 'spk_hardware',
  'doors_entrance', 'doors_tambour',
  'glass_railing', 'glass_railing_molled', 'glass_canopy',
  'nvf_subsystem', 'insulation',
  'nvf_cladding_cassette', 'nvf_cladding_clinker', 'nvf_cladding_porcelain',
  'nvf_cladding_ceramic', 'nvf_cladding_natural_stone', 'nvf_cladding_akp',
  'nvf_cladding_fibrobeton', 'nvf_cladding_concrete_tile',
  'nvf_cladding_brick', 'nvf_cladding_fcp',
  'nvf_cladding_galvanized', 'nvf_cladding_arch_concrete',
  'wet_facade_insulation', 'wet_facade_finish', 'wet_facade_paint',
  'flashings', 'vent_grilles',
  'scaffolding', 'kmd_spk', 'kmd_nvf',
  'mockup',
];

// Нормализуем имя работы утеплителя — обобщаем "(180 мм)" → "(любая толщина)"
function normalizeWorkName(name) {
  if (/Утепление в \d+ слой?[яа]? \(\d+ мм\)/.test(name)) {
    return 'Утепление (любая толщина, 1 или 2 слоя)';
  }
  return name;
}

for (const key of orderedKeys) {
  const tpl = TEMPLATES[key];
  if (!tpl || !tpl.works || tpl.works.length === 0) continue;
  for (const w of tpl.works) {
    const nm = normalizeWorkName(w.name);
    const sig = tpl.costPath + '||' + nm;
    if (seen.has(sig)) continue;
    seen.add(sig);
    rows.push({
      costPath: tpl.costPath,
      work: nm,
      unit: w.unit,
      tplKey: key,
    });
  }
}

// Стили
const BORDER = {
  top: { style: 'thin', color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
  left: { style: 'thin', color: { rgb: 'CCCCCC' } },
  right: { style: 'thin', color: { rgb: 'CCCCCC' } },
};
const HEADER_STYLE = {
  fill: { fgColor: { rgb: 'E0E0E0' } },
  font: { bold: true, sz: 11 },
  alignment: { wrapText: true, vertical: 'center' },
  border: BORDER,
};
const CELL_STYLE = { font: { sz: 10 }, alignment: { wrapText: true, vertical: 'top' }, border: BORDER };
const PRICE_STYLE = { font: { sz: 10 }, fill: { fgColor: { rgb: 'FFFBE0' } }, border: BORDER };

const ws = {};
const HEADERS = ['Затрата на строительство (costPath)', 'Наименование работы', 'Ед. изм.', 'Цена за единицу, руб.', 'Ключ шаблона (служебное)'];
const COL_WIDTHS = [55, 60, 10, 18, 25];

for (let c = 0; c < HEADERS.length; c++) {
  ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: HEADERS[c], s: HEADER_STYLE };
}

rows.forEach((row, i) => {
  const r = i + 1;
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: row.costPath, s: CELL_STYLE };
  ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: row.work, s: CELL_STYLE };
  ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: row.unit, s: CELL_STYLE };
  ws[XLSX.utils.encode_cell({ r, c: 3 })] = { v: '', s: PRICE_STYLE };
  ws[XLSX.utils.encode_cell({ r, c: 4 })] = { v: row.tplKey, s: { ...CELL_STYLE, font: { sz: 9, color: { rgb: '888888' } } } };
});

ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: HEADERS.length - 1 } });
ws['!cols'] = COL_WIDTHS.map(w => ({ wch: w }));
ws['!rows'] = [{ hpx: 40 }, ...rows.map(() => ({ hpx: 28 }))];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Цены работ');

const out = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
fs.writeFileSync('prices_template.xlsx', out);

console.log(`Сгенерировано работ: ${rows.length}`);
console.log('Файл: prices_template.xlsx');
console.log('\nСтруктура:');
rows.forEach((r, i) => {
  console.log(`  ${(i + 1).toString().padStart(2)}. [${r.tplKey}] ${r.work.slice(0, 60)}`);
});
