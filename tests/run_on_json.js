// Runs the engine on a JSON input (stdin) and prints the JSON result (stdout).
// Used by tests/musicxml_demo.py and tools/wiki_examples.py. With "op": "analyze"
// it runs analyze() instead of generate().
var fs = require("fs"), L = require("./lib/qmljs.js");
var E = L.engine(), I18n = L.i18n();
var input = JSON.parse(fs.readFileSync(0, "utf8"));
var lang = input.lang || "en";
if (input.op === "analyze") {                 // { op: "analyze", ...input of analyze() }
    var an = E.analyze(input);
    an.findings.forEach(function (f) { f.text = I18n.finding(lang, f); });
    process.stdout.write(JSON.stringify(an));
    process.exit(0);
}
var t0 = Date.now();
var res = E.generate(input);
// texts for the console, in the requested language
res.report.keyName = I18n.keyName(lang, res.report.key);
res.report.findings.forEach(function (f) { f.text = I18n.finding(lang, f); });
res.report.details = res.report.details.map(function (d) {
    return I18n.tr(lang, "parallel.item", { kind: I18n.tr(lang, d.interval === 5 ? "parallel.fifths" : "parallel.octaves"),
                                            voice: I18n.tr(lang, "voice." + d.voice), bar: "tick " + d.tick });
});
res.report.ms = Date.now() - t0;
process.stdout.write(JSON.stringify({ items: res.items, report: res.report }));
