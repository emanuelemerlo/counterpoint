// Translation check:  node tests/check_i18n.js
// - every language file has the same keys as en.js (the reference), with the same
//   {placeholders} and, for words that change with a number, a plural form;
// - every key used by the plugin and by the engine exists;
// - the QML has no user-visible text left outside tr().
var fs = require("fs"), path = require("path"), L = require("./lib/qmljs.js");
var I18n = L.i18n(), E = L.engine();
var errors = [], warnings = [];
function err(m) { errors.push(m); }
function warn(m) { warnings.push(m); }

var langs = I18n.LANGUAGES, ref = langs.filter(function (l) { return l.code === I18n.FALLBACK; })[0];
function holes(v) {
    var s = typeof v === "object" ? Object.keys(v).map(function (k) { return v[k]; }).join(" ") : String(v);
    var m = s.match(/\{\w+\}/g) || [];
    return m.filter(function (x, i) { return m.indexOf(x) === i; }).sort().join(",");
}
langs.forEach(function (l) {
    if (!l.code || !l.name) err(l.code + ": code and name are required");
    if (!l.notes || l.notes.length !== 7) err(l.code + ": notes must list the 7 note names, from C to B");
    Object.keys(ref.strings).forEach(function (k) {
        if (!l.strings.hasOwnProperty(k)) { err(l.code + ": missing key " + k); return; }
        var a = ref.strings[k], b = l.strings[k];
        if ((typeof a === "object") !== (typeof b === "object")) err(l.code + ": " + k + " must " + (typeof a === "object" ? "" : "not ") + "have plural forms");
        if (typeof b === "object" && !b.hasOwnProperty("other")) err(l.code + ": " + k + " needs at least the form \"other\"");
        if (holes(a) !== holes(b)) err(l.code + ": " + k + " placeholders " + (holes(b) || "none") + " instead of " + (holes(a) || "none"));
        if (typeof b === "string" && !b.trim()) err(l.code + ": " + k + " is empty");
    });
    Object.keys(l.strings).forEach(function (k) { if (!ref.strings.hasOwnProperty(k)) err(l.code + ": key " + k + " does not exist in en.js"); });
});

// keys used by the engine
E.RULES.forEach(function (r) { if (!ref.strings["rule." + r]) err("engine rule without text: rule." + r); });
if (!ref.strings["rule.leap.overOctave"]) err("missing rule.leap.overOctave");
var engineSrc = fs.readFileSync(path.join(L.root, "contrappunto_engine.js"), "utf8");
(engineSrc.match(/throw "error\.\w+"/g) || []).forEach(function (t) {
    var k = t.slice(7, -1);
    if (!ref.strings[k]) err("engine error without text: " + k);
});

// keys used by the plugin
var qml = fs.readFileSync(path.join(L.root, "contrappunto.qml"), "utf8");
var used = {};
(qml.match(/\b(?:tr|plural)\("([\w.:]+)"/g) || []).forEach(function (m) { used[m.replace(/^.*\("/, "").replace(/"$/, "")] = 1; });
function addDyn(prefix, list) { list.forEach(function (x) { used[prefix + x] = 1; }); }
addDyn("species.", ["free", "1:1", "2:1", "4:1", "sus", "florid"]);
addDyn("position.", ["auto", "above", "middle", "below"]);
addDyn("register.", ["auto", "soprano", "alto", "tenor", "bass"]);
addDyn("role.", ["above", "middle", "below"]);
addDyn("roleGoes.", ["above", "middle", "below"]);
addDyn("analysis.role.", ["above", "middle", "below"]);
addDyn("interval.", [1, 2, 3, 4, 5, 6, 7]);
addDyn("voice.", ["melody", "bass"]);
(qml.match(/\{ id: "(\w+)", lo:/g) || []).forEach(function (m) { used["instrument." + m.match(/"(\w+)"/)[1]] = 1; });
// keys written as literals elsewhere (tr(cond ? "a" : "b"))
Object.keys(ref.strings).forEach(function (k) { if (qml.indexOf('"' + k + '"') >= 0) used[k] = 1; });
Object.keys(used).forEach(function (k) {
    if (/\.$/.test(k)) return;                       // tr("species." + v): checked through the lists above
    if (!ref.strings.hasOwnProperty(k)) err("the plugin uses a key missing from en.js: " + k);
});
Object.keys(ref.strings).forEach(function (k) {
    if (!used[k] && k.indexOf("rule.") !== 0 && k.indexOf("error.no") !== 0 && k !== "key.major" && k !== "key.minor" && k !== "plugin.description")
        warn("key apparently unused: " + k);
});

// texts left in the QML outside tr()
var lines = qml.split("\n");
lines.forEach(function (ln, i) {
    var code = ln.replace(/\/\/.*$/, "");
    if (/\b(text|title|ToolTip\.text|placeholderText)\s*:\s*"[^"]*[A-Za-zÀ-ú]{2}/.test(code) && !/title:\s*"Contrappunto"/.test(code))
        err("contrappunto.qml:" + (i + 1) + ": text not translated: " + code.trim());
    if (/setStatus\(\s*"/.test(code)) err("contrappunto.qml:" + (i + 1) + ": message not translated: " + code.trim());
    if (/model:\s*\[\s*"[^"]*[A-Za-z]/.test(code)) err("contrappunto.qml:" + (i + 1) + ": list not translated: " + code.trim());
});

warnings.forEach(function (w) { console.log("warning: " + w); });
errors.forEach(function (e) { console.log("ERROR: " + e); });
console.log(langs.map(function (l) { return l.code + " (" + Object.keys(l.strings).length + " keys)"; }).join(", ") +
            ": " + errors.length + " errors, " + warnings.length + " warnings");
process.exit(errors.length ? 1 : 0);
