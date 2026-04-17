/**
 * analyze_muza.mjs
 * Compares reference VOR (Муза готовая.xlsx) against auto-generated output (test_output_muza.xlsx).
 * Focus: structural correctness — correct templates, j/k coefficients, cost paths.
 * Ignores prices and actual quantities.
 */

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
import fs from 'fs';

const REF_FILE = 'Муза готовая.xlsx';
const OUT_FILE = 'test_output_muza.xlsx';
const REPORT_FILE = 'muza_comparison.txt';

// ─── Parse a VOR Excel into structured positions ─────────────────────────────
function parseVor(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const positions = [];
  let currentPos = null;

  const clean = v => (v === null || v === undefined || v === '-' || v === '') ? '' : String(v).trim();
  const num = v => {
    const n = parseFloat(String(v || '').replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const colA = clean(r[0]);
    const colB = clean(r[1]);
    const colC = clean(r[2]);  // cost path
    const colD = clean(r[3]);  // наличие
    const colE = clean(r[4]);  // тип элемента
    const colF = clean(r[5]);  // тип материала
    const colG = clean(r[6]);  // наименование
    const colH = clean(r[7]);  // ед. изм.
    const colI = clean(r[8]);  // кол-во заказчика
    const colJ = num(r[9]);    // коэфф. перевода j
    const colK = num(r[10]);   // коэфф. расхода k
    const colL = clean(r[11]); // кол-во ГП

    const eType = colE.toLowerCase();

    if (eType === 'суб-раб' || eType === 'суб-мат') {
      if (!currentPos) continue;
      const row = {
        type: eType,
        costPath: colC,
        kind: colF || '',
        name: colG,
        unit: colH,
        j: colJ,
        k: colK,
      };
      if (eType === 'суб-раб') currentPos.works.push(row);
      else currentPos.materials.push(row);
      continue;
    }

    // Is it a position row? Has a numeric-like code in colA or colB that matches
    // colI (quantity) or colL
    const hasQty = (colI !== '' && colI !== '-') || (colL !== '' && colL !== '-');
    const isNumericCode = /^\d/.test(colA) || /^\d/.test(colB);
    const isHeaderRow = colG.toLowerCase() === 'наименование';

    if (isHeaderRow) continue;

    if (colG && colG.length > 2 && isNumericCode) {
      // Could be position or section-header row
      // Section headers have no qty (colI and colL empty)
      const isSection = !hasQty && (colG.includes('КОРПУС') || /^\d+\.\d*$/.test(colA));

      currentPos = {
        code: colA || colB,
        name: colG,
        unit: colH,
        qtyCustomer: colI,
        qtyGp: colL,
        works: [],
        materials: [],
        rowIdx: i,
      };
      positions.push(currentPos);
    }
  }

  return positions;
}

// ─── Normalize name for fuzzy comparison ─────────────────────────────────────
function normName(s) {
  return (s || '').toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[«»""]/g, '"')
    .replace(/\t|\r|\n/g, ' ')
    .trim()
    .slice(0, 60);
}

// ─── Simple similarity: are these the "same" work/material? ──────────────────
function sameWork(a, b) {
  const na = normName(a.name);
  const nb = normName(b.name);
  // Exact match
  if (na === nb) return true;
  // Prefix match (first 30 chars)
  if (na.slice(0, 30) === nb.slice(0, 30)) return true;
  return false;
}

function sameMaterial(a, b) {
  const na = normName(a.name);
  const nb = normName(b.name);
  if (na === nb) return true;
  if (na.slice(0, 30) === nb.slice(0, 30)) return true;
  return false;
}

// ─── Compare cost paths (prefix match up to first "/" ) ──────────────────────
function costPathSection(cp) {
  return (cp || '').split('/')[0].trim().toLowerCase();
}

function sameCostPath(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  // Normalize: trim, compare first 40 chars
  const na = (a || '').trim().toLowerCase().slice(0, 40);
  const nb = (b || '').trim().toLowerCase().slice(0, 40);
  return na === nb;
}

