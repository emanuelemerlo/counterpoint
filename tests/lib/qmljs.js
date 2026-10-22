// Carica in node i file JavaScript del plugin scritti per QML (".pragma library",
// ".import "x.js" as X"), come li vede MuseScore. Ogni file esporta con module.exports.
var fs = require("fs"), path = require("path");
var cache = {};
function load(file) {
    file = path.resolve(file);
    if (cache[file]) return cache[file];
    var dir = path.dirname(file), imports = [];
    var src = fs.readFileSync(file, "utf8")
        .replace(/^\.pragma library\s*$/m, "")
        .replace(/^\.import\s+"([^"]+)"\s+as\s+(\w+)\s*$/mg, function (m, rel, name) {
            imports.push(name);
            return "var " + name + " = __load(" + JSON.stringify(path.join(dir, rel)) + ");";
        });
    var M = { exports: {} };
    new Function("module", "__load", src)(M, load);
    cache[file] = M.exports;
    return M.exports;
}
var root = path.join(__dirname, "..", "..", "plugin", "Contrappunto");
module.exports = {
    load: load,
    engine: function () { return load(path.join(root, "contrappunto_engine.js")); },
    i18n: function () { return load(path.join(root, "i18n", "i18n.js")); },
    root: root
};
