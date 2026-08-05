// Runs the dashboard's parseWorkbook against the real workbook, in node.
//   node selftest-parse.js [path to a different xlsx.full.min.js]
// (the browser's ?selftest covers the same ground plus chart rendering)
const fs = require("fs"), assert = require("assert"), vm = require("vm");

const html = fs.readFileSync(__dirname + "/vendor-dashboard.html", "utf8").replace(/\r\n/g, "\n");

// SheetJS is inlined in the dashboard, so run that exact copy - nothing separate to keep in sync.
// An explicit path still overrides, for trying a different SheetJS version.
const ctx = vm.createContext({ console });
if (process.argv[2]) vm.runInContext(fs.readFileSync(process.argv[2], "utf8"), ctx);
else {
  const s = "/*LIB:XLSX:START*/\n", e = "\n/*LIB:XLSX:END*/";
  const i = html.indexOf(s), j = html.indexOf(e, i);
  assert(i > 0 && j > i, "SheetJS not found in the dashboard - run: node verify-bundle.js");
  vm.runInContext(html.slice(i + s.length, j), ctx);
}

const a = html.indexOf("const norm ="), b = html.indexOf("/* ---------- charts spec ---------- */");
assert(a > 0 && b > a, "could not slice logic block out of the HTML");
const { parseWorkbook, donutParts, ratio } = vm.runInContext(
  "(function(){" + html.slice(a, b) + "\nreturn {parseWorkbook, donutParts, ratio};})()", ctx);
const XLSX = ctx.XLSX;

let n = 0, bad = 0;
const t = (name, fn) => {
  try { fn(); n++; console.log("PASS  " + name); }
  catch (e) { bad++; console.log("FAIL  " + name + "\n      " + e.message); }
};
const read = buf => parseWorkbook(XLSX.read(new Uint8Array(buf), { type: "array" }));

/* ---- 1. the real workbook ---- */
const P = read(fs.readFileSync(__dirname + "/Dashboard 1.xlsx"));
const K = P.K, row = c => P.rows.find(r => String(r[K.customer]).startsWith(c));

t("real: header row found by name, not index", () => assert.strictEqual(K.customer, "Customer Name"));
t("real: sheet located by scan", () => assert.strictEqual(P.sheet, "Sheet2"));
t("real: 9 rows", () => assert.strictEqual(P.rows.length, 9));
t("real: no duplicates in source", () => assert.strictEqual(P.dups.length, 0));
t("real: 22 columns mapped", () => assert.strictEqual(P.cols.length, 22));
t("real: Amara Raja PO Nos = 406505", () => assert.strictEqual(row("Amara")[K.poNos], 406505));
t("real: Amara Raja PO MW ~ 250.000575", () => assert(Math.abs(row("Amara")[K.poMw] - 250.000575) < 1e-6));
t("real: Amara Raja dispatched Nos = 228160", () => assert.strictEqual(row("Amara")[K.dispNos], 228160));
t("real: empty Stock is null, not 0", () => assert.strictEqual(row("Amara")[K.stockNos], null));
t("real: empty MDCC is null, not 0", () => assert.strictEqual(row("Amara")[K.mdccNos], null));
t("real: Amigo Green pending amount stays negative", () => assert(row("Amigo")[K.amtPend] < 0));
t("real: Ecozen WP range kept as text", () => assert.strictEqual(row("Ecozen")[K.wp], "500-540"));
t("real: name-only row survives with null metrics", () => {
  const s = row("Shakti");
  assert(s, "Shakti row missing"); assert.strictEqual(s[K.poNos], null); assert.strictEqual(s[K.sublead], "Sawan");
});
t("real: typo header 'Pending Quantoty (Nos)' mapped", () => assert(K.pendNos && row("Amara")[K.pendNos] === 178345));
t("real: typo header 'BOE Acceptance Recevied' mapped", () => assert.strictEqual(K.boeAcc, "BOE Acceptance Recevied"));
t("real: 'Amount Due ' trailing space mapped, label trimmed", () => assert.strictEqual(K.amtDue, "Amount Due"));
t("real: 'Clearance Given to Store(Nos)' matched by rule", () =>
  assert.strictEqual(K.clrNos, "Clearance Given to Store(Nos)"));