// ─── Compare positions ───────────────────────────────────────────────────────
function comparePosition(pos, refPos, outPos) {
  const issues = [];
  const good = [];

  // Works comparison
  const refWorks = refPos ? refPos.works : [];
  const outWorks = outPos ? outPos.works : [];

  // Unique work types in reference (by name+costPath prefix)
  const refWorkKeys = refWorks.map(w => `${normName(w.name)}|${costPathSection(w.costPath)}`);
  const outWorkKeys = outWorks.map(w => `${normName(w.name)}|${costPathSection(w.costPath)}`);

  // Find missing works (in ref but not in out)
  for (const rw of refWorks) {
    const key = `${normName(rw.name)}|${costPathSection(rw.costPath)}`;
    const found = outWorks.find(ow => sameWork(rw, ow));
    if (found) {
      // Check cost path
      if (!sameCostPath(rw.costPath, found.costPath)) {
        issues.push(`  WRONG costPath for work "${rw.name.slice(0,50)}":  ref="${rw.costPath.slice(0,60)}"  out="${found.costPath.slice(0,60)}"`);
      } else {
        good.push(`  OK work: "${rw.name.slice(0,50)}"`);
      }
    } else {
      issues.push(`  MISSING work: "${rw.name.slice(0,50)}" (costPath: ${rw.costPath.slice(0,50)})`);
    }
  }

  // Extra works (in out but not in ref)
  for (const ow of outWorks) {
    const found = refWorks.find(rw => sameWork(rw, ow));
    if (!found) {
      issues.push(`  EXTRA work: "${ow.name.slice(0,50)}" (costPath: ${ow.costPath.slice(0,50)})`);
    }
  }

  // Materials comparison
  const refMats = refPos ? refPos.materials : [];
  const outMats = outPos ? outPos.materials : [];

  // Group by semantic name (first 30 chars) to find categories
  for (const rm of refMats) {
    const found = outMats.find(om => sameMaterial(rm, om));
    if (found) {
      const diffs = [];
      if (rm.j !== null && found.j !== null && Math.abs((rm.j || 0) - (found.j || 0)) > 0.001) {
        diffs.push(`j: ref=${rm.j} out=${found.j}`);
      }
      if (rm.k !== null && found.k !== null && Math.abs((rm.k || 0) - (found.k || 0)) > 0.001) {
        diffs.push(`k: ref=${rm.k} out=${found.k}`);
      }
      if (!sameCostPath(rm.costPath, found.costPath)) {
        diffs.push(`costPath: ref="${rm.costPath.slice(0,50)}" out="${found.costPath.slice(0,50)}"`);
      }
      if (rm.kind && found.kind && rm.kind !== found.kind) {
        diffs.push(`kind: ref=${rm.kind} out=${found.kind}`);
      }
      if (diffs.length > 0) {
        issues.push(`  DIFF mat "${rm.name.slice(0,45)}": ${diffs.join(', ')}`);
      } else {
        good.push(`  OK mat: "${rm.name.slice(0,45)}"`);
      }
    } else {
      issues.push(`  MISSING mat: "${rm.name.slice(0,50)}" [${rm.kind}] j=${rm.j} k=${rm.k} (costPath: ${rm.costPath.slice(0,40)})`);
    }
  }

  // Extra materials
  for (const om of outMats) {
    const found = refMats.find(rm => sameMaterial(rm, om));
    if (!found) {
      issues.push(`  EXTRA mat: "${om.name.slice(0,50)}" [${om.kind}] j=${om.j} k=${om.k}`);
    }
  }

  return { issues, good };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('Reading reference file...');
const refPositions = parseVor(REF_FILE);
console.log(`Reference positions: ${refPositions.length}`);

console.log('Reading output file...');
const outPositions = parseVor(OUT_FILE);
console.log(`Output positions: ${outPositions.length}`);

// Build lookup by code
const refByCode = new Map();
for (const p of refPositions) {
  if (p.code) refByCode.set(p.code, p);
}
const outByCode = new Map();
for (const p of outPositions) {
  if (p.code) outByCode.set(p.code, p);
}

// ─── Generate report ─────────────────────────────────────────────────────────
const lines = [];
const push = s => lines.push(s);

push('='.repeat(80));
push('VOR COMPARISON REPORT: Муза готовая.xlsx vs test_output_muza.xlsx');
push(`Generated: ${new Date().toISOString()}`);
push('='.repeat(80));
push('');

// Summary counts
const refPricedCodes = refPositions.filter(p => p.works.length > 0 || p.materials.length > 0).map(p => p.code);
const outPricedCodes = outPositions.filter(p => p.works.length > 0 || p.materials.length > 0).map(p => p.code);

push(`TOTALS:`);
push(`  Reference: ${refPositions.length} positions, ${refPricedCodes.length} have works/materials`);
push(`  Output:    ${outPositions.length} positions, ${outPricedCodes.length} have works/materials`);
push('');

// Find positions in ref but not in output
const refCodes = new Set(refPositions.map(p => p.code).filter(Boolean));
const outCodes = new Set(outPositions.map(p => p.code).filter(Boolean));

const missingInOut = [...refCodes].filter(c => !outCodes.has(c));
const extraInOut = [...outCodes].filter(c => !refCodes.has(c));

push(`POSITION CODE ALIGNMENT:`);
push(`  In reference not in output: ${missingInOut.length} → ${missingInOut.slice(0,10).join(', ')}`);
push(`  In output not in reference: ${extraInOut.length} → ${extraInOut.slice(0,10).join(', ')}`);
push('');

// Per-position comparison
push('─'.repeat(80));
push('DETAILED POSITION COMPARISON');
push('─'.repeat(80));

let totalIssues = 0;
let totalGood = 0;
let posWithIssues = 0;
let posOk = 0;

// All codes we want to compare
const allCodes = [...new Set([...refCodes, ...outCodes])].sort();

for (const code of allCodes) {
  const refPos = refByCode.get(code);
  const outPos = outByCode.get(code);

  if (!refPos) {
    // In output but not in reference - unusual
    push('');
    push(`[${code}] EXTRA IN OUTPUT: ${(outPos?.name || '').slice(0,60)}`);
    push(`  works=${outPos.works.length} mats=${outPos.materials.length}`);
    continue;
  }

  const refHasContent = refPos.works.length > 0 || refPos.materials.length > 0;
  const outHasContent = outPos && (outPos.works.length > 0 || outPos.materials.length > 0);

  if (!refHasContent && !outHasContent) continue; // both empty (headers) - skip

  push('');
  push(`[${code}] ${refPos.name.slice(0,60)} | unit=${refPos.unit}`);

  if (refHasContent && !outPos) {
    push(`  !! POSITION MISSING IN OUTPUT (ref has ${refPos.works.length} works, ${refPos.materials.length} mats)`);
    posWithIssues++;
    totalIssues++;
    continue;
  }

  if (refHasContent && !outHasContent) {
    push(`  !! OUTPUT POSITION HAS NO WORKS/MATS (ref has ${refPos.works.length} works, ${refPos.materials.length} mats)`);
    posWithIssues++;
    totalIssues++;
    continue;
  }

  if (!refHasContent && outHasContent) {
    push(`  !! OUTPUT HAS CONTENT BUT REF DOESN'T (out has ${outPos.works.length} works, ${outPos.materials.length} mats) — EXTRA CONTENT`);
    posWithIssues++;
    totalIssues++;
    continue;
  }

  const { issues, good } = comparePosition(code, refPos, outPos);

  if (issues.length === 0) {
    push(`  OK (${good.length} works/mats matched)`);
    posOk++;
    totalGood += good.length;
  } else {
    push(`  ref: ${refPos.works.length}W + ${refPos.materials.length}M  |  out: ${outPos.works.length}W + ${outPos.materials.length}M`);
    for (const issue of issues) push(issue);
    posWithIssues++;
    totalIssues += issues.length;
    totalGood += good.length;
  }
}

push('');
push('='.repeat(80));
push('SUMMARY OF ISSUES');
push('='.repeat(80));
push(`Positions OK:           ${posOk}`);
push(`Positions with issues:  ${posWithIssues}`);
push(`Total issue lines:      ${totalIssues}`);
push(`Total OK items:         ${totalGood}`);
push('');

// ─── Categorize issues ───────────────────────────────────────────────────────
const allIssueLines = lines.filter(l => l.includes('MISSING') || l.includes('EXTRA') || l.includes('DIFF') || l.includes('WRONG'));

const missingWorks = allIssueLines.filter(l => l.includes('MISSING work'));
const missingMats = allIssueLines.filter(l => l.includes('MISSING mat'));
const extraWorks = allIssueLines.filter(l => l.includes('EXTRA work'));
const extraMats = allIssueLines.filter(l => l.includes('EXTRA mat'));
const diffMats = allIssueLines.filter(l => l.includes('DIFF mat'));
const wrongPath = allIssueLines.filter(l => l.includes('WRONG costPath'));

push('─'.repeat(80));
push('ISSUE CATEGORIES:');
push(`  Missing works:    ${missingWorks.length}`);
push(`  Missing mats:     ${missingMats.length}`);
push(`  Extra works:      ${extraWorks.length}`);
push(`  Extra mats:       ${extraMats.length}`);
push(`  Wrong j/k/kind:   ${diffMats.length}`);
push(`  Wrong costPaths:  ${wrongPath.length}`);
push('');

// Top issues by frequency
const matNameFreq = {};
for (const l of missingMats) {
  const m = l.match(/MISSING mat: "([^"]+)"/);
  if (m) matNameFreq[m[1]] = (matNameFreq[m[1]] || 0) + 1;
}
const topMissingMats = Object.entries(matNameFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);

