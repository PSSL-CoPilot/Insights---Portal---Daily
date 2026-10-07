/**
 * Writes the workbook model as a client module, run before `dev` and `build`. The app imports it once
 * (one cached script) instead of receiving it inside every page payload, so a navigation no longer
 * re-downloads ~1 MB and every memoised calculation keeps working on the same object.
 */
import fs from "node:fs";
import path from "node:path";
import { loadDataModel } from "../lib/data/excelLoader";

const out = path.join(process.cwd(), "lib/data/model.generated.js");
// JSON.parse of one string literal is parsed much faster by browsers than an equivalent object literal.
fs.writeFileSync(out, `export default JSON.parse(${JSON.stringify(JSON.stringify(loadDataModel()))});\n`);
console.log(`[data] wrote ${path.relative(process.cwd(), out)}`);
