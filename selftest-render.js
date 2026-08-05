// Covers the render path - the part that was never tested, and where "no charts" lived.
// Runs the dashboard's real render()/drawChart()/drawDonut()/drawRatio() in node against a
// minimal DOM shim, with Chart stubbed to record its config instead of drawing.
//   node selftest-render.js
const fs = require("fs"), assert = require("assert"), vm = require("vm");

const html = fs.readFileSync(__dirname + "/vendor-dashboard.html", "utf8").replace(/\r\n/g, "\n");
const lib = name => {
  const s = "/*LIB:" + name + ":START*/\n", e = "\n/*LIB:" + name + ":END*/";
  const i = html.indexOf(s), j = html.indexOf(e, i);
  assert(i > 0 && j > i, name + " not found - run: node verify-bundle.js");
  return html.slice(i + s.length, j);
};

/* ---------- DOM shim: only what render() actually touches ---------- */
const made = [];                    // every Chart the page tried to construct
const nodes = new Map();

function node(id){
  const n = {
    id, _html: "", hidden: false, textContent: "", scrollTop: 0, style: {}, dataset: {},
    className: "", classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    focus(){}, appendChild(c){ this.children.push(c); }, children: [],
    // Return throwaway stubs: the page attaches onclick handlers to these, and we only care
    // that render() completes, not that the handlers fire.
    querySelector: () => node("_q"), querySelectorAll: () => [node("_q1"), node("_q2")],
    insertAdjacentHTML(_, s){ this._html += s; register(s); },
    getContext: () => ({}), closest: () => null, addEventListener(){}
  };
  Object.defineProperty(n, "innerHTML", {
    get(){ return n._html; },
    // The contract under test: ids that render() emits must be the ids drawChart() looks up.
    set(v){ n._html = v; register(v); }
  });
  return n;
}
// crude on purpose - no HTML parser, just harvest the ids so lookups resolve
function register(markup){
  for (const m of String(markup).matchAll(/id="([^"]+)"/g))
    if (!nodes.has(m[1])) nodes.set(m[1], node(m[1]));
}
for (const id of ["filters", "body", "err", "dup", "src", "st", "tbl", "drop", "file", "clear"])
  nodes.set(id, node(id));

const ctx = vm.createContext({
  console,
  document: {
    getElementById: id => nodes.get(id) || null,
    createElement: () => node("_tmp"),
    querySelector: () => node("_d"), querySelectorAll: () => [],
    head: node("_head"), addEventListener(){}, activeElement: null
  },
  window: { addEventListener(){} },
  location: { search: "", protocol: "http:" },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  URLSearchParams: class { constructor(){} get(){ return null; } },
  FileReader: class { readAsArrayBuffer(){} },
  Chart: class {
    constructor(el, cfg){ made.push({ id: el && el.id, cfg }); }
    destroy(){}
  },
  setTimeout, fetch: () => Promise.reject(new Error("no network in the shim"))
});
vm.runInContext(lib("XLSX"), ctx);

/* ---------- run the page's own app script ---------- */
const a = html.indexOf('<script id="app">');
assert(a > 0, 'no <script id="app"> - the app block marker is gone');
const app = html.slice(a + '<script id="app">'.length, html.indexOf("</script>", a));
vm.runInContext(app + "\n;globalThis.__api = {render, load, filters, S, visible};", ctx);

let n = 0, bad = 0;
const t = (name, fn) => {
  try { fn(); n++; console.log("PASS  " + name); }
  catch (e) { bad++; console.log("FAIL  " + name + "\n      " + e.message); }
};
// load() clears filters by design (a new upload replaces everything), so filters go on
// afterwards and we re-render - the same order the UI does it in.
const draw = (file, filters) => {
  ctx.__buf = new Uint8Array(fs.readFileSync(__dirname + "/" + file));
  made.length = 0;
  vm.runInContext(`load(__buf, ${JSON.stringify(file)})`, ctx);
  if (filters){
    made.length = 0;
    vm.runInContext("filters = " + JSON.stringify(filters) + "; render();", ctx);
  }
  return made.slice();
};

/* ---------- the dummy workbook: every chart should have data ---------- */
const EXPECT = ["ordNos", "ordMw", "clrN", "clrM", "finPie", "coll", "fin", "boe"];
const all = draw("Dashboard 1 - DUMMY.xlsx");
const byId = id => all.find(c => c.id === "c_" + id);

