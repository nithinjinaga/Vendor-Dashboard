// Builds "Dashboard 1 - DUMMY.xlsx" from Dashboard 1.xlsx so every chart has data to draw.
// The real workbook is only ever READ - never written to.
//   node make-dummy.js <path-to-xlsx.full.min.js>
const fs = require("fs"), vm = require("vm");

// SheetJS comes from the dashboard's own inlined copy - no separate file needed.
const ctx = vm.createContext({ console });
if (process.argv[2]) vm.runInContext(fs.readFileSync(process.argv[2], "utf8"), ctx);
else {
  const html = fs.readFileSync(__dirname + "/vendor-dashboard.html", "utf8").replace(/\r\n/g, "\n");
  const s = "/*LIB:XLSX:START*/\n", e = "\n/*LIB:XLSX:END*/";
  const i = html.indexOf(s), j = html.indexOf(e, i);
  if (i < 0 || j < 0) { console.error("SheetJS not found in the dashboard - run: node verify-bundle.js"); process.exit(2); }
  vm.runInContext(html.slice(i + s.length, j), ctx);
}
const XLSX = ctx.XLSX;

const SRC = __dirname + "/Dashboard 1.xlsx", OUT = __dirname + "/Dashboard 1 - DUMMY.xlsx";
const wb = XLSX.read(fs.readFileSync(SRC), { type: "buffer" });
const aoa = XLSX.utils.sheet_to_json(wb.Sheets["Sheet2"], { header: 1, defval: null, blankrows: false });
const hi = aoa.findIndex(r => Array.isArray(r) && r.some(c => String(c).trim() === "Customer Name"));
const hdr = aoa[hi].map(h => (h == null ? "" : String(h).trim()));
const at = name => { const i = hdr.indexOf(name); if (i < 0) throw new Error("missing column: " + name); return i; };

// Dummy figures per customer. Quantities in Nos; MW is derived below so the two stay consistent.
// Deliberately keeps Amigo Green overpaid - that edge case is real and worth seeing rendered.
const D = {
  "Amara Raja":          { wp: 615, po: 406505, disp: 228160, stock: 42000, mdcc: 210000, clr: 168000, due: 1988590961.6, recd: 189570158.4,  boe: 1135435832.96, boeAcc: 340630749.9 },
  "Amigo Green":         { wp: 550, po: 1860,   disp: 620,    stock: 300,   mdcc: 620,    clr: 480,    due: 7243607.25,   recd: 8000000 },
  "Crompton (AP)":       { wp: 525, po: 40000,  disp: 37696,  stock: 1500,  mdcc: 36000,  clr: 34500,  due: 411248281.6,  recd: 370123453.4 },
  "Crompton (GJ)":       { wp: 600, po: 3720,   disp: 1860,   stock: 900,   mdcc: 1860,   clr: 1400,   due: 20291856,     recd: 10145928 },
  "Ecozen":              { wp: 527.3, po: 144320, disp: 87464, stock: 12000, mdcc: 84000, clr: 71000,  due: 966549679.07, recd: 883400238, boe: 250000000, boeAcc: 125000000 },
  "GK (June revised PO)":{ wp: 535, po: 20088,  disp: 12811,  stock: 2100,  mdcc: 12000,  clr: 9800,   due: 143794507.3,  recd: 100656155.1 },
  "Shakti":              { wp: 535, po: 60000,  disp: 24000,  stock: 5000,  mdcc: 22000,  clr: 18000,  due: 321000000,    recd: 96300000, boe: 150000000, boeAcc: 60000000 },
  "Solar Square Mono":   { wp: 540, po: 30000,  disp: 18000,  stock: 2500,  mdcc: 17000,  clr: 15000,  due: 162000000,    recd: 145800000 },
  "Solar Square Topcon": { wp: 585, po: 15000,  disp: 3000,   stock: 800,   mdcc: 2800,   clr: 2000,   due: 87750000,     recd: 8775000 }
};

// Insert the Clearance MW column the real sheet doesn't have yet, right after Stock(MW).
// Also proves an inserted column doesn't shift anything, since the parser matches on names.
const CLR_MW = "Clearance Given to Store(MW)";
const insertAt = at("Stock(MW)") + 1;
const newHdr = hdr.slice(0, insertAt).concat([CLR_MW], hdr.slice(insertAt));

const mw = (nos, wp) => nos == null ? null : +(nos * wp / 1e6).toFixed(6);
const out = [];
for (let i = 0; i < hi; i++) out.push(aoa[i] ? aoa[i].slice() : []);   // keep the blank lead-in rows
out.push(newHdr);

aoa.slice(hi + 1).forEach(src => {
  const name = src && src[at("Customer Name")];
  if (name == null || String(name).trim() === "") return;
  const d = D[String(name).trim()];
  const row = (src || []).slice();
  while (row.length < hdr.length) row.push(null);

  if (d) {
    const pend = d.po - d.disp, set = (col, v) => { row[at(col)] = v; };
    set("WP", String(name).trim() === "Ecozen" ? "500-540" : d.wp);
    set("PO Quantity (Nos)", d.po);        set("Dispatch quantity (Nos)", d.disp);
    set("Pending Quantoty (Nos)", pend);   set("Stock(Nos)", d.stock);
    set("MDCC Received(Nos)", d.mdcc);     set("Clearance Given to Store(Nos)", d.clr);
    set("PO Quantity (MW)", mw(d.po, d.wp));       set("Dispatch quantity (MW)", mw(d.disp, d.wp));
    set("Pending Quantoty (MW)", mw(pend, d.wp));  set("Stock(MW)", mw(d.stock, d.wp));
    set("MDCC Received(MW)", mw(d.mdcc, d.wp));
    // hdr is trimmed on read, so these lookups use the trimmed names even though the
    // sheet's own headers carry trailing spaces.
    set("Amount Due", d.due);   set("Amount Received", d.recd);
    set("Amount Pending", +(d.due - d.recd).toFixed(4));
    set("BOE Filed Against LC", d.boe ?? null);
    set("BOE Acceptance Recevied", d.boe ? d.boeAcc : null);
    set("BOE Acceptance Pending", d.boe ? +(d.boe - d.boeAcc).toFixed(4) : null);
  }
  // splice the new MW column in at the same index as the header
  row.splice(insertAt, 0, d ? mw(d.clr, d.wp) : null);
  out.push(row);
});

const nwb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(nwb, XLSX.utils.aoa_to_sheet(out), "Sheet2");
fs.writeFileSync(OUT, Buffer.from(XLSX.write(nwb, { type: "array", bookType: "xlsx" })));

console.log("wrote Dashboard 1 - DUMMY.xlsx");
console.log("  source untouched:", fs.statSync(SRC).size, "bytes,", fs.statSync(SRC).mtime.toISOString());
console.log("  columns:", newHdr.filter(Boolean).length, " rows:", out.length - hi - 1);