t("real: clearance MW column not present yet", () => assert(!K.clrMw));
t("real: every known numeric column typed num", () => {
  const c = P.cols.find(x => x.label === "PO Quantity (Nos)");
  assert.strictEqual(c.type, "num"); assert.strictEqual(c.fmt, "int");
});
t("real: all-empty Stock column still typed", () => {
  const c = P.cols.find(x => x.label === "Stock(Nos)");
  assert.strictEqual(c.type, "num"); assert.strictEqual(c.key, "stockNos");
});

/* ---- 1b. the finance doughnut, against the real numbers ---- */
const total = (rows, key) => {
  const v = rows.map(r => r[K[key]]).filter(x => typeof x === "number");
  return v.length ? v.reduce((x, y) => x + y, 0) : null;
};
const split = rows => donutParts(total(rows, "amtDue"),
  [{ lab: "Received", v: total(rows, "amtRecd") }, { lab: "Pending", v: total(rows, "amtPend") }],
  "Not yet recorded");
const cr = v => +(v / 1e7).toFixed(2);

t("donut: all customers is drawable", () => assert.strictEqual(split(P.rows).bad, false));
t("donut: total = due 353.77 Cr", () => assert.strictEqual(cr(total(P.rows, "amtDue")), 353.77));
t("donut: received 108.10 Cr", () => assert.strictEqual(cr(total(P.rows, "amtRecd")), 108.1));
t("donut: pending 188.14 Cr", () => assert.strictEqual(cr(total(P.rows, "amtPend")), 188.14));
t("donut: unrecorded remainder 57.53 Cr", () => assert.strictEqual(cr(split(P.rows).rest), 57.53));
t("donut: slices sum back to Amount Due", () => {
  const d = split(P.rows);
  assert(Math.abs(d.slices.reduce((x, s) => x + s.v, 0) - total(P.rows, "amtDue")) < 1e-6);
});
t("donut: remainder is exactly the 3 customers with no payment rows", () => {
  const noPay = P.rows.filter(r => r[K.amtDue] != null && r[K.amtRecd] == null && r[K.amtPend] == null);
  assert.strictEqual(noPay.length, 3);
  assert(Math.abs(noPay.reduce((x, r) => x + r[K.amtDue], 0) - split(P.rows).rest) < 1e-6);
});
t("donut: Amigo Green alone is not drawable (negative pending)", () => {
  const amigo = P.rows.filter(r => String(r[K.customer]).startsWith("Amigo"));
  assert.strictEqual(amigo.length, 1);
  assert.strictEqual(split(amigo).bad, true);
});
t("donut: Ecozen alone is drawable", () => {
  assert.strictEqual(split(P.rows.filter(r => String(r[K.customer]).startsWith("Ecozen"))).bad, false);
});
t("donut: a name-only customer is not drawable", () => {
  assert.strictEqual(split(P.rows.filter(r => String(r[K.customer]).startsWith("Shakti"))).bad, true);
});

/* ---- 1c. collection %, against the real numbers ---- */
const coll = c => { const r = row(c); return ratio(r[K.amtRecd], r[K.amtDue]); };
const pct1 = v => v == null ? null : +v.toFixed(1);

t("collection: Amara Raja 9.5%", () => assert.strictEqual(pct1(coll("Amara")), 9.5));
t("collection: Amigo Green 110.4% (overpaid, not clamped)", () => assert.strictEqual(pct1(coll("Amigo")), 110.4));
t("collection: Ecozen 91.4%", () => assert.strictEqual(pct1(coll("Ecozen")), 91.4));
t("collection: Crompton (AP) is null, not 0%", () => assert.strictEqual(coll("Crompton (AP)"), null));
t("collection: GK is null, not 0%", () => assert.strictEqual(coll("GK"), null));
t("collection: name-only Shakti is null", () => assert.strictEqual(coll("Shakti"), null));
t("collection: exactly 3 customers have a collectable %", () =>
  assert.strictEqual(P.rows.filter(r => ratio(r[K.amtRecd], r[K.amtDue]) != null).length, 3));
t("collection: the worst collector is also the largest exposure", () => {
  const withPct = P.rows.filter(r => ratio(r[K.amtRecd], r[K.amtDue]) != null);
  const worst = withPct.sort((x, y) =>
    ratio(x[K.amtRecd], x[K.amtDue]) - ratio(y[K.amtRecd], y[K.amtDue]))[0];
  const biggest = P.rows.filter(r => r[K.amtDue]).sort((x, y) => y[K.amtDue] - x[K.amtDue])[0];
  assert.strictEqual(worst[K.customer], biggest[K.customer]);
});

