import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/leury.rosario/Documents/Pitch Chart./outputs/01a0da33-76ec-7783-9a02-f30a26d9a076";
const outputPath = `${outputDir}/TeteloVargas_Top_Lineup.xlsx`;

const players = [
  ["Martinez, Michael", "TIG_L", "Right", 1, 1],
  ["Moreno, Angel", "TIG_L", "Right", 1, 2],
  ["Poche, Jose", "TIG_L", "Right", 1, 3],
  ["Toledo, Keylin", "TIG_L", "Right", 1, 4],
  ["Castillo, Yojansel", "TIG_L", "Right", 2, 1],
  ["Avila, Kyle", "TIG_L", "Right", 2, 2],
  ["Brito, Daril", "TIG_L", "Right", 2, 3],
  ["Javier, Angel", "TIG_L", "Right", 2, 4],
  ["Montilla, Jose", "TIG_L", "Right", 2, 5],
  ["Quesada, Alejandro", "TIG_L", "Right", 2, 6],
  ["Javier, Estarlin", "TIG_L", "Right", 5, 8],
  ["Leal, Jean", "TIG_L", "Left", 6, 1],
  ["Jeronimo, Justin", "TIG_L", "Undefined", 6, 2],
];

// Fixed shuffled assignment so the delivered lineup remains stable when reopened.
const positions = ["CF", "SS", "1B", "RF", "C", "3B", "LF", "2B", "DH", "RF", "SS", "C", "CF"];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Top Lineup");
sheet.showGridLines = false;
sheet.tabColor = "#17365D";

sheet.getRange("A2:F2").merge();
sheet.getRange("A2").values = [["Top-half batting lineup"]];
sheet.getRange("A3:F3").merge();
sheet.getRange("A3").values = [["TeteloVargas • May 28, 2026 • positions assigned randomly"]];
sheet.getRange("A5:F5").values = [["Order", "Player", "Pos", "Bats", "First inning", "PA in inning"]];

const rows = players.map((p, i) => [i + 1, p[0], positions[i], p[2], p[3], p[4]]);
sheet.getRange(`A6:F${5 + rows.length}`).values = rows;

const used = sheet.getRange(`A2:F${5 + rows.length}`);
used.format.font = { name: "Arial", size: 10, color: "#1F2937" };
used.format.verticalAlignment = "center";

sheet.getRange("A2:F2").format = {
  font: { name: "Arial", size: 16, bold: true, color: "#17365D" },
  rowHeight: 25,
};
sheet.getRange("A3:F3").format = {
  font: { name: "Arial", size: 10, italic: true, color: "#5B6573" },
  rowHeight: 20,
};
sheet.getRange("A5:F5").format = {
  fill: "#17365D",
  font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  rowHeight: 24,
  borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
};
sheet.getRange(`A6:F${5 + rows.length}`).format.rowHeight = 22;
sheet.getRange(`A6:F${5 + rows.length}`).format.borders = {
  insideHorizontal: { style: "thin", color: "#D9E2F3" },
  bottom: { style: "thin", color: "#9FBAD0" },
};
sheet.getRange(`A6:A${5 + rows.length}`).format.horizontalAlignment = "center";
sheet.getRange(`C6:F${5 + rows.length}`).format.horizontalAlignment = "center";

for (let row = 6; row <= 5 + rows.length; row += 2) {
  sheet.getRange(`A${row}:F${row}`).format.fill = "#EEF3F8";
}

sheet.getRange("A2:F2").format.borders = { bottom: { style: "thin", color: "#9FBAD0" } };
sheet.getRange("A:A").format.columnWidth = 9;
sheet.getRange("B:B").format.columnWidth = 25;
sheet.getRange("C:C").format.columnWidth = 9;
sheet.getRange("D:D").format.columnWidth = 11;
sheet.getRange("E:F").format.columnWidth = 13;
sheet.freezePanes.freezeRows(5);

workbook.recalculate();

const inspection = await workbook.inspect({
  kind: "table",
  range: `Top Lineup!A2:F${5 + rows.length}`,
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 8,
});
console.log(inspection.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "Top Lineup", range: `A1:F${6 + rows.length}`, scale: 2, format: "png" });
await fs.writeFile(`${outputDir}/lineup_preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`SAVED ${outputPath}`);
