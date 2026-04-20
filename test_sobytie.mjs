import fs from 'fs';
import path from 'path';
import { parseEmptyVor, generateFilledVor } from './src/lib/vorExcelGenerator.js';
import { loadWorkPrices } from './src/lib/vorPriceLoader.js';

const inputPath = path.resolve(process.cwd(), 'Событие 6.2 тест.xlsx');
const pricesPath = path.resolve(process.cwd(), 'prices_sobytie.xlsx');
const outputPath = path.resolve(process.cwd(), 'test_output_sobytie.xlsx');

console.log(`Reading: ${inputPath}`);
const fileBuffer = fs.readFileSync(inputPath);
const uint8 = new Uint8Array(fileBuffer);

// Загружаем прайс если файл есть
let workPrices = null;
if (fs.existsSync(pricesPath)) {
  console.log(`Loading prices: ${pricesPath}`);
  const pb = fs.readFileSync(pricesPath);
  workPrices = loadWorkPrices(new Uint8Array(pb));
  console.log(`  Загружено шаблонов с ценами: ${workPrices.size}`);
}

console.log('\nParsing empty VOR...');
const parsed = parseEmptyVor(uint8);

console.log(`\nSections:  ${parsed.stats.totalSections}`);
console.log(`Positions: ${parsed.stats.totalPositions}`);

console.log('\n\nGenerating filled VOR...');
// Донстрой: расцениваем все позиции с объёмом (и родителей, и дочерних)
const result = generateFilledVor(parsed, { priceAllWithQty: true, workPrices });

const s = result.stats;
console.log('\n=== STATISTICS ===');
console.log(`VOR Style:           ${s.vorStyle}`);
console.log(`Total positions:     ${s.totalPositions}`);
console.log(`Headers (not priced):${s.totalHeaders}`);
console.log(`Matched:             ${s.totalMatched}`);
console.log(`Works inserted:      ${s.totalWorks}`);
console.log(`Materials inserted:  ${s.totalMaterials}`);
console.log(`Work prices filled:  ${s.totalWorkPricesFilled || 0}`);
console.log(`Total rows (output): ${s.totalRows}`);

if (s.unmatched.length === 0) {
  console.log('\nUnmatched: none');
} else {
  console.log(`\nUnmatched (${s.unmatched.length}):`);
  for (const u of s.unmatched) {
    console.log(`  x ${u}`);
  }
}

const arrayBuf = await result.blob.arrayBuffer();
fs.writeFileSync(outputPath, Buffer.from(arrayBuf));
console.log(`\nSaved to: ${outputPath}`);
