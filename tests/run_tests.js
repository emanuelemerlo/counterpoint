// Collaudo del motore fuori da MuseScore:  node tests/run_tests.js [seme]
// Carica plugin/Contrappunto/contrappunto_engine.js (senza la riga ".pragma library").
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "../plugin/Contrappunto/contrappunto_engine.js"), "utf8")
            .replace(/^\.pragma library\s*/, "");
var Module = { exports: {} };
new Function("module", src)(Module);
var E = Module.exports;

var DUR = { w: 1920, "h.": 1440, h: 960, "q.": 720, q: 480, "e.": 360, e: 240, s: 120 };
var STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var LET = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
var LET_TPC = [14, 16, 18, 13, 15, 17, 19];

// "C5:q D#4:e r:h"  ->  eventi { tick, dur, notes }
function parse(str, start) {
    var t = start || 0, out = [];
    str.trim().split(/\s+/).forEach(function (tok) {
        var parts = tok.split(":"), d = DUR[parts[1]];
        if (!d) throw "durata sconosciuta " + tok;
        if (parts[0] !== "r") {
            var notes = parts[0].split("+").map(function (n) {
                var m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
                var alt = m[2] === "#" ? 1 : (m[2] === "b" ? -1 : 0);
                var midi = (parseInt(m[3]) + 1) * 12 + STEP[m[1]] + alt;
                return { midi: midi, tpc: LET_TPC[LET[m[1]]] + 7 * alt, tieBack: false };
            });
            out.push({ tick: t, dur: d, notes: notes });
        }
        t += d;
    });
    return { events: out, end: t };
}
function measures(end, num, den, pickup) {
    var len = num * 1920 / den, out = [], t = 0, first = true;
    if (pickup) { out.push({ tick: 0, len: pickup, num: num, den: den, isFirst: true }); t = pickup; first = false; }
    for (; t < end; t += len) { out.push({ tick: t, len: len, num: num, den: den, isFirst: first }); first = false; }
    return out;
}
var PCN = ["Do", "Do#", "Re", "Mib", "Mi", "Fa", "Fa#", "Sol", "Lab", "La", "Sib", "Si"];
function name(it) { return it.midi === null ? "—" : E.tpcName(it.tpc) + (Math.floor(it.midi / 12) - 1); }

var CASES = [
    { title: "Inno alla gioia – Do maggiore 4/4, melodia + basso",
      mel: "E5:q E5:q F5:q G5:q G5:q F5:q E5:q D5:q C5:q C5:q D5:q E5:q E5:q. D5:e D5:h " +
           "E5:q E5:q F5:q G5:q G5:q F5:q E5:q D5:q C5:q C5:q D5:q E5:q D5:q. C5:e C5:h",
      bass: "C3:h C3:h B2:h G2:h A2:h F2:h G2:h G2:h C3:h C3:h B2:h G2:h A2:h F2:h G2:h C3:h",
      num: 4, den: 4, sharps: 0 },
    { title: "La minore 3/4 con pause nella melodia (imitazione)",
      mel: "A4:q C5:q E5:q D5:h B4:q C5:q. B4:e A4:q G#4:h r:q A4:q B4:q C5:q D5:q. C5:e B4:q A4:h r:q " +
           "E5:q D5:q C5:q B4:q A4:q G#4:q A4:h.",
      bass: "A2:h. F2:h. E2:h. E2:h. A2:h. D3:h. E2:h. E2:h. A2:q D3:q E3:q E2:h. A2:h.",
      num: 3, den: 4, sharps: 0 },
    { title: "Sol maggiore 6/8",
      mel: "G4:q D5:e D5:q B4:e C5:q A4:e A4:q. B4:q G4:e A4:q F#4:e G4:q. r:q. " +
           "D5:q E5:e D5:q C5:e B4:q A4:e G4:q. A4:q B4:e A4:q F#4:e G4:q.",
      bass: "G2:q. G2:q. A2:q. D3:q. G2:q. D2:q. G2:q. G2:q. B2:q. G2:q. E2:q. D2:q. D2:q. D2:q. G2:q. ",
      num: 6, den: 8, sharps: 1 },
    { title: "Solo canto dato (senza basso), contrappunto sotto",
      mel: "D4:w F4:w E4:w D4:w G4:w F4:w A4:w G4:w F4:w E4:w D4:w",
      bass: "", num: 4, den: 4, sharps: -1, mode: "minor", position: "below" }
];

