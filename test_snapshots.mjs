// Снапшот-тесты: проверяют что матчинг шаблонов не изменился.
// Сохраняют для каждой позиции каких шаблонов она получила.
// При запуске сравнивают текущий результат с сохранёнными снапшотами.
//
// Использование:
//   node test_snapshots.mjs           — прогнать все тесты и сравнить со снапшотами
//   node test_snapshots.mjs update    — пересохранить снапшоты (после проверенных изменений)

import fs from 'fs';
import path from 'path';
import { parseEmptyVor } from './src/lib/vorExcelGenerator.js';
import { matchPosition, isHeader, classifyRowRole } from './src/lib/vorMatcher.js';

const SNAPSHOTS_DIR = 'snapshots';
const UPDATE_MODE = process.argv[2] === 'update';

const FILES = [
  { file: 'Событие 6.2 тест.xlsx',   snapshot: 'sobytie.json' },
  { file: 'Муза_Финал.xlsx',         snapshot: 'muza.json' },
  { file: 'Финал3_Сокольники.xlsx',  snapshot: 'sokolniki.json' },
  { file: 'ВГК 5.xlsx',              snapshot: 'vgk5.json' },
  { file: 'ВГК5 реновация  тест.xlsx', snapshot: 'vgk5_renov.json' },
  { file: 'Тест Адмирал.xlsx',       snapshot: 'admiral.json' },
];

function buildSnapshot(filePath) {
  const buf = fs.readFileSync(filePath);
  const parsed = parseEmptyVor(new Uint8Array(buf));
  const allPositions = parsed.sections.flatMap(s => s.positions);

  const result = {
    file: path.basename(filePath),
    sections: parsed.sections.map(section => ({
      name: section.name,
      positions: section.positions.map(pos => {
        const hdr = isHeader(pos, allPositions, {});
        const role = classifyRowRole(pos.name);
        const templates = hdr ? [] : matchPosition(pos.name, pos.noteCustomer || '');
        return {
          code: pos.code || '',
          name: (pos.name || '').substring(0, 80),
          role,
          isHeader: hdr,
          templates,
        };
      }),
    })),
  };
  return result;
}

function diffSnapshots(current, saved) {
  const diffs = [];
  const curSecs = current.sections;
  const savSecs = saved.sections;

  // Проверяем структуру разделов
  if (curSecs.length !== savSecs.length) {
    diffs.push(`× Разное число секций: current=${curSecs.length} vs snapshot=${savSecs.length}`);
  }

  const maxSecs = Math.max(curSecs.length, savSecs.length);
  for (let si = 0; si < maxSecs; si++) {
    const cs = curSecs[si];
    const ss = savSecs[si];
    if (!cs) { diffs.push(`× Секция "${ss.name}" пропала`); continue; }
    if (!ss) { diffs.push(`× Новая секция "${cs.name}"`); continue; }
    if (cs.name !== ss.name) {
      diffs.push(`× Секция переименована: "${ss.name}" -> "${cs.name}"`);
    }
    const maxPos = Math.max(cs.positions.length, ss.positions.length);
    for (let pi = 0; pi < maxPos; pi++) {
      const cp = cs.positions[pi];
      const sp = ss.positions[pi];
      if (!cp) { diffs.push(`× [${ss.name}] позиция ${sp.code} пропала: ${sp.name.slice(0,40)}`); continue; }
      if (!sp) { diffs.push(`× [${cs.name}] новая позиция ${cp.code}: ${cp.name.slice(0,40)}`); continue; }
      const ct = JSON.stringify(cp.templates);
      const st = JSON.stringify(sp.templates);
      if (ct !== st) {
        diffs.push(`× [${cs.name}] ${cp.code || '(-)'} "${cp.name.slice(0,50)}"`);
        diffs.push(`    было:   ${st}`);
        diffs.push(`    стало:  ${ct}`);
      }
    }
  }
  return diffs;
}

let anyDiffs = false;

for (const { file, snapshot } of FILES) {
  const filePath = path.resolve(process.cwd(), file);
  const snapshotPath = path.resolve(process.cwd(), SNAPSHOTS_DIR, snapshot);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠  ${file} — файл не найден, пропускаю`);
    continue;
  }

  let current;
  try {
    current = buildSnapshot(filePath);
  } catch (err) {
    console.log(`× ${file} — ошибка парсинга: ${err.message}`);
    anyDiffs = true;
    continue;
  }

  if (UPDATE_MODE || !fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, JSON.stringify(current, null, 2), 'utf8');
    const action = UPDATE_MODE ? 'обновлён' : 'создан';
    console.log(`✓ ${file} — снапшот ${action} (${snapshot})`);
    continue;
  }

  const saved = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const diffs = diffSnapshots(current, saved);
  if (diffs.length === 0) {
    const total = current.sections.reduce((n, s) => n + s.positions.length, 0);
    console.log(`✓ ${file} — без изменений (${total} позиций)`);
  } else {
    anyDiffs = true;
    console.log(`\n× ${file} — ${diffs.length} расхождений:`);
    diffs.slice(0, 30).forEach(d => console.log('  ' + d));
    if (diffs.length > 30) console.log(`  ... ещё ${diffs.length - 30}`);
  }
}

console.log('');
if (anyDiffs) {
  console.log('ИТОГ: × есть расхождения. Если изменения намеренные — запусти "node test_snapshots.mjs update"');
  process.exit(1);
} else {
  console.log('ИТОГ: ✓ все снапшоты совпадают');
}
