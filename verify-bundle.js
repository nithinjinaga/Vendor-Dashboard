// Confirms the two inlined libraries are byte-identical to the official builds and still parse.
// Run after any edit that touches vendor-dashboard.html:  node verify-bundle.js
const fs = require("fs"), crypto = require("crypto"), vm = require("vm");

const KNOWN = {
  CHART: "sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ",
  XLSX:  "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw"
};

// Normalise line endings: an editor re-saving the file as CRLF must not read as corruption,
// and the official builds ship with LF, which is what the known hashes are taken over.
const html = fs.readFileSync(__dirname + "/vendor-dashboard.html", "utf8").replace(/\r\n/g, "\n");

function lib(name){
  const s = "/*LIB:" + name + ":START*/\n", e = "\n/*LIB:" + name + ":END*/";
  const i = html.indexOf(s), j = html.indexOf(e, i);
  if (i < 0 || j < 0) throw new Error(name + ": markers missing");
  return html.slice(i + s.length, j);
}

let bad = 0;
for (const name of Object.keys(KNOWN)){
  try {
    const js = lib(name);
    const h = "sha384-" + crypto.createHash("sha384").update(Buffer.from(js, "utf8")).digest("base64");
    const ok = h === KNOWN[name];
    if (!ok) bad++;
    console.log(`${name.padEnd(6)} ${String(js.length).padStart(7)} chars  ` +
      (ok ? "hash matches the official build" : "HASH MISMATCH\n       got " + h));
    new vm.Script(js);
    console.log("       parses clean");
  } catch(e){ bad++; console.log(name + "  FAILED: " + e.message); }
}

// the dashboard's own code, past the two library blocks
const a = html.indexOf('<script id="app">'), b = html.indexOf("</script>", a);
if (a < 0) { bad++; console.log('app    MISSING <script id="app">'); }
else {
  const app = html.slice(a + '<script id="app">'.length, b);
  try { new vm.Script(app); console.log(`app    ${String(app.length).padStart(7)} chars  parses clean`); }
  catch(e){ bad++; console.log("app    PARSE ERROR: " + e.message); }
}

console.log(bad ? "\nPROBLEM - " + bad + " check(s) failed" : "\nbundle intact");
process.exit(bad ? 1 : 0);
