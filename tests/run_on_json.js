// Esegue il motore su un input JSON (stdin) e stampa il risultato JSON (stdout).
// Usato da tests/musicxml_demo.py.
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "../plugin/Contrappunto/contrappunto_engine.js"), "utf8")
            .replace(/^\.pragma library\s*/, "");
var M = { exports: {} };
new Function("module", src)(M);
var input = JSON.parse(fs.readFileSync(0, "utf8"));
var t0 = Date.now();
var res = M.exports.generate(input);
res.report.ms = Date.now() - t0;
process.stdout.write(JSON.stringify({ items: res.items, report: res.report }));