push('TOP MISSING MATERIALS (most frequent across positions):');
for (const [name, cnt] of topMissingMats) {
  push(`  x${cnt}  "${name}"`);
}
push('');

const workNameFreq = {};
for (const l of missingWorks) {
  const m = l.match(/MISSING work: "([^"]+)"/);
  if (m) workNameFreq[m[1]] = (workNameFreq[m[1]] || 0) + 1;
}
const topMissingWorks = Object.entries(workNameFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);

push('TOP MISSING WORKS:');
for (const [name, cnt] of topMissingWorks) {
  push(`  x${cnt}  "${name}"`);
}
push('');

const extraMatFreq = {};
for (const l of extraMats) {
  const m = l.match(/EXTRA mat: "([^"]+)"/);
  if (m) extraMatFreq[m[1]] = (extraMatFreq[m[1]] || 0) + 1;
}
const topExtraMats = Object.entries(extraMatFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);

push('TOP EXTRA MATERIALS (in our output but not in reference):');
for (const [name, cnt] of topExtraMats) {
  push(`  x${cnt}  "${name}"`);
}
push('');

const extraWorkFreq = {};
for (const l of extraWorks) {
  const m = l.match(/EXTRA work: "([^"]+)"/);
  if (m) extraWorkFreq[m[1]] = (extraWorkFreq[m[1]] || 0) + 1;
}
const topExtraWorks = Object.entries(extraWorkFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);

push('TOP EXTRA WORKS:');
for (const [name, cnt] of topExtraWorks) {
  push(`  x${cnt}  "${name}"`);
}
push('');

push('─'.repeat(80));
push('DIFF DETAILS (j/k/kind/costPath differences):');
for (const l of diffMats) push(l);
for (const l of wrongPath) push(l);
push('');

// Write report
const report = lines.join('\n');
fs.writeFileSync(REPORT_FILE, report, 'utf8');
console.log(`\nReport saved to: ${REPORT_FILE}`);
console.log(`Total lines: ${lines.length}`);