/* ---- 2. duplicate row hidden ---- */
const base = XLSX.utils.sheet_to_json(
  XLSX.read(fs.readFileSync(__dirname + "/Dashboard 1.xlsx"), { type: "buffer" }).Sheets["Sheet2"],
  { header: 1, defval: null, blankrows: false });
const dupAoa = base.concat([base[1].slice()]);        // repeat the Amara Raja row verbatim
const wbDup = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbDup, XLSX.utils.aoa_to_sheet(dupAoa), "Sheet2");
const D = read(XLSX.write(wbDup, { type: "array", bookType: "xlsx" }));
t("dup: repeated row hidden, 9 kept", () => {
  assert.strictEqual(D.rows.length, 9); assert.strictEqual(D.dups.length, 1);
});
t("dup: hidden row is the repeat", () => assert(String(D.dups[0][D.K.customer]).startsWith("Amara")));

/* ---- 3. new columns adopted with no code change ---- */
const aoa = [
  ["Customer Name", "Lead", "Sublead", "WP", "DCR/NDCR", "Freight Amount",
   "PO Quantity (Nos)", "Region", "Clearance given to store (Nos)", "Clearance to store MW"],
  ["A", "L1", "S1", "550", "DCR", 5000, 100, "North", 10, 0.5],
  ["B", "L1", "S2", "600", "DCR", 7000, 200, "South", 20, 1.5],
  ["C", "L2", "S2", "550", "NDCR", 9000, 300, "East", 30, 2.5],
  ["D", "L2", "S1", "615", "DCR", 11000, 400, "West", 40, 3.5],
  ["E", "L1", "S1", "525", "DCR", 13000, 500, "Central", 50, 4.5]
];
const wbNew = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbNew, XLSX.utils.aoa_to_sheet(aoa), "Rollup");
const N = read(XLSX.write(wbNew, { type: "array", bookType: "xlsx" }));
const col = l => N.cols.find(c => c.label === l);

t("new: renamed sheet still found", () => assert.strictEqual(N.sheet, "Rollup"));
t("new: 5 rows", () => assert.strictEqual(N.rows.length, 5));
t("new: columns inserted before PO did not shift it", () => assert.strictEqual(N.rows[0][N.K.poNos], 100));
t("new: Freight Amount kept, unknown, numeric", () => {
  const c = col("Freight Amount");
  assert(c, "column dropped"); assert.strictEqual(c.key, null); assert.strictEqual(c.type, "num");
});
t("new: Freight Amount guessed as currency", () => assert.strictEqual(col("Freight Amount").fmt, "cur"));
t("new: Freight Amount -> Other Metrics chart", () => {
  // join, not deepStrictEqual: arrays come from the vm realm so prototypes differ
  const other = N.cols.filter(c => c.type === "num" && !c.key).map(c => c.label);
  assert.strictEqual(other.join("|"), "Freight Amount");
});
t("new: Region is text, 5 distinct -> becomes a filter", () => {
  const c = col("Region");
  assert.strictEqual(c.type, "text");
  const d = new Set(N.rows.map(r => r[c.label]).filter(v => v != null)).size;
  assert(d === 5 && d <= 12, "distinct " + d);
});
t("new: Region not charted", () => assert(!N.cols.some(c => c.label === "Region" && c.type === "num")));
t("new: Clearance (Nos) matched by rule", () => assert.strictEqual(N.K.clrNos, "Clearance given to store (Nos)"));
t("new: Clearance MW matched by rule", () => assert.strictEqual(N.K.clrMw, "Clearance to store MW"));
t("new: every column reaches the table", () => assert.strictEqual(N.cols.length, aoa[0].length));

/* ---- 4. bad input ---- */
const wbBad = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbBad, XLSX.utils.aoa_to_sheet([["Foo", "Bar"], [1, 2]]), "Nope");
t("bad: sheet without Customer Name throws a clear error", () => {
  assert.throws(() => read(XLSX.write(wbBad, { type: "array", bookType: "xlsx" })), /Customer Name/);
});

console.log("\n" + n + " passed, " + bad + " failed");
process.exit(bad ? 1 : 0);
