import fs from 'fs';
import path from 'path';
import { parseEmptyVor, generateFilledVor } from './src/lib/vorExcelGenerator.js';

const inputPath = path.resolve(process.cwd(), 'ВГК5 реновация  тест.xlsx');
const outputPath = path.resolve(process.cwd(), 'test_output_vgk5_renov.xlsx');

console.log(`Reading: ${inputPath}`);
const uint8 = new Uint8Array(fs.readFileSync(inputPath));

console.log('\nParsing empty VOR...');
const parsed = parseEmptyVor(uint8);

console.log(`\nSections:  ${parsed.stats.totalSections}`);
console.log(`Positions: ${parsed.stats.totalPositions}`);

console.log('\n--- Sections & Positions ---');
for (const section of parsed.sections) {
  console.log(`\n[${section.name}] (${section.positions.length} positions)`);
  for (const pos of section.positions) {
    const note = (pos.noteCustomer || '').slice(0, 50);
    const name = pos.name.slice(0, 80);
    console.log(`  ${(pos.code || '-').padEnd(12)} | ${name.padEnd(80)} | qty=${String(pos.qty).padEnd(8)} | note=${note}`);
  }
}

console.log('\n\nGenerating filled VOR...');
const result = generateFilledVor(parsed, {});

const s = result.stats;
console.log('\n=== STATISTICS ===');
console.log(`VOR Style:            ${s.vorStyle}`);
console.log(`Total positions:      ${s.totalPositions}`);
console.log(`Headers (not priced): ${s.totalHeaders}`);
console.log(`Matched:              ${s.totalMatched}`);
console.log(`Works inserted:       ${s.totalWorks}`);
console.log(`Materials inserted:   ${s.totalMaterials}`);
console.log(`Total rows (output):  ${s.totalRows}`);

if (s.unmatched.length === 0) {
  console.log('\nUnmatched: none');
} else {
  console.log(`\nUnmatched (${s.unmatched.length}):`);
  for (const u of s.unmatched) console.log(`  x ${u}`);
}

const arrayBuf = await result.blob.arrayBuffer();
fs.writeFileSync(outputPath, Buffer.from(arrayBuf));
console.log(`\nSaved to: ${outputPath}`);
