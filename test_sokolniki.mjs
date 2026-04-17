import fs from 'fs';
import path from 'path';
import { parseEmptyVor, generateFilledVor } from './src/lib/vorExcelGenerator.js';

const inputPath = path.resolve(process.cwd(), 'Финал3_Сокольники.xlsx');
const outputPath = path.resolve(process.cwd(), 'test_output_sokolniki.xlsx');

// ─── Читаем файл ──────────────────────────────────────────────────────
console.log(`Reading: ${inputPath}`);
const fileBuffer = fs.readFileSync(inputPath);
const uint8 = new Uint8Array(fileBuffer);

// ─── Парсим пустой ВОР ───────────────────────────────────────────────
console.log('\nParsing empty VOR...');
const parsed = parseEmptyVor(uint8);

console.log(`\nSections:  ${parsed.stats.totalSections}`);
console.log(`Positions: ${parsed.stats.totalPositions}`);

console.log('\n--- Sections & Positions ---');
for (const section of parsed.sections) {
  console.log(`\n[${section.name}] (${section.positions.length} positions)`);
  for (const pos of section.positions) {
    const note = (pos.noteCustomer || '').slice(0, 40);
    const name = pos.name.slice(0, 70);
    console.log(`  ${(pos.code || '-').padEnd(12)} | ${name.padEnd(70)} | qty=${String(pos.qty).padEnd(8)} | note=${note}`);
  }
}

// ─── Генерируем заполненный ВОР ──────────────────────────────────────
console.log('\n\nGenerating filled VOR...');
const result = generateFilledVor(parsed);

// ─── Статистика ───────────────────────────────────────────────────────
const s = result.stats;
console.log('\n=== STATISTICS ===');
console.log(`VOR Style:           ${s.vorStyle}`);
console.log(`Total positions:     ${s.totalPositions}`);
console.log(`Headers (not priced):${s.totalHeaders}`);
console.log(`Matched:             ${s.totalMatched}`);
console.log(`Works inserted:      ${s.totalWorks}`);
console.log(`Materials inserted:  ${s.totalMaterials}`);
console.log(`Total rows (output): ${s.totalRows}`);

if (s.unmatched.length === 0) {
  console.log('\nUnmatched: none');
} else {
  console.log(`\nUnmatched (${s.unmatched.length}):`);
  for (const u of s.unmatched) {
    console.log(`  x ${u}`);
  }
}

// ─── Сохраняем результат ─────────────────────────────────────────────
const arrayBuf = await result.blob.arrayBuffer();
fs.writeFileSync(outputPath, Buffer.from(arrayBuf));
console.log(`\nSaved to: ${outputPath}`);