var seed = parseInt(process.argv[2] || "7");
var species = (process.argv[3] || "free,florid,2:1,4:1,sus,1:1").split(",");
var totalPar = 0, failures = [];
function check(ok, msg) { if (!ok) { failures.push(msg); console.log("  FALLITO: " + msg); } }
// rilievi dell'analisi che il generatore non deve mai produrre
var NEVER = { parallel5: 1, parallel8: 1, dissonance: 1, suspension: 1, crossing: 1 };
CASES.forEach(function (cs) {
    var m = parse(cs.mel), b = cs.bass ? parse(cs.bass) : { events: [], end: 0 };
    var end = Math.max(m.end, b.end);
    species.forEach(function (sp) {
        var t0 = Date.now();
        var res = E.generate({
            melody: m.events, bass: b.events, measures: measures(end, cs.num, cs.den), keys: [{ tick: 0, sharps: cs.sharps }],
            start: 0, end: end,
            options: { species: sp, seed: seed, mode: cs.mode || "auto", position: cs.position || "auto" }
        });
        var r = res.report;
        totalPar += r.parallels;
        console.log("\n== " + cs.title + "  [" + sp + "]  " + (Date.now() - t0) + " ms");
        console.log("tonalità " + r.key + ", ruolo " + r.role + ", note " + r.notes +
                    ", passi/salti " + r.steps + "/" + r.leaps + ", contrario/simile " + r.contrary + "/" + r.similar +
                    ", parallele " + r.parallels + ", culmini " + r.climaxCount);
        var line = [], bar = -1;
        res.items.forEach(function (it) {
            var mb = Math.floor(it.tick / (cs.num * 1920 / cs.den));
            if (mb !== bar) { line.push("|"); bar = mb; }
            line.push(name(it) + "(" + it.ticks + (it.tieNext ? "~" : "") + ")");
        });
        console.log(line.join(" "));
        if (r.details.length) console.log("  ! " + r.details.join("; "));
        console.log("controllo: " + r.errors + " errori, " + r.warnings + " avvisi" +
                    (r.findings.length ? " – " + r.findings.map(function (f) { return f.rule + "@" + f.tick; }).join(" ") : ""));
        r.findings.forEach(function (f) { check(!NEVER[f.rule], cs.title + " [" + sp + "]: " + f.text + " a tick " + f.tick); });
    });
});

// ---------------------------------------------------------------- funzioni nuove
function input(cs, opts) {
    var m = parse(cs.mel), b = cs.bass ? parse(cs.bass) : { events: [], end: 0 }, end = Math.max(m.end, b.end);
    var o = { seed: seed, mode: cs.mode || "auto", position: cs.position || "auto" };
    for (var k in opts) o[k] = opts[k];
    return { melody: m.events, bass: b.events, measures: measures(end, cs.num, cs.den), keys: [{ tick: 0, sharps: cs.sharps }],
             start: 0, end: end, options: o };
}
console.log("\n== Analisi di una voce con errori noti");
var bad = E.analyze({
    melody: parse("C4:w D4:w E4:w F4:w G4:w F4:w").events, bass: [], measures: measures(6 * 1920, 4, 4), keys: [{ tick: 0, sharps: 0 }],
    start: 0, end: 6 * 1920, line: parse("G4:w A4:w B4:w D4:w D5:w C5:w").events });
bad.findings.forEach(function (f) { console.log("  " + f.tick + " " + f.level + " " + f.text); });
var rules = bad.findings.map(function (f) { return f.rule; });
check(rules.filter(function (x) { return x === "parallel5"; }).length === 3, "l'analisi deve trovare tre coppie di quinte parallele");
check(rules.indexOf("crossing") >= 0, "l'analisi deve trovare l'incrocio delle voci");

console.log("\n== Note fissate");
var lk = [{ tick: 1920, dur: 960, midi: 67, tpc: 15 }, { tick: 5760, dur: 480, midi: 72, tpc: 14 }];
var rl = E.generate(input(CASES[0], { species: "free", locked: lk }));
lk.forEach(function (l) {
    var hit = rl.items.filter(function (x) { return x.tick === l.tick; })[0];
    console.log("  tick " + l.tick + ": attesa " + l.midi + "/" + l.dur + ", scritta " + (hit ? hit.midi + "/" + hit.ticks : "nulla"));
    check(hit && hit.midi === l.midi && hit.tpc === l.tpc && hit.ticks === l.dur, "la nota fissata a tick " + l.tick + " deve restare com'è");
});
check(rl.report.locked === 2 && rl.report.parallels === 0, "note fissate: report e assenza di parallele");

console.log("\n== Entrata in imitazione");
var re = E.generate(input(CASES[0], { species: "free", entry: true }));
console.log("  " + JSON.stringify(re.report.entry) + "  inizio: " + re.items.slice(0, 5).map(name).join(" "));
check(re.report.entry && re.items[0].midi === null && re.items[0].tick === 0, "con l'entrata in imitazione il contrappunto inizia con una pausa");
check(re.report.entry && re.report.entry.matched >= 1, "l'entrata deve riprendere almeno un intervallo della melodia");

console.log("\n== Figure della 3ª specie (cambiata, doppia volta)");
var fig = 0;
for (var sd = 1; sd <= 6; sd++) {
    [CASES[2], CASES[3]].forEach(function (cs) {
        var rf = E.generate(input(cs, { species: "4:1", seed: sd }));
        fig += rf.report.figures.cambiata + rf.report.figures.double;
    });
}
console.log("  cambiate e doppie volte in 12 contrappunti 4:1: " + fig);
check(fig > 0, "il 4:1 deve poter usare cambiata o doppia volta");

console.log("\nTotale parallele: " + totalPar);
if (failures.length) console.log("Controlli falliti: " + failures.length);
process.exit(totalPar || failures.length ? 1 : 0);
