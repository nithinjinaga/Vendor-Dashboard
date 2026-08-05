// Runs the dashboard's pure logic (no SheetJS/Chart.js needed) straight out of the HTML.
const fs = require("fs"), assert = require("assert");
const html = fs.readFileSync("C:/Nithin/Vendor tracker/vendor-dashboard.html", "utf8");
const a = html.indexOf("const norm ="), b = html.indexOf("/* ---------- charts spec ---------- */");
assert(a > 0 && b > a, "could not slice logic block out of the HTML");
// new Function keeps the block in its own scope — a direct eval leaks its function
// declarations into module scope and collides with the destructuring below.
const { norm, knownFor, guessFmt, cell, dedupe, fmt, donutParts, pickSel, kpiUnit, ratio, axisFmt } =
  new Function(html.slice(a, b) + "\nreturn {norm, knownFor, guessFmt, cell, dedupe, fmt," +
    " donutParts, pickSel, kpiUnit, ratio, axisFmt};")();

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("PASS  " + name); };

t("fmt currency crore", () => assert.strictEqual(fmt(1988590961.6, "cur"), "₹198.86 Cr"));
t("fmt currency lakh negative", () => assert.strictEqual(fmt(-756392.75, "cur"), "-₹7.56 L"));
t("fmt currency plain", () => assert.strictEqual(fmt(7243, "cur"), "₹7,243"));
t("fmt null dash", () => assert.strictEqual(fmt(null, "cur"), "—"));
t("fmt zero is not dash", () => assert.strictEqual(fmt(0, "cur"), "₹0"));
t("fmt indian grouping", () => assert.strictEqual(fmt(406505, "int"), "4,06,505"));
t("fmt mw 2dp", () => assert.strictEqual(fmt(250.000575, "mw"), "250.00"));
t("fmt text passthrough", () => assert.strictEqual(fmt("500-540", null), "500-540"));

t("known: typo Quantoty maps to pendNos", () => assert.strictEqual(knownFor(norm("Pending Quantoty (Nos)")).k, "pendNos"));
t("known: correct spelling maps too", () => assert.strictEqual(knownFor(norm("Pending Quantity (Nos)")).k, "pendNos"));
t("known: typo Recevied maps to boeAcc", () => assert.strictEqual(knownFor(norm("BOE Acceptance Recevied")).k, "boeAcc"));
t("known: trailing space header", () => assert.strictEqual(knownFor(norm("Amount Due ")).k, "amtDue"));
t("known: clearance nos by rule", () => assert.strictEqual(knownFor(norm("Clearance given to store (Nos)")).k, "clrNos"));
t("known: clearance mw by rule", () => assert.strictEqual(knownFor(norm("Clearance Given To Store MW")).k, "clrMw"));
t("known: unrecognised header returns null", () => assert.strictEqual(knownFor(norm("Freight Amount")), null));

t("guessFmt amount to currency", () => assert.strictEqual(guessFmt(norm("Freight Amount")), "cur"));
t("guessFmt mw", () => assert.strictEqual(guessFmt(norm("Extra Capacity MW")), "mw"));
t("guessFmt percent", () => assert.strictEqual(guessFmt(norm("Dispatch Percent")), "pct"));
t("guessFmt fallback int", () => assert.strictEqual(guessFmt(norm("Cartons")), "int"));

t("cell blank to null", () => assert.strictEqual(cell(""), null));
t("cell null stays null", () => assert.strictEqual(cell(null), null));
t("cell numeric string to number", () => assert.strictEqual(cell("406505"), 406505));
t("cell comma number to number", () => assert.strictEqual(cell("4,06,505"), 406505));
t("cell WP range stays text", () => assert.strictEqual(cell("500-540"), "500-540"));
t("cell zero survives", () => assert.strictEqual(cell(0), 0));

const K = { customer: "Customer Name", wp: "WP", dcr: "DCR/NDCR" };
const row = (c, w, d) => ({ "Customer Name": c, WP: w, "DCR/NDCR": d });
t("dedupe hides exact repeat", () => {
  const r = dedupe([row("X", "550", "DCR"), row("X", "550", "DCR")], K);
  assert.strictEqual(r.kept.length, 1); assert.strictEqual(r.dups.length, 1);
});
t("dedupe keeps Crompton AP vs GJ", () => {
  const r = dedupe([row("Crompton (AP)", "525", "DCR"), row("Crompton (GJ)", "600", "DCR")], K);
  assert.strictEqual(r.kept.length, 2); assert.strictEqual(r.dups.length, 0);
});
t("dedupe same customer different WP kept", () => {
  const r = dedupe([row("X", "550", "DCR"), row("X", "600", "DCR")], K);
  assert.strictEqual(r.kept.length, 2);
});
t("dedupe first occurrence wins", () => {
  const first = row("X", "550", "DCR"); first.tag = "keep";
  const r = dedupe([first, row("X", "550", "DCR")], K);
  assert.strictEqual(r.kept[0].tag, "keep");
});
t("dedupe ignores case and spacing", () => {
  const r = dedupe([row("Amara Raja", "615", "N DCR"), row("amara  raja", "615", "ndcr")], K);
  assert.strictEqual(r.dups.length, 1);
});