t("render: constructs a chart for every spec", () => {
  const got = all.map(c => c.id.replace(/^c_/, ""));
  const miss = EXPECT.filter(e => !got.includes(e));
  assert.strictEqual(miss.length, 0, "never drawn: " + miss.join(", ") + " (drew: " + got.join(", ") + ")");
});
t("render: no chart drawn twice", () => {
  const ids = all.map(c => c.id);
  assert.strictEqual(ids.length, new Set(ids).size, "duplicates in " + ids.join(", "));
});
t("render: the doughnut is a doughnut", () => assert.strictEqual(byId("finPie").cfg.type, "doughnut"));
t("render: collection % is a horizontal bar", () => {
  assert.strictEqual(byId("coll").cfg.type, "bar");
  assert.strictEqual(byId("coll").cfg.options.indexAxis, "y");
});
t("render: the other six are vertical bars", () => {
  for (const id of ["ordNos", "ordMw", "clrN", "clrM", "fin", "boe"]){
    assert.strictEqual(byId(id).cfg.type, "bar", id);
    assert.notStrictEqual(byId(id).cfg.options.indexAxis, "y", id);
  }
});
t("render: every chart has at least one real datapoint", () => {
  for (const c of all){
    const pts = c.cfg.data.datasets.flatMap(d => d.data).filter(v => v != null);
    assert(pts.length > 0, c.id + " drew an empty chart");
  }
});
t("render: bar charts carry 9 categories", () => {
  for (const id of ["ordNos", "ordMw", "clrN", "clrM", "fin", "boe", "coll"])
    assert.strictEqual(byId(id).cfg.data.labels.length, 9, id);
});
t("render: doughnut slices sum to Amount Due", () => {
  const d = byId("finPie").cfg.data.datasets[0].data;
  assert.strictEqual(d.length, 2, "expected Received + Pending, no remainder slice");
  assert(Math.abs(d.reduce((x, y) => x + y, 0) - 4108500000) < 1e6, "sum was " + d.reduce((x, y) => x + y, 0));
});
t("render: collection % spans the overpaid case", () => {
  const d = byId("coll").cfg.data.datasets[0].data.filter(v => v != null);
  assert(Math.max(...d) > 100, "no value above 100%, max was " + Math.max(...d));
});
t("render: KPI values reach the markup", () => {
  const h = ctx.document.getElementById("body").innerHTML;
  for (const bit of ["418.18", "238.85", "179.32", "PO Quantity", "Amount Pending"])
    assert(h.includes(bit), "missing from KPI markup: " + bit);
});
t("render: the detail table gets a row per customer", () => {
  const h = ctx.document.getElementById("tbl").innerHTML;
  assert.strictEqual((h.match(/<tr>/g) || []).length, 10, "expected 1 header + 9 body rows");
});
t("render: no error banner on a clean run", () => {
  assert.strictEqual(ctx.document.getElementById("err").hidden, true,
    "err banner said: " + ctx.document.getElementById("err").innerHTML.slice(0, 200));
});

/* ---------- CSS: the hidden attribute must actually hide ----------
   The node shim has no CSS engine, so it cannot catch "element correctly marked hidden, but a
   stylesheet rule keeps it visible". This is the static check for that whole class of bug: it is
   what let .none{display:flex} cover every chart with the awaiting-data overlay. */
// Comments are stripped first: they discuss `display:none` in prose and would match the patterns.
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>")).replace(/\/\*[\s\S]*?\*\//g, "");

t("css: [hidden] is enforced against author display rules", () => {
  assert(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(css),
    "stylesheet needs [hidden]{display:none!important} - a UA rule loses to any author display rule");
});
t("css: the [hidden] guard precedes every rule that sets display", () => {
  const guard = css.search(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
  const first = css.search(/^[^@\n][^\n{]*\{[^}]*display\s*:(?!\s*none\s*!important)/m);
  assert(guard >= 0 && (first < 0 || guard < first),
    "a display rule at index " + first + " comes before the guard at " + guard);
});
t("css: every class toggled via .hidden survives the guard", () => {
  // classes/ids the app hides at runtime, paired with the selector the stylesheet uses
  for (const sel of [".none", ".msg", ".fpop"]){
    const rules = [...css.matchAll(new RegExp("\\" + sel + "\\s*\\{([^}]*)\\}", "g"))];
    for (const r of rules)
      if (/display\s*:/.test(r[1]))
        assert(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(css),
          sel + " sets display and would defeat the hidden attribute");
  }
});

/* ---------- filtering must narrow every chart together ---------- */
const one = draw("Dashboard 1 - DUMMY.xlsx", { "Customer Name": ["Ecozen"] });
t("filter: one customer leaves one category in every bar chart", () => {
  for (const id of ["ordNos", "ordMw", "clrN", "clrM", "fin", "boe", "coll"]){
    const c = one.find(x => x.id === "c_" + id);
    assert(c, id + " vanished under the filter");
    assert.deepStrictEqual(c.cfg.data.labels.join(), "Ecozen", id);
  }
});

/* ---------- the real workbook: empty sections must note, not draw ---------- */
const real = draw("Dashboard 1.xlsx");
t("real file: Dispatch Clearance draws no chart (columns are empty)", () => {
  for (const id of ["clrN", "clrM"])
    assert(!real.find(c => c.id === "c_" + id), id + " drew a chart from empty columns");
});
t("real file: its note explains why instead of leaving a blank card", () => {
  const note = ctx.document.getElementById("n_clrN");
  assert(note, "no note element for clrN");
  assert.strictEqual(note.hidden, false, "note stayed hidden");
  assert(/[Aa]waiting data/.test(note.textContent), "note said: " + note.textContent);
});
t("real file: Order Overview and Finance still draw", () => {
  for (const id of ["ordNos", "ordMw", "finPie", "coll", "fin", "boe"])
    assert(real.find(c => c.id === "c_" + id), id + " missing");
});
t("real file: doughnut shows the unrecorded remainder as a third slice", () => {
  const d = real.find(c => c.id === "c_finPie").cfg.data.datasets[0].data;
  assert.strictEqual(d.length, 3, "expected Received + Pending + Not yet recorded, got " + d.length);
});

console.log("\n" + n + " passed, " + bad + " failed");
process.exit(bad ? 1 : 0);
