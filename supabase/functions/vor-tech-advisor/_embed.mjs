import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, "encyclopedia.md"), "utf-8");

// Эскейп для template literal: \, `, ${
const escaped = md
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const ts =
  "// Auto-generated from encyclopedia.md by _embed.mjs. DO NOT EDIT MANUALLY.\n" +
  "// Re-run: `node supabase/functions/vor-tech-advisor/_embed.mjs` after editing the .md file.\n" +
  "export const ENCYCLOPEDIA = `" + escaped + "`;\n";

writeFileSync(join(here, "encyclopedia.ts"), ts, "utf-8");
console.log("encyclopedia.ts written, length =", ts.length);