// donut split: slices must sum to the parent, never double-count it
const P = (t, r, p) => donutParts(t, [{ lab: "Received", v: r }, { lab: "Pending", v: p }], "Not yet recorded");
t("donut: slices sum to the total", () => {
  const d = P(353.77, 108.10, 188.14);
  assert.strictEqual(d.bad, false);
  assert(Math.abs(d.slices.reduce((a, s) => a + s.v, 0) - 353.77) < 1e-9);
});
t("donut: remainder is total minus recorded parts", () => {
  assert(Math.abs(P(353.77, 108.10, 188.14).rest - 57.53) < 1e-9);
});
t("donut: fully accounted total leaves no remainder slice", () => {
  const d = P(300, 100, 200);
  assert.strictEqual(d.rest, 0);
  assert.strictEqual(d.slices.filter(s => s.v).length, 2);
});
t("donut: float noise does not become a slice", () => assert.strictEqual(P(300, 100, 199.9999997).rest, 0));
t("donut: negative part is not drawable", () => assert.strictEqual(P(0.72, 0.80, -0.08).bad, true));
t("donut: negative remainder is not drawable", () => assert.strictEqual(P(100, 80, 90).bad, true));
t("donut: missing total is not drawable", () => assert.strictEqual(P(null, 10, 20).bad, true));
t("donut: zero total is not drawable", () => assert.strictEqual(P(0, null, null).bad, true));
t("donut: parent alone still draws as one remainder slice", () => {
  const d = P(50, null, null);
  assert.strictEqual(d.bad, false); assert.strictEqual(d.rest, 50);
});

// collection %: guard the divide, and never turn "no data" into 0%
t("ratio: normal case", () => assert.strictEqual(ratio(50, 200), 25));
t("ratio: over 100 is kept, not clamped", () =>
  assert.strictEqual(+ratio(8000000, 7243607.25).toFixed(1), 110.4));
t("ratio: null numerator is no data, not 0%", () => assert.strictEqual(ratio(null, 200), null));
t("ratio: zero denominator is no data, not Infinity", () => assert.strictEqual(ratio(50, 0), null));
t("ratio: negative denominator is no data", () => assert.strictEqual(ratio(50, -200), null));
t("ratio: zero numerator is a real 0%", () => assert.strictEqual(ratio(0, 200), 0));
t("ratio: both null is no data", () => assert.strictEqual(ratio(null, null), null));
t("axisFmt: percent axis carries the sign", () => assert.strictEqual(axisFmt(100, "pct"), "100%"));
t("fmt: percent to 1dp", () => assert.strictEqual(fmt(110.43, "pct"), "110.4%"));

// KPI unit toggle: quantities switch column and format, money never does
const QTY = { lab: "PO Quantity", nos: "poNos", mw: "poMw" }, MONEY = { lab: "Amount Pending", cur: "amtPend" };
t("unit: MW reads the MW column", () => assert.strictEqual(kpiUnit(QTY, "mw").key, "poMw"));
t("unit: Nos reads the Nos column", () => assert.strictEqual(kpiUnit(QTY, "nos").key, "poNos"));
t("unit: MW formats to 2dp", () => assert.strictEqual(fmt(250.000575, kpiUnit(QTY, "mw").fmt), "250.00"));
t("unit: Nos formats with Indian grouping", () =>
  assert.strictEqual(fmt(406505, kpiUnit(QTY, "nos").fmt), "4,06,505"));
t("unit: suffix names the unit", () => {
  assert.strictEqual(kpiUnit(QTY, "mw").suf, " (MW)");
  assert.strictEqual(kpiUnit(QTY, "nos").suf, " (Nos)");
});
t("unit: money ignores the toggle entirely", () => {
  for (const u of ["mw", "nos"]) {
    const r = kpiUnit(MONEY, u);
    assert.strictEqual(r.key, "amtPend"); assert.strictEqual(r.fmt, "cur"); assert.strictEqual(r.suf, "");
  }
});
t("unit: money still renders as rupees under Nos", () =>
  assert.strictEqual(fmt(1881413851.52, kpiUnit(MONEY, "nos").fmt), "₹188.14 Cr"));

// Shift-click reducer: plain click replaces, Shift toggles
t("pick: plain click replaces the whole selection", () =>
  assert.deepStrictEqual(pickSel(["Ecozen", "GK"], "Amara Raja", false), ["Amara Raja"]));
t("pick: plain click on an already-selected value keeps just it", () =>
  assert.deepStrictEqual(pickSel(["Ecozen", "GK"], "GK", false), ["GK"]));
t("pick: shift+click adds", () =>
  assert.deepStrictEqual(pickSel(["Amara Raja"], "Ecozen", true), ["Amara Raja", "Ecozen"]));
t("pick: shift+click builds up three", () => {
  let s = pickSel([], "A", false);
  s = pickSel(s, "B", true); s = pickSel(s, "C", true);
  assert.deepStrictEqual(s, ["A", "B", "C"]);
});
t("pick: shift+click on a selected value removes it", () =>
  assert.deepStrictEqual(pickSel(["A", "B", "C"], "B", true), ["A", "C"]));
t("pick: shift-removing the last value yields empty = all", () =>
  assert.deepStrictEqual(pickSel(["A"], "A", true), []));
t("pick: does not mutate the input array", () => {
  const cur = ["A"]; pickSel(cur, "B", true); assert.deepStrictEqual(cur, ["A"]);
});

// multi-select filter predicate: empty selection means all, never none
const vis = (rows, filters) => rows.filter(r => Object.entries(filters).every(([lab, sel]) =>
  !sel || !sel.length || sel.includes(String(r[lab]))));
const R = [{ c: "Amara Raja" }, { c: "Ecozen" }, { c: "GK" }];
t("filter: empty selection shows all", () => assert.strictEqual(vis(R, { c: [] }).length, 3));
t("filter: one selected shows one", () => assert.strictEqual(vis(R, { c: ["Amara Raja"] }).length, 1));
t("filter: two selected shows two", () => assert.strictEqual(vis(R, { c: ["Amara Raja", "GK"] }).length, 2));
t("filter: unmatched selection shows none", () => assert.strictEqual(vis(R, { c: ["Nope"] }).length, 0));

console.log("\n" + n + " passed, 0 failed");
