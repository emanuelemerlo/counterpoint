.pragma library
/*
 * Contrappunto – motore di generazione e di analisi
 * ------------------------------------------------
 * JavaScript puro, senza dipendenze da MuseScore: il plugin QML legge lo
 * spartito, passa qui dei dati semplici e riscrive il risultato.
 * Lo stesso file è caricato da tests/run_tests.js per il collaudo fuori da MuseScore.
 *
 * Unità di tempo: tick di MuseScore (480 per semiminima, 1920 per semibreve).
 *
 * Input di generate():
 *   melody, bass : [{ tick, dur, notes: [{ midi, tpc, tieBack }] }]   (bass può essere [])
 *   measures     : [{ tick, len, num, den, isFirst }]
 *   keys         : [{ tick, sharps }]
 *   start, end   : intervallo da elaborare (inizio/fine di misura)
 *   options      : vedi DEFAULTS
 *
 * Output: { items: [{ tick, ticks, midi|null, tpc, tieNext }], report: {...} }
 *
 * analyze() controlla invece una voce già scritta (input.line) con le stesse regole
 * e ritorna i rilievi: { findings: [{ tick, rule, level, args }], report: {...} }.
 *
 * Il motore non contiene testi per l'utente: errori, rilievi, tonalità e parallele
 * escono come codici e dati (note come tpc), e l'interfaccia li traduce con i18n/.
 * Gli errori sono lanciati come stringhe "error.<codice>", chiavi dei file di lingua.
 */

var WHOLE = 1920;
var VALID = [3840, 2880, 1920, 1440, 960, 720, 480, 360, 240, 180, 120, 90, 60, 30];

var DEFAULTS = {
    species: "free",        // "1:1" | "2:1" | "4:1" | "sus" | "florid" | "free"
    position: "auto",       // "auto" | "above" | "middle" | "below"
    register: "auto",       // "auto" | "soprano" | "alto" | "tenor" | "bass"
    strictness: "strict",   // "strict" | "free"
    mode: "auto",           // "auto" | "major" | "minor"
    meter: "auto",          // "auto" | "simple" | "compound"
    imitation: true,        // eco del motivo nelle pause della melodia
    entry: false,           // entrata in imitazione: il contrappunto entra dopo la melodia riprendendone l'inizio
    locked: null,           // [{ tick, dur, midi, tpc }] note fissate dall'utente: il resto si ricalcola intorno
    variety: 3,             // 0..10, casualità controllata
    seed: 1,
    instrument: null,       // { lo, hi } estensione MIDI (suoni reali) dello strumento di destinazione
    beam: 48,
    sameStaff: false        // melodia e basso letti dallo stesso rigo
};

// ---------------------------------------------------------------- utilità
function mod(a, n) { return ((a % n) + n) % n; }
function sign(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }
function tpcToPc(tpc) { return mod((tpc - 14) * 7, 12); }
function tpcToLetter(tpc) { return mod((tpc - 14) * 4, 7); }
var NAT = [0, 2, 4, 5, 7, 9, 11];
var DEF_TPC = [14, 21, 16, 11, 18, 13, 20, 15, 10, 17, 12, 19];
var NAMES = ["C", "D", "E", "F", "G", "A", "B"];   // solo per il debug: i nomi per l'utente sono in i18n/

function diaOf(midi, letter) {
    var alter = mod(midi, 12) - NAT[letter];
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    return Math.round((midi - alter - NAT[letter]) / 12) * 7 + letter;
}
function noteInfo(midi, tpc) {
    if (typeof tpc !== "number" || tpc < -1 || tpc > 33 || tpcToPc(tpc) !== mod(midi, 12))
        tpc = DEF_TPC[mod(midi, 12)];
    var l = tpcToLetter(tpc);
    return { midi: midi, tpc: tpc, pc: mod(midi, 12), letter: l, dia: diaOf(midi, l) };
}
function tpcName(tpc) {
    var l = tpcToLetter(tpc);
    var alt = Math.floor((tpc + 1) / 7) - 2; // -2..2
    var acc = ["bb", "b", "", "#", "##"][alt + 2];
    return NAMES[l] + acc;
}
function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function bsearch(arr, t) { // ultimo indice con arr[i].t <= t
    var lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) {
        var m = (lo + hi) >> 1;
        if (arr[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans;
}

// ---------------------------------------------------------------- tonalità
var KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
var KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function corr(hist, prof, tonic) {
    var n = 12, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += hist[i]; my += prof[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) {
        var x = hist[mod(i + tonic, 12)] - mx, y = prof[i] - my;
        sxy += x * y; sxx += x * x; syy += y * y;
    }
    return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;
}

var keyCache = {};
function makeKey(sharps, mode) {
    var id = sharps + ":" + mode;
    if (keyCache[id]) return keyCache[id];
    var minor = mode === "minor";
    var t0 = 14 + sharps + (minor ? 3 : 0);
    var rel = minor ? [0, 2, -3, -1, 1, -4, -2] : [0, 2, 4, -1, 1, 3, 5];
    var deg = [], i;
    for (i = 0; i < 7; i++) deg.push(t0 + rel[i]);
    var k = {
        sharps: sharps, mode: mode, minor: minor, tonicTpc: t0, tonicPc: tpcToPc(t0),
        degTpc: deg, degPc: deg.map(tpcToPc),
        raised6: minor ? t0 + 3 : null, raised7: minor ? t0 + 5 : null
    };
    k.ltPc = minor ? tpcToPc(t0 + 5) : k.degPc[6];
    k.scale = [];
    for (i = 0; i < 7; i++) k.scale.push({ tpc: deg[i], deg: i, raised: false, natural: minor && (i === 5 || i === 6) });
    if (minor) {
        k.scale.push({ tpc: t0 + 3, deg: 5, raised: true, natural: false });
        k.scale.push({ tpc: t0 + 5, deg: 6, raised: true, natural: false });
    }
    k.chords = buildChords(k);
    k.name = tpcName(t0) + (minor ? " minor" : " major");   // solo per il debug
    keyCache[id] = k;
    return k;
}

function buildChords(k) {
    var prior = [0.6, 0.15, 0.1, 0.35, 0.5, 0.25, 0.05];
    var out = [];
    function tp(d, harm) {
        var t = k.degTpc[d % 7];
        if (k.minor && harm && d % 7 === 6) t = k.raised7;
        return t;
    }
    for (var d = 0; d < 7; d++) {
        var harm = k.minor && (d === 4 || d === 6);
        var r = tp(d, harm), th = tp(d + 2, harm), f = tp(d + 4, harm);
        out.push(mkChord(d, r, th, f, null, prior[d]));
        if (d === 4) out.push(mkChord(d, r, th, f, tp(d + 6, harm), prior[d] - 0.05));
    }
    // accordi fuori tonalità: vincono solo se le note che suonano li indicano chiaramente
    // (es. Sol minore in La minore: Sol–Sib–Re). Grafia per terze sopra la fondamentale.
    var have = {};
    out.forEach(function (c) { have[c.root + ":" + c.third + ":" + c.fifth] = 1; });
    for (var rt = k.tonicTpc - 7; rt <= k.tonicTpc + 7; rt++) {
        [[4, 1], [-3, 1], [-3, -6]].forEach(function (q) {          // maggiore, minore, diminuito (in quinte)
            var t3 = rt + q[0], t5 = rt + q[1];
            var id = tpcToPc(rt) + ":" + tpcToPc(t3) + ":" + tpcToPc(t5);
            if (have[id]) return;
            have[id] = 1;
            var ch = mkChord(-1, rt, t3, t5, null, -0.2);
            ch.chromatic = true;
            out.push(ch);
        });
    }
    return out;
}
function mkChord(deg, r, t, f, s, prior) {
    var c = { deg: deg, root: tpcToPc(r), third: tpcToPc(t), fifth: tpcToPc(f),
              seventh: s === null ? null : tpcToPc(s), prior: prior, set: {} };
    c.set[c.root] = 1; c.set[c.third] = 1; c.set[c.fifth] = 1;
    if (c.seventh !== null) c.set[c.seventh] = 1;
    c.dominant = (deg === 4 || deg === 6);
    return c;
}

function estimateChord(k, w, bassPc, prev) {
    var total = 0, i;
    for (i = 0; i < 12; i++) total += w[i];
    if (total < 1e-9) return prev;
    var best = null, bestS = -1e9;
    for (var ci = 0; ci < k.chords.length; ci++) {
        var ch = k.chords[ci], s = 0;
        for (i = 0; i < 12; i++) if (w[i] > 0) s += ch.set[i] ? w[i] : -0.8 * w[i];
        s /= total;
        if (bassPc !== null) {
            if (bassPc === ch.root) s += 0.35;
            else if (bassPc === ch.third) s += 0.12;
            else if (bassPc === ch.fifth) s += 0.02;
            else if (bassPc === ch.seventh) s += 0.05;
            else s -= 0.3;
        }
        s += ch.prior * 0.25;
        if (ch.seventh !== null) s += (w[ch.seventh] > 0) ? 0.05 : -1;
        if (prev && prev === ch) s += 0.05;
        if (s > bestS) { bestS = s; best = ch; }
    }
    return best;
}

// ---------------------------------------------------------------- misure e metro
function prepMeasures(list, meterMode) {
    var out = [], num = 4, den = 4;
    for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.num > 0 && m.den > 0) { num = m.num; den = m.den; }
        else if (i === 0 || (out.length && m.len !== out[out.length - 1].nominal && !m.isFirst)) {
            if (m.len % 480 === 0) { num = m.len / 480; den = 4; }
            else if (m.len % 240 === 0) { num = m.len / 240; den = 8; }
        }
        var nominal = num * WHOLE / den;
        var compound;
        if (meterMode === "simple") compound = false;
        else if (meterMode === "compound") compound = (num % 3 === 0);
        else compound = (den >= 8) && (num % 3 === 0) && num > 3;
        var beat = compound ? 3 * WHOLE / den : WHOLE / den;
        var sub = compound ? 3 : 2;
        var pickup = (m.isFirst && m.len < nominal) ? nominal - m.len : 0;
        out.push({ tick: m.tick, len: m.len, num: num, den: den, nominal: nominal, beat: beat,
                   sub: sub, subLen: beat / sub, pickup: pickup, beatsPerBar: Math.round(nominal / beat),
                   compound: compound, t: m.tick });
    }
    return out;
}
function measureAt(ms, t) { var i = bsearch(ms, t); return ms[i < 0 ? 0 : i]; }
function strengthAt(m, t) {
    var pos = t - m.tick + m.pickup;
    if (pos === 0) return 3;
    if (pos % m.beat === 0) {
        var b = pos / m.beat;
        if (m.beatsPerBar >= 4 && m.beatsPerBar % 2 === 0 && b === m.beatsPerBar / 2) return 2.5;
        return 2;
    }
    if (pos % m.subLen === 0) return 1;
    return 0;
}

// ---------------------------------------------------------------- linee (melodia / basso)
function buildLine(evts, start, end, high) {
    var pts = {}, i, e;
    pts[start] = 1; pts[end] = 1;
    var sorted = [];
    for (i = 0; i < evts.length; i++) {
        e = evts[i];
        if (!e.notes || !e.notes.length || e.dur <= 0) continue;
        if (e.tick >= end || e.tick + e.dur <= start) continue;
        sorted.push(e);
        pts[Math.max(e.tick, start)] = 1;
        pts[Math.min(e.tick + e.dur, end)] = 1;
    }
    sorted.sort(function (a, b) { return a.tick - b.tick; });
    var ticks = Object.keys(pts).map(Number).sort(function (a, b) { return a - b; });
    var segs = [], active = [], ptr = 0;
    for (i = 0; i < ticks.length - 1; i++) {
        var t = ticks[i], te = ticks[i + 1];
        while (ptr < sorted.length && sorted[ptr].tick <= t) { active.push(sorted[ptr]); ptr++; }
        active = active.filter(function (x) { return x.tick + x.dur > t; });
        var best = null, bestEv = null, attackAny = false;
        for (var a = 0; a < active.length; a++) {
            var ev = active[a];
            for (var n = 0; n < ev.notes.length; n++) {
                var nt = ev.notes[n];
                if (ev.tick === t && !nt.tieBack) attackAny = true;
                if (!best || (high ? nt.midi > best.midi : nt.midi < best.midi)) { best = nt; bestEv = ev; }
            }
        }
        var info = best ? noteInfo(best.midi, best.tpc) : null;
        var attack = !!best && bestEv.tick === t && !best.tieBack;
        var all = [];
        for (a = 0; a < active.length; a++)
            for (n = 0; n < active[a].notes.length; n++) {
                var an = active[a].notes[n];
                if (!all.some(function (q) { return q.midi === an.midi; })) all.push(noteInfo(an.midi, an.tpc));
            }
        segs.push({ t: t, end: te, note: info, attack: attack, attackAny: attackAny, all: all });
    }
    // fonde segmenti contigui con la stessa nota senza nuovo attacco
    var merged = [];
    for (i = 0; i < segs.length; i++) {
        var s = segs[i], last = merged[merged.length - 1];
        if (last && !s.attack && !s.attackAny && sameSet(last.all, s.all) &&
            ((last.note === null && s.note === null) || (last.note && s.note && last.note.midi === s.note.midi))) {
            last.end = s.end;
        } else merged.push(s);
    }
    return merged;
}
function sameSet(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!b.some(function (q) { return q.midi === a[i].midi; })) return false;
    return true;
}
function segAt(line, t) { var i = bsearch(line, t); return (i >= 0 && t < line[i].end) ? line[i] : null; }
function noteAt(line, t) { var s = segAt(line, t); return s ? s.note : null; }

function weightedMedian(line) {
    var arr = [];
    for (var i = 0; i < line.length; i++) if (line[i].note) arr.push([line[i].note.midi, line[i].end - line[i].t]);
    if (!arr.length) return null;
    arr.sort(function (a, b) { return a[0] - b[0]; });
    var tot = 0, j; for (j = 0; j < arr.length; j++) tot += arr[j][1];
    var acc = 0;
    for (j = 0; j < arr.length; j++) { acc += arr[j][1]; if (acc >= tot / 2) return arr[j][0]; }
    return arr[arr.length - 1][0];
}

// ---------------------------------------------------------------- generazione
function generate(input) {
    var opt = {}, k;
    for (k in DEFAULTS) opt[k] = DEFAULTS[k];
    if (input.options) for (k in input.options) if (input.options[k] !== undefined) opt[k] = input.options[k];

    var C = { opt: opt, start: input.start, end: input.end, rng: makeRng(opt.seed), notes: [] };
    C.strict = opt.strictness !== "free";
    // cambiata e doppia volta: 3ª specie (4:1), fiorito e libero
    C.figures = opt.species === "4:1" || opt.species === "florid" || opt.species === "free";
    C.ms = prepMeasures(input.measures, opt.meter);
    if (!C.ms.length) throw "error.noMeasures";
    C.melLine = buildLine(input.melody || [], C.start, C.end, true);
    C.bassLine = buildLine(input.bass || [], C.start, C.end, false);
    var hasMel = C.melLine.some(function (s) { return s.note; });
    if (!hasMel) throw "error.noMelody";
    C.hasBass = C.bassLine.some(function (s) { return s.note; });
    C.locked = (opt.locked || []).filter(function (l) { return l && l.dur > 0 && l.tick >= C.start && l.tick < C.end; })
        .map(function (l) { return { tick: l.tick, dur: Math.min(l.dur, C.end - l.tick), midi: l.midi, tpc: l.tpc }; })
        .sort(function (a, b) { return a.tick - b.tick; });
    for (var li = 1; li < C.locked.length; li++)        // sovrapposte: vince la prima
        if (C.locked[li].tick < C.locked[li - 1].tick + C.locked[li - 1].dur) { C.locked.splice(li, 1); li--; }

    detectKeys(C, input.keys || []);
    chooseRange(C);
    analyseHarmony(C);
    findCadences(C);
    planClimax(C);
    var events = planEvents(C);
    annotate(C, events);
    planRoles(C, events);
    placeClimax(C, events);
    var path = search(C, events);
    var items = buildItems(C, events, path);
    var report = verify(C, events, path);
    report.key = { tpc: C.keys[0].key.tonicTpc, mode: C.keys[0].key.mode };
    report.role = C.role;
    report.range = [C.lo, C.hi];
    report.rangeShift = C.rangeShift;      // ottave di spostamento per l'estensione dello strumento
    report.roleBefore = C.roleBefore;
    report.swaps = C.swaps || 0;           // battute in cui la voce passa dall'altra parte della melodia
    report.altRole = C.role === "above" ? (C.hasBass ? "middle" : "below") : "above";
    report.events = events.length;
    report.notes = items.filter(function (x) { return x.midi !== null; }).length;
    report.quality = Math.round(C.quality * 100) / 100;
    report.locked = C.locked.length;
    // controllo della variante con le regole dell'analisi (stesse regole, dal punto di vista di chi legge)
    try {
        var roles = [], lastRole = null;
        for (var ri = 0; ri < events.length; ri++) if (events[ri].role !== lastRole) { lastRole = events[ri].role; roles.push({ t: events[ri].tick, role: lastRole }); }
        var chk = analyze({ melody: input.melody, bass: input.bass, measures: input.measures, keys: input.keys,
                            start: input.start, end: input.end, options: opt, roles: roles, line: itemsToLine(items) });
        report.findings = chk.findings;
        report.errors = chk.report.errors;
        report.warnings = chk.report.warnings;
        report.figures = chk.report.figures;
    } catch (e) { report.findings = []; report.errors = 0; report.warnings = 0; }
    report.entry = C.entry ? entryReport(C, events, path) : null;
    report.signature = items.map(function (x) { return x.tick + ":" + x.ticks + ":" + x.midi; }).join(",");
    return { items: items, report: report, events: events, path: path };
}

function detectKeys(C, keys) {
    var hist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], i;
    function acc(line, w) {
        for (var j = 0; j < line.length; j++) if (line[j].note) hist[line[j].note.pc] += (line[j].end - line[j].t) * w;
    }
    acc(C.melLine, 1); acc(C.bassLine, 1.5);
    var firstB = null, lastB = null, firstM = null, lastM = null;
    for (i = 0; i < C.bassLine.length; i++) if (C.bassLine[i].note) { if (!firstB) firstB = C.bassLine[i].note; lastB = C.bassLine[i].note; }
    for (i = 0; i < C.melLine.length; i++) if (C.melLine[i].note) { if (!firstM) firstM = C.melLine[i].note; lastM = C.melLine[i].note; }
    var ks = keys.slice().sort(function (a, b) { return a.tick - b.tick; });
    if (!ks.length || ks[0].tick > C.start) ks.unshift({ tick: C.start, sharps: ks.length ? ks[0].sharps : 0 });
    var sh = ks[0].sharps;
    var mode = C.opt.mode;
    if (mode !== "major" && mode !== "minor") {
        var majT = tpcToPc(14 + sh), minT = tpcToPc(17 + sh);
        var sMaj = corr(hist, KK_MAJ, majT), sMin = corr(hist, KK_MIN, minT);
        var lastRef = lastB || lastM, firstRef = firstB || firstM;
        if (lastRef) { if (lastRef.pc === majT) sMaj += 0.2; if (lastRef.pc === minT) sMin += 0.2; }
        if (firstRef) { if (firstRef.pc === majT) sMaj += 0.08; if (firstRef.pc === minT) sMin += 0.08; }
        var tot = 0; for (i = 0; i < 12; i++) tot += hist[i];
        if (tot > 0 && hist[mod(minT + 11, 12)] / tot > 0.02) sMin += 0.12;
        mode = sMin > sMaj ? "minor" : "major";
    }
    C.mode = mode;
    C.keys = ks.map(function (x) { return { t: x.tick, key: makeKey(x.sharps, mode) }; });
    C.keyName = C.keys[0].key.name;
}
function keyAt(C, t) { var i = bsearch(C.keys, t); return C.keys[i < 0 ? 0 : i].key; }

// registro naturale di un ruolo, date le altezze tipiche di melodia (mm) e basso (bm)
function roleRange(r, mm, bm, preset) {
    var lo, hi;
    if (preset) { lo = preset[0]; hi = preset[1]; }
    else if (r === "above") { lo = mm - 2; hi = mm + 14; }
    else if (r === "middle") {
        var c = Math.round((mm + bm) / 2);
        lo = Math.max(c - 8, bm + 3); hi = Math.min(c + 8, mm + 1);
        if (hi - lo < 12) { lo = c - 6; hi = c + 6; }
    } else { lo = mm - 19; hi = mm - 1; }
    lo = Math.max(lo, 36); hi = Math.min(hi, 91);
    if (hi - lo < 10) hi = lo + 12;
    return [lo, hi];
}

function chooseRange(C) {
    var mm = weightedMedian(C.melLine);
    var bm = C.hasBass ? weightedMedian(C.bassLine) : null;
    var pos = C.opt.position, reg = C.opt.register;
    var presets = { soprano: [60, 81], alto: [53, 74], tenor: [48, 69], bass: [40, 62] };
    var role;
    if (pos === "auto") {
        if (presets[reg]) {
            var cen = (presets[reg][0] + presets[reg][1]) / 2;
            role = cen > mm ? "above" : (C.hasBass ? "middle" : "below");
        } else if (C.hasBass) role = (mm - bm >= 12) ? "middle" : "above";
        else role = mm >= 64 ? "below" : "above";
    } else role = pos;
    if (role === "middle" && !C.hasBass) role = "below";
    if (role === "below" && C.hasBass) role = "middle";

    function rangeFor(r) { return roleRange(r, mm, bm, presets[reg]); }
    var rg = rangeFor(role), roleBefore = role, shift = 0;

    // Estensione dello strumento di destinazione. Se il registro non ci sta:
    // 1) cambio ruolo alla voce (intermedia <-> sopra la melodia, sotto <-> sopra)
    //    e uso il registro naturale del nuovo ruolo;
    // 2) se ancora non basta, sposto il registro di ottava;
    // 3) in ogni caso nessuna nota esce dall'estensione.
    var ins = C.opt.instrument;
    if (ins && ins.lo > 0 && ins.hi > ins.lo) {
        var fits = function (r) { return Math.min(r[1], ins.hi) - Math.max(r[0], ins.lo) >= Math.min(12, ins.hi - ins.lo); };
        if (!fits(rg) && !presets[reg]) {
            var up = (rg[0] + rg[1]) / 2 < (ins.lo + ins.hi) / 2;
            var alt = up ? "above" : (C.hasBass ? "middle" : "below");
            if (alt !== role) { var rg2 = rangeFor(alt); if (fits(rg2) || Math.abs((rg2[0] + rg2[1]) - (ins.lo + ins.hi)) < Math.abs((rg[0] + rg[1]) - (ins.lo + ins.hi))) { role = alt; rg = rg2; } }
        }
        if (!fits(rg)) {
            var bestOv = -1e9;
            for (var k = -3; k <= 3; k++) {
                var ov = Math.min(rg[1] + 12 * k, ins.hi) - Math.max(rg[0] + 12 * k, ins.lo);
                if (ov > bestOv || (ov === bestOv && Math.abs(k) < Math.abs(shift))) { bestOv = ov; shift = k; }
            }
            rg = [rg[0] + 12 * shift, rg[1] + 12 * shift];
            var cen2 = (rg[0] + rg[1]) / 2;     // il ruolo segue la posizione rispetto alla melodia
            if (shift !== 0) role = cen2 > mm ? "above" : (C.hasBass ? "middle" : "below");
        }
        var lo = Math.max(rg[0], ins.lo), hi = Math.min(rg[1], ins.hi);
        if (hi - lo < 12) {                     // registro troppo stretto: allargo dentro l'estensione
            var mid = (lo + hi) / 2;
            lo = Math.max(ins.lo, Math.round(mid - 7));
            hi = Math.min(ins.hi, lo + 14);
            lo = Math.max(ins.lo, Math.min(lo, hi - 14));
        }
        rg = [lo, hi];
    }
    C.rangeShift = shift; C.roleBefore = roleBefore;
    C.role = role; C.lo = rg[0]; C.hi = rg[1]; C.melMed = mm; C.bassMed = bm;
    C.candLo = C.lo; C.candHi = C.hi;          // allargati da planRoles se la voce cambia lato
    C.ins = (ins && ins.lo > 0 && ins.hi > ins.lo) ? ins : null;
    C.fixedRegister = !!presets[reg];
    C.candCache = {};
}

function candsFor(C, key, extra) {
    var id = key.sharps + key.mode + (extra && extra.length ? "|" + extra.join(",") : "");
    if (C.candCache[id]) return C.candCache[id];
    var out = [];
    for (var i = 0; i < key.scale.length; i++) {
        var sc = key.scale[i], pc = tpcToPc(sc.tpc), letter = tpcToLetter(sc.tpc);
        for (var midi = C.candLo; midi <= C.candHi; midi++) {
            if (mod(midi, 12) !== pc) continue;
            out.push({ midi: midi, tpc: sc.tpc, pc: pc, letter: letter, dia: diaOf(midi, letter), deg: sc.deg,
                       raised: sc.raised, natural: sc.natural,
                       isLT: key.minor ? (sc.raised && sc.deg === 6) : sc.deg === 6 });
        }
    }
    // note alterate presenti nelle altre voci (con la loro grafia): il contrappunto può usarle
    var tl = tpcToLetter(key.tonicTpc);
    for (var e = 0; extra && e < extra.length; e++) {
        var xt = extra[e], xpc = tpcToPc(xt), xl = tpcToLetter(xt);
        if (out.some(function (o) { return o.pc === xpc; })) continue;
        for (var mx = C.candLo; mx <= C.candHi; mx++) {
            if (mod(mx, 12) !== xpc) continue;
            out.push({ midi: mx, tpc: xt, pc: xpc, letter: xl, dia: diaOf(mx, xl), deg: mod(xl - tl, 7),
                       raised: false, natural: false, isLT: false, chromatic: true });
        }
    }
    out.sort(function (a, b) { return a.midi - b.midi; });
    C.candCache[id] = out;
    return out;
}

function analyseHarmony(C) {
    var bounds = {}, i, m;
    for (i = 0; i < C.ms.length; i++) {
        m = C.ms[i];
        var mEnd = m.tick + m.len;
        for (var t = m.tick - m.pickup; t < mEnd; t += m.beat)
            if (t >= m.tick && t >= C.start && t < C.end) bounds[t] = 1;
    }
    for (i = 0; i < C.bassLine.length; i++) if (C.bassLine[i].attack) bounds[C.bassLine[i].t] = 1;
    bounds[C.start] = 1;
    var ticks = Object.keys(bounds).map(Number).filter(function (x) { return x >= C.start && x < C.end; })
                     .sort(function (a, b) { return a - b; });
    var slots = [], prev = null;
    for (i = 0; i < ticks.length; i++) {
        var a = ticks[i], b = i + 1 < ticks.length ? ticks[i + 1] : C.end;
        var w = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        addW(C.melLine, a, b, w, 1);
        addW(C.bassLine, a, b, w, 1.3);
        var bn = noteAt(C.bassLine, a);
        if (!bn && !C.hasBass) bn = null;
        var ch = estimateChord(keyAt(C, a), w, bn ? bn.pc : null, prev);
        slots.push({ t: a, end: b, chord: ch });
        prev = ch;
    }
    // riempie gli slot iniziali senza accordo
    var firstCh = null;
    for (i = 0; i < slots.length; i++) if (slots[i].chord) { firstCh = slots[i].chord; break; }
    for (i = 0; i < slots.length && !slots[i].chord; i++) slots[i].chord = firstCh;
    C.slots = slots;
}
function addW(line, a, b, w, f) {
    var i = Math.max(0, bsearch(line, a));
    for (; i < line.length && line[i].t < b; i++) {
        var s = line[i];
        if (!s.note || s.end <= a) continue;
        var ov = Math.min(b, s.end) - Math.max(a, s.t);
        if (ov <= 0) continue;
        var base = ov / (b - a) * f * (s.t === a ? 1.3 : 1);
        w[s.note.pc] += base;                                     // voce principale (acuta / grave)
        for (var q = 0; q < s.all.length; q++) if (s.all[q].midi !== s.note.midi) w[s.all[q].pc] += base * 0.6;
    }
}
function chordAt(C, t) { var i = bsearch(C.slots, t); return i >= 0 ? C.slots[i].chord : null; }

// Culmine unico: la zona più acuta del registro è riservata a una frase
// intorno al 60% del brano (tra due arrivi di frase). Altrove la linea può avere
// picchi locali, ma più bassi; dentro la frase scelta tocca la vetta una volta.
function planClimax(C) {
    var len = C.end - C.start, goal = C.start + 0.6 * len;
    var lo = C.start + 0.4 * len, hi = C.start + 0.85 * len;
    var cads = C.cadences.filter(function (t) { return t > C.start && t < C.end; });
    var t0 = lo, t1 = hi;
    for (var i = 0; i < cads.length; i++) {
        if (cads[i] <= goal) t0 = Math.max(lo, cads[i]);
        else { t1 = Math.min(hi, cads[i] + 1); break; }
    }
    if (t1 - t0 < 0.12 * len) { t0 = Math.max(lo, goal - 0.08 * len); t1 = Math.min(hi, goal + 0.08 * len); }
    // zona alta: l'ultimo tono sotto il limite del registro
    C.apex = { t0: t0, t1: t1, top: C.hi - 2 };
}

function findCadences(C) {
    var line = C.melLine, atts = [], i;
    for (i = 0; i < line.length; i++) if (line[i].note && line[i].attack) atts.push(i);
    var iois = [];
    for (i = 0; i < atts.length; i++) {
        var s = line[atts[i]], j = atts[i] + 1, end = s.end;
        while (j < line.length && !line[j].attack && line[j].note && line[j].note.midi === s.note.midi) { end = line[j].end; j++; }
        s.noteEnd = end;
        iois.push(end - s.t);
    }
    var sortedI = iois.slice().sort(function (a, b) { return a - b; });
    var median = sortedI.length ? sortedI[sortedI.length >> 1] : 480;
    var cads = [];
    for (i = 0; i < atts.length; i++) {
        var sg = line[atts[i]], m = measureAt(C.ms, sg.t);
        var restAfter = 0, rs = segAt(line, sg.noteEnd);
        if (rs && !rs.note) restAfter = rs.end - rs.t;
        var longNote = (sg.noteEnd - sg.t) >= Math.max(2 * m.beat, 2.5 * median);
        var strong = strengthAt(m, sg.t) >= 2;
        if ((restAfter >= m.beat && strengthAt(m, sg.t) >= 1) || (longNote && strong) || sg.noteEnd >= C.end)
            cads.push(sg.t);
    }
    C.cadences = cads;
}

// ---------------------------------------------------------------- piano ritmico
function findGaps(C) {
    var line = C.melLine, gaps = [];
    for (var i = 0; i < line.length; i++) {
        if (line[i].note) continue;
        var g0 = line[i].t, j = i, g1 = line[i].end;
        while (j + 1 < line.length && !line[j + 1].note) { j++; g1 = line[j].end; }
        i = j;
        if (g1 - g0 < 480 || g0 <= C.start) continue;
        var motif = [];
        for (var k = bsearch(line, g0 - 1); k >= 0 && motif.length < 6; k--) {
            if (!line[k].note) break;
            if (line[k].t < g0 - 2 * WHOLE) break;
            if (line[k].attack) motif.unshift(line[k]);
        }
        if (motif.length < 3) continue;
        var onsets = [], ints = [], ok = true;
        for (k = 0; k < motif.length; k++) {
            var rel = motif[k].t - motif[0].t;
            if (rel % 60 !== 0) { ok = false; break; }
            if (g0 + rel >= g1) break;
            onsets.push(g0 + rel);
            if (k > 0) ints.push(motif[k].note.dia - motif[k - 1].note.dia);
        }
        if (!ok || onsets.length < 3) continue;
        gaps.push({ t0: g0, t1: g1, onsets: onsets, ints: ints });
    }
    return gaps;
}

function validDur(d) { return VALID.indexOf(d) >= 0; }

function planEvents(C) {
    var sp = C.opt.species, on = {}, i;
    var gaps = C.opt.imitation && sp !== "1:1" ? findGaps(C) : [];
    C.gaps = gaps;
    function gapOf(t) { for (var g = 0; g < gaps.length; g++) if (t >= gaps[g].t0 && t < gaps[g].t1) return gaps[g]; return null; }

    var melodyGrid = (sp === "1:1" || sp === "2:1" || sp === "4:1" || sp === "sus");
    C.melodyGrid = melodyGrid;
    if (melodyGrid) {
        var div = sp === "4:1" ? 4 : (sp === "1:1" ? 1 : 2);
        var line = C.melLine;
        for (i = 0; i < line.length; i++) {
            var s = line[i];
            var a = s.t, b = s.end;
            if (s.note && !s.attack) continue; // continuazione già coperta
            if (s.note) {
                var j = i + 1;
                while (j < line.length && !line[j].attack && line[j].note && line[j].note.midi === s.note.midi) { b = line[j].end; j++; }
                splitSpan(C, a, b, div, on);
            } else {
                beatGrid(C, a, b, on, sp === "1:1" ? 1 : div);
            }
        }
    } else {
        for (i = 0; i < C.ms.length; i++) {
            var m = C.ms[i];
            var mEnd = Math.min(m.tick + m.len, C.end);
            var t = Math.max(m.tick, C.start);
            while (t < mEnd) {
                var pos = t - m.tick + m.pickup;
                var nb = m.tick - m.pickup + (Math.floor(pos / m.beat) + 1) * m.beat;
                var we = Math.min(nb, mEnd);
                planWindow(C, t, we, m, on);
                t = we;
            }
        }
    }
    on[C.start] = 1;
    // pause della melodia: eco del motivo
    var ticks = Object.keys(on).map(Number).filter(function (x) { return x >= C.start && x < C.end; });
    ticks = ticks.filter(function (x) { return !gapOf(x); });
    for (i = 0; i < gaps.length; i++) for (var q = 0; q < gaps[i].onsets.length; q++) ticks.push(gaps[i].onsets[q]);
    // entrata in imitazione: pausa iniziale, poi il ritmo dell'inizio della melodia
    var E0 = C.opt.entry && (sp === "free" || sp === "florid") ? planEntry(C) : null;
    C.entry = E0;
    if (E0) {
        ticks = ticks.filter(function (x) { return x < C.start || x >= E0.t1; });
        ticks.push(C.start, E0.t1);
        for (i = 0; i < E0.onsets.length; i++) ticks.push(E0.onsets[i]);
    }
    // note fissate dall'utente: ognuna è un evento intero
    var L = C.locked;
    for (i = 0; i < L.length; i++) {
        var la = L[i].tick, lb = L[i].tick + L[i].dur;
        ticks = ticks.filter(function (x) { return x <= la || x >= lb; });
        ticks.push(la);
        if (lb < C.end) ticks.push(lb);
    }
    ticks = uniqSort(ticks);
    // nota finale: un solo evento sotto l'ultima nota della melodia, come nel contrappunto
    // di specie (niente semiminime o crome nell'ultima battuta, si chiude su una nota lunga)
    var tf = finalAttack(C);
    if (tf !== null && C.end - tf <= 2 * measureAt(C.ms, tf).nominal) {
        var lockedAt = {};
        for (i = 0; i < C.locked.length; i++) { lockedAt[C.locked[i].tick] = 1; lockedAt[C.locked[i].tick + C.locked[i].dur] = 1; }
        ticks = ticks.filter(function (x) { return x <= tf || lockedAt[x]; });
    }
    var events = [];
    for (i = 0; i < ticks.length; i++) {
        var t0 = ticks[i], t1 = i + 1 < ticks.length ? ticks[i + 1] : C.end;
        if (t1 <= t0) continue;
        var ev = { tick: t0, dur: t1 - t0 };
        var g = gapOf(t0);
        if (g) { ev.gap = g; ev.gapIdx = g.onsets.indexOf(t0); ev.gapInt = ev.gapIdx >= 1 ? g.ints[ev.gapIdx - 1] : null; }
        if (E0) {
            if (t0 < E0.t0) ev.entryRest = true;
            var ki = E0.onsets.indexOf(t0);
            if (ki >= 0) ev.imit = { k: ki, int: ki > 0 ? E0.ints[ki - 1] : null };
        }
        for (var li = 0; li < L.length; li++) if (L[li].tick === t0) ev.lock = L[li];
        events.push(ev);
    }
    return events;
}
// Entrata in imitazione: il contrappunto tace mentre la melodia espone il suo
// inizio (una battuta, oppure due o mezza se servono) e poi ne riprende il ritmo e
// gli intervalli, a partire dall'ottava, dalla quinta o dalla quarta della prima nota.
function planEntry(C) {
    var line = C.melLine, atts = [], i;
    for (i = 0; i < line.length; i++) if (line[i].note && line[i].attack) atts.push(line[i]);
    if (atts.length < 4) return null;
    var a0 = atts[0].t, m = measureAt(C.ms, a0);
    var tries = [m.nominal, 2 * m.nominal, m.nominal / 2];
    for (var k = 0; k < tries.length; k++) {
        var D = tries[k];
        if (D < m.beat || a0 + 2 * D + m.nominal > C.end) continue;
        var head = atts.filter(function (x) { return x.t < a0 + D; });
        if (head.length < 3 || head.length > 10) continue;
        if (head.some(function (x) { return (x.t - a0) % 60 !== 0; })) continue;
        var t0 = a0 + D, on = [], ints = [];
        for (i = 0; i < head.length; i++) {
            on.push(t0 + head[i].t - a0);
            if (i > 0) ints.push(head[i].note.dia - head[i - 1].note.dia);
        }
        if (!ints.some(function (x) { return x !== 0; })) continue;
        if (C.locked.some(function (l) { return l.tick < t0 + D; })) return null;
        return { t0: t0, t1: t0 + D, onsets: on, ints: ints, pc: head[0].note.pc, dia: head[0].note.dia, len: head.length };
    }
    return null;
}

// inizio dell'ultima nota della melodia (null se la melodia non ne ha)
function finalAttack(C) {
    for (var i = C.melLine.length - 1; i >= 0; i--) if (C.melLine[i].note && C.melLine[i].attack) return C.melLine[i].t;
    return null;
}

function uniqSort(a) {
    a.sort(function (x, y) { return x - y; });
    var o = [];
    for (var i = 0; i < a.length; i++) if (!o.length || o[o.length - 1] !== a[i]) o.push(a[i]);
    return o;
}
function splitSpan(C, a, b, div, on) {
    var len = b - a;
    on[a] = 1;
    while (div > 1) {
        var part = len / div;
        if (part === Math.floor(part) && part >= 120 && validDur(part)) {
            for (var k = 1; k < div; k++) on[a + k * part] = 1;
            return;
        }
        div = div >> 1;
    }
    // nota molto lunga in 1:1 su più misure: spezza almeno a ogni misura
    var m = measureAt(C.ms, a);
    for (var t = m.tick + m.len; t < b; t += measureAt(C.ms, t).len) on[t] = 1;
}
function beatGrid(C, a, b, on, div) {
    on[a] = 1;
    var t = a;
    while (t < b) {
        var m = measureAt(C.ms, t);
        var unit = div >= 2 ? m.subLen : m.beat;
        var pos = t - m.tick + m.pickup;
        var nt = m.tick - m.pickup + (Math.floor(pos / unit) + 1) * unit;
        if (nt < b) on[nt] = 1;
        t = nt;
    }
}
function countAtt(line, a, b) {
    var n = 0, i = Math.max(0, bsearch(line, a));
    for (; i < line.length && line[i].t < b; i++) if (line[i].t >= a && line[i].attackAny) n++;
    return n;
}
function planWindow(C, a, b, m, on) {
    on[a] = 1;
    var sp = C.opt.species;
    var melAtt = countAtt(C.melLine, a, b);
    var subPts = [];
    var p0 = a - m.tick + m.pickup;
    for (var p = (Math.floor(p0 / m.subLen) + 1) * m.subLen; m.tick - m.pickup + p < b; p += m.subLen)
        subPts.push(m.tick - m.pickup + p);
    var fast = melAtt >= m.sub || hasShort(C.melLine, a, b, m.subLen);
    var florid;
    // fiorito: valori misti. Sotto una nota lunga del canto dato circa un tempo su tre si
    // divide in due crome; gli altri restano semiminime, che la ricerca può legare in note più lunghe.
    if (sp === "florid") florid = C.rng() < (fast ? 0.12 : 0.35);
    else florid = (melAtt === 0) || (!fast && C.rng() < 0.2);
    if (florid) for (var i = 0; i < subPts.length; i++) on[subPts[i]] = 1;
    // nel fiorito, talvolta una figura puntata (es. croma puntata + semicroma)
    if (sp === "florid" && florid && !m.compound && subPts.length === 1 && C.rng() < 0.15) {
        delete on[subPts[0]];
        on[a + m.subLen * 1.5] = 1;
    }
}
function hasShort(line, a, b, lim) {
    var i = Math.max(0, bsearch(line, a));
    for (; i < line.length && line[i].t < b; i++) if (line[i].note && line[i].attack && (line[i].end - line[i].t) < lim) return true;
    return false;
}

// ---------------------------------------------------------------- annotazione
function othersAt(C, t, mel, bass) {
    var out = [];
    [segAt(C.melLine, t), segAt(C.bassLine, t)].forEach(function (sg) {
        if (!sg) return;
        for (var q = 0; q < sg.all.length; q++) {
            var o = sg.all[q];
            if ((mel && o.midi === mel.midi) || (bass && o.midi === bass.midi)) continue;
            if (!out.some(function (z) { return z.midi === o.midi; })) out.push(o);
        }
    });
    return out;
}
function annotate(C, events) {
    var cadSet = C.cadences;
    for (var i = 0; i < events.length; i++) {
        var ev = events[i], t = ev.tick, te = t + ev.dur;
        ev.m = measureAt(C.ms, t);
        ev.strength = strengthAt(ev.m, t);
        ev.mel = noteAt(C.melLine, t);
        ev.bass = noteAt(C.bassLine, t);
        ev.melPrev = t > C.start ? noteAt(C.melLine, t - 1) : null;
        ev.bassPrev = t > C.start ? noteAt(C.bassLine, t - 1) : null;
        if (C.opt.sameStaff) {
            if (ev.mel && ev.bass && ev.mel.midi === ev.bass.midi) ev.bass = null;
            if (ev.melPrev && ev.bassPrev && ev.melPrev.midi === ev.bassPrev.midi) ev.bassPrev = null;
        }
        var ms = segAt(C.melLine, t);
        ev.melAttack = !!(ms && ms.t === t && ms.attackAny);
        // specie con griglia sulla melodia (2:1, 4:1, ritardi): le suddivisioni di una nota
        // del canto dato sono tempi deboli rispetto a quella nota, anche se cadono su un
        // tempo della battuta (es. 4:1 su semibrevi in 4/4). Lì valgono note di passaggio,
        // di volta e figure come la cambiata; l'arrivo di una nota del basso resta forte.
        var bs = segAt(C.bassLine, t);
        if (C.melodyGrid && ev.mel && !ev.melAttack && !(bs && bs.t === t && bs.attackAny))
            ev.strength = Math.min(ev.strength, (C.opt.species === "4:1" && (t - ms.t) * 2 === (ms.noteEnd || ms.end) - ms.t) ? 1.5 : 1);
        ev.melSilent = !ev.mel;
        ev.others = othersAt(C, t, ev.mel, ev.bass);
        ev.chord = chordAt(C, t);
        ev.key = keyAt(C, t);
        ev.inner = [];
        var seen = {};
        [C.melLine, C.bassLine].forEach(function (line) {
            var j = Math.max(0, bsearch(line, t));
            for (; j < line.length && line[j].t < te; j++) {
                var s = line[j];
                if (s.t > t && s.attackAny && !seen[s.t]) {
                    seen[s.t] = 1;
                    var bn = noteAt(C.bassLine, s.t), mn = noteAt(C.melLine, s.t);
                    if (C.opt.sameStaff && bn && mn && bn.midi === mn.midi) bn = null;
                    ev.inner.push({ t: s.t, mel: mn, bass: bn, chord: chordAt(C, s.t), strength: strengthAt(measureAt(C.ms, s.t), s.t),
                                    others: othersAt(C, s.t, mn, bn) });
                }
            }
        });
        ev.rest = !ev.mel && !ev.bass && !ev.inner.some(function (x) { return x.mel || x.bass; });
        if (ev.entryRest) ev.rest = true;
        if (ev.lock) ev.rest = false;
        ev.role = C.role; ev.lo = C.lo; ev.hi = C.hi;
        ev.chromatic = chromaticAt(C, ev);
        ev.crowded = crowdedFor(ev, ev.role, ev.lo, ev.hi);
        ev.isFinal = (i === events.length - 1);
        ev.isCad = false;
        for (var c = 0; c < cadSet.length; c++) if (cadSet[c] >= t && cadSet[c] < te) ev.isCad = true;
        if (ev.isCad && i > 0) events[i - 1].isPreCad = true;
    }
    // prima nota suonata dal contrappunto
    for (i = 0; i < events.length; i++) if (!events[i].rest) { events[i].isFirstSound = true; break; }
    // dopo la cadenza: fino al prossimo attacco della melodia
    var inAfter = false;
    for (i = 0; i < events.length; i++) {
        if (events[i].isCad) { inAfter = true; continue; }
        if (events[i].melAttack) inAfter = false;
        events[i].afterCad = inAfter;
    }
    // l'ultimo evento con suono è il finale vero
    for (i = events.length - 1; i >= 0; i--) {
        if (!events[i].rest) { events[i].isFinal = true; break; }
        events[i].isFinal = false;
    }
}

// Grafie (tpc) delle note fuori scala che suonano in questo evento o si sono
// sentite nell'ultima battuta, in qualunque voce: come un'alterazione che vale
// per la battuta, rendono disponibile la nota alterata e sconsigliano la stessa
// nota naturale (falsa relazione: Mi contro Mib, Si contro Sib).
function chromaticAt(C, ev) {
    var inScale = {}, out = [], k = ev.key, i, j;
    for (i = 0; i < k.scale.length; i++) inScale[tpcToPc(k.scale[i].tpc)] = 1;
    var t0 = ev.tick - ev.m.len, t1 = ev.tick + ev.dur;
    [C.melLine, C.bassLine].forEach(function (line) {
        for (j = Math.max(0, bsearch(line, t0)); j < line.length && line[j].t < t1; j++) {
            if (line[j].end <= t0) continue;
            var all = line[j].all;
            for (i = 0; i < all.length; i++)
                if (!inScale[all[i].pc] && out.indexOf(all[i].tpc) < 0) out.push(all[i].tpc);
        }
    });
    return out.sort(function (a, b) { return a - b; });
}

// spazio reale disponibile per il contrappunto in questo istante, con un dato ruolo e registro
function crowdedFor(ev, role, lo, hi) {
    if (!ev.mel) return false;
    if (role === "middle") return ev.mel.midi - Math.max(lo, ev.bass ? ev.bass.midi + 3 : lo) < 6;
    if (role === "above") return Math.min(hi, ev.mel.midi + 16) - Math.max(lo, ev.mel.midi + 3) < 4;
    return Math.min(hi, ev.mel.midi - 3) - lo < 4;
}

// Ruolo locale. Se in una battuta la melodia sale (o scende) tanto da non
// lasciare spazio alla voce nel suo ruolo, la voce passa dall'altra parte della
// melodia per quelle battute (scambio delle parti), dentro l'estensione dello
// strumento, invece di tacere. Torna al suo ruolo appena c'è di nuovo spazio.
function planRoles(C, events) {
    C.swaps = 0;
    if (C.fixedRegister || !events.length) return;
    var home = C.role;
    var alt = home === "above" ? (C.hasBass ? "middle" : "below") : "above";
    var insLo = C.ins ? C.ins.lo : 36, insHi = C.ins ? C.ins.hi : 91;
    // raggruppa gli eventi per battuta
    var groups = [], cur = null, i;
    for (i = 0; i < events.length; i++) {
        var m = events[i].m;
        if (!cur || cur.m !== m) { cur = { m: m, evs: [] }; groups.push(cur); }
        cur.evs.push(events[i]);
    }
    var swap = [];
    for (var g = 0; g < groups.length; g++) {
        var evs = groups[g].evs, crowdT = 0, melT = 0, mel = [], bas = [];
        for (i = 0; i < evs.length; i++) {
            var e = evs[i];
            if (!e.mel) continue;
            melT += e.dur;
            if (e.crowded) crowdT += e.dur;
            mel.push(e.mel.midi);
            if (e.bass) bas.push(e.bass.midi);
        }
        var band = null;
        if (melT > 0 && crowdT >= 0.5 * melT) {
            mel.sort(function (a, b) { return a - b; });
            var mm = mel[mel.length >> 1];
            var bm = bas.length ? bas.sort(function (a, b) { return a - b; })[bas.length >> 1] : C.bassMed;
            var rg = roleRange(alt, mm, bm, null);
            var lo = Math.max(rg[0], insLo), hi = Math.min(rg[1], insHi);
            var free = 0, tot = 0;
            for (i = 0; i < evs.length; i++) if (evs[i].mel) { tot += evs[i].dur; if (!crowdedFor(evs[i], alt, lo, hi)) free += evs[i].dur; }
            if (hi - lo >= 7 && free >= 0.6 * tot) band = [lo, hi];
        }
        swap.push(band);
    }
    // battuta isolata tra due battute scambiate: resta dall'altra parte (niente andirivieni)
    for (g = 1; g < groups.length - 1; g++)
        if (!swap[g] && swap[g - 1] && swap[g + 1]) swap[g] = [Math.min(swap[g - 1][0], swap[g + 1][0]), Math.max(swap[g - 1][1], swap[g + 1][1])];
    for (g = 0; g < groups.length; g++) {
        if (!swap[g]) continue;
        C.swaps++;
        for (i = 0; i < groups[g].evs.length; i++) {
            var ev = groups[g].evs[i];
            ev.role = alt; ev.lo = swap[g][0]; ev.hi = swap[g][1];
            ev.crowded = crowdedFor(ev, alt, ev.lo, ev.hi);
            for (var q = 0; q < (ev.inner || []).length; q++) ev.inner[q].role = alt;
        }
        C.candLo = Math.min(C.candLo, swap[g][0]);
        C.candHi = Math.max(C.candHi, swap[g][1]);
    }
    C.candCache = {};
}

// nota più acuta che la voce può tenere in questo evento senza incrociare la melodia
function reachTop(ev) {
    if (!ev.mel) return ev.hi;
    if (ev.role === "above") return ev.mel.midi + 3 <= ev.hi ? ev.hi : -1;
    return Math.min(ev.hi, ev.mel.midi - 3);
}

// Dopo planRoles: la frase del culmine è, tra quelle della parte centrale del
// brano, quella che arriva più in alto nel suo registro locale (a parità, la più
// vicina al 60%); la zona alta è l'ultimo tono di quel registro.
function placeClimax(C, events) {
    if (!C.apex || !events.length) return;
    var len = C.end - C.start;
    var bounds = [C.start].concat(C.cadences.filter(function (t) { return t > C.start && t < C.end; })).concat([C.end]);
    var best = null;
    for (var b = 0; b < bounds.length - 1; b++) {
        var t0 = bounds[b], t1 = bounds[b + 1] + 1, mid = ((t0 + t1) / 2 - C.start) / len;
        if (mid < 0.35 || mid > 0.85 || t1 - t0 < 0.04 * len) continue;
        var hi = -1;                                // altezza davvero raggiungibile nella frase
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev.tick < t0 || ev.tick >= t1 || ev.rest || ev.dur < ev.m.beat / 2) continue;
            hi = Math.max(hi, reachTop(ev));
        }
        if (hi < 0) continue;
        var cand = { t0: t0, t1: t1, hi: hi, dist: Math.abs(mid - 0.6) };
        if (!best || cand.hi > best.hi || (cand.hi === best.hi && cand.dist < best.dist)) best = cand;
    }
    if (best) C.apex = { t0: best.t0, t1: best.t1, top: best.hi - 2 };
    else {
        var hi2 = -1;
        for (var j = 0; j < events.length; j++)
            if (events[j].tick >= C.apex.t0 && events[j].tick < C.apex.t1 && !events[j].rest) hi2 = Math.max(hi2, reachTop(events[j]));
        if (hi2 > 0) C.apex.top = hi2 - 2;
    }
}

// ---------------------------------------------------------------- valutazione
var DISS_LOW = { 1: 1, 2: 1, 5: 1, 6: 1, 10: 1, 11: 1 };   // contro la voce più grave
var DISS_UP = { 1: 1, 2: 1, 10: 1, 11: 1 };               // tra voci superiori

function staticScore(C, ev, c) {
    var s = 0, role = ev.role || C.role, r = { dissB: false, dissM: false, sev: false, ct: false };
    var bass = ev.bass, mel = ev.mel, ch = ev.chord, cb = -1, x;
    if (c.midi < ev.lo) s -= 25 + 8 * (ev.lo - c.midi);       // fuori dal registro di questo tratto
    else if (c.midi > ev.hi) s -= 25 + 8 * (c.midi - ev.hi);
    if (bass) {
        var ib = c.midi - bass.midi;
        if (ib < 0) s -= 80; else if (ib === 0) s -= 25;
        cb = mod(ib, 12);
        if (DISS_LOW[cb]) r.dissB = true;
        else if (cb === 3 || cb === 4 || cb === 8 || cb === 9) s += 6;
        else s += 1;
        if (ib > 24) s -= (ib - 24) * 2;
    }
    if (mel) {
        var im = role === "above" ? c.midi - mel.midi : mel.midi - c.midi;
        if (im < 0) s -= 60; else if (im === 0) s -= 30;
        var cm = mod(im, 12);
        var melCT = ch ? !!ch.set[mel.pc] : true;
        // senza basso e con il contrappunto sopra, la melodia è la voce più grave: quarta e tritono sono dissonanze
        var melLowest = role === "above" && !bass;
        var dissTable = (role === "below" || melLowest) ? DISS_LOW : DISS_UP;
        // tritono tra voci superiori: dissonante, salvo che entrambe le note siano dell'accordo (V7, diminuito)
        var triOK = cm === 6 && ch && ch.set[c.pc] && ch.set[mel.pc] && !melLowest;
        if (dissTable[cm] || (cm === 6 && !triOK)) { if (melCT) r.dissM = true; else s -= 8; }
        else if (cm === 3 || cm === 4 || cm === 8 || cm === 9) s += (role === "middle" ? 3 : 6);
        if (im > 12) s -= (im - 12) * 2;
        if (role === "above" && im >= 0 && im < 3) s -= 4;
        if (role === "below" && cm === 0 && im > 0) s += 1;
    }
    if (ch) {
        if (ch.set[c.pc]) {
            r.ct = true; s += 8;
            var present = {};
            if (mel) present[mel.pc] = 1;
            if (bass) present[bass.pc] = 1;
            if (c.pc === ch.third && !present[ch.third]) s += 10;
            else if (c.pc === ch.fifth && !present[ch.fifth]) s += 3;
            else if (c.pc === ch.root && !present[ch.root]) s += 5;
            if (role === "below" && c.pc === ch.root) s += 12;      // la voce più grave sostiene la fondamentale
            if (role === "below" && c.pc === ch.fifth) s -= 6;      // evita la quarta e sesta
            if (ch.seventh !== null && c.pc === ch.seventh) r.sev = true;
        } else s -= 5;
    }
    if (c.chromatic) s += r.ct ? 2 : -12;                     // nota alterata: solo se è dell'accordo
    for (x = 0; x < (ev.chromatic || []).length; x++) {       // alterazione sentita da poco: niente nota naturale
        var at = ev.chromatic[x];
        if (tpcToLetter(at) === c.letter && tpcToPc(at) !== c.pc) s -= (ev.strength >= 2 ? 40 : 25);
    }
    // dissonanze che appartengono all'accordo (settima di dominante, tritono)
    if (r.ct && C.opt.strictness === "free") {
        if (r.dissB && (cb === 6 || r.sev)) { r.dissB = false; r.sev = true; }
        if (r.dissM) { r.dissM = false; if (c.pc === ch.seventh) r.sev = true; }
    } else if (r.ct && r.sev) {
        // anche nel rigoroso la settima di V7 è ammessa, ma deve scendere
        if (r.dissB && (cb === 10 || cb === 11 || cb === 1 || cb === 2 || cb === 6)) r.dissB = false;
        if (r.dissM) r.dissM = false;
    }
    for (x = 0; x < ev.others.length; x++) {                 // voci interne dell'accompagnamento
        var ov = Math.abs(c.midi - ev.others[x].midi), ovc = ov % 12;
        if (ov === 0) s -= 28;
        else if (ovc === 1 || ovc === 2 || ovc === 11) s -= (ov < 12 ? 18 : 8);
        else if (ovc === 6 && !(ch && ch.set[c.pc] && ch.set[ev.others[x].pc])) s -= (ev.strength >= 2 ? 16 : 6);
        if (ev.others[x].letter === c.letter && ev.others[x].pc !== c.pc) s -= 60;
        if (c.isLT && ev.others[x].pc === c.pc) s -= 20;
    }
    if (c.isLT && ((mel && mel.pc === c.pc) || (bass && bass.pc === c.pc))) s -= 35;
    var others = [mel, bass, ev.melPrev, ev.bassPrev];
    for (x = 0; x < others.length; x++) {
        var o = others[x];
        if (o && o.letter === c.letter && o.pc !== c.pc) s -= 60;
    }
    for (x = 0; x < ev.inner.length; x++) {
        var io = ev.inner[x];
        if (io.bass) {
            var iv = mod(c.midi - io.bass.midi, 12);
            if (DISS_LOW[iv] && !(io.chord && io.chord.set[c.pc] && C.opt.strictness === "free"))
                s -= io.strength >= 2 ? 22 : 6;
            if (c.midi < io.bass.midi) s -= 30;
        }
        for (var w = 0; w < io.others.length; w++) {
            var dd = Math.abs(c.midi - io.others[w].midi);
            if (dd === 0) s -= 12; else if (dd < 12 && (dd === 1 || dd === 2 || dd === 11)) s -= 6;
        }
        if (io.mel) {
            var y = role === "above" ? c.midi - io.mel.midi : io.mel.midi - c.midi;
            if (y < 0) s -= 25;
            if (role === "below" && DISS_LOW[mod(y, 12)] && io.strength >= 2) s -= 15;
        }
    }
    // specie rigorose: si comincia con una consonanza perfetta con la voce più grave
    // (ottava, quinta o unisono; sotto il canto dato solo ottava o unisono)
    if (ev.isFirstSound && C.strict && C.opt.species !== "free" && mel) {
        var ic;
        if (role === "below") { ic = mod(mel.midi - c.midi, 12); s += ic === 0 ? 25 : (ic === 7 ? -10 : -25); }
        else { ic = mod(c.midi - (bass || mel).midi, 12); s += (ic === 0 || ic === 7) ? 25 : -25; }
    }
    if (ev.isFinal) {
        if (ch) {
            if (c.pc === ch.root) s += (role === "below" ? 60 : 25);
            else if (c.pc === ch.third) s += (role === "below" ? -40 : 22);
            else if (c.pc === ch.fifth) s += (role === "below" ? -60 : 4);
            else s -= 150;
            if (ch.deg === 0 && c.pc === ev.key.tonicPc) s += 10;
        }
        if (r.dissB || r.dissM) s -= 150;
        if (role === "below") s += (c.pc === ev.key.tonicPc) ? 40 : -40;
    } else if (ev.isCad) {
        s += r.ct ? 14 : -50;
        if (r.dissB) s -= 60;
        if (role === "below" && ch && c.pc === ch.root) s += 15;
    }
    r.s = s;
    return r;
}

function evalTransition(C, ev, node, c, st, relax) {
    var p = node.c, s = st.s, strict = C.strict;
    var hold = !!p && p.midi === c.midi;
    var d = p ? c.dia - p.dia : 0, mv = p ? c.midi - p.midi : 0, ad = Math.abs(d);
    var pend = null, diss = st.dissB || st.dissM;
    var sp = C.opt.species, figLand = false, strongPos = ev.strength >= 2;

    // 1. obblighi lasciati dalla nota precedente
    if (node.pend) {
        if (node.pend === "sus") {
            if (d === -1 && !diss) s += 15;
            else if (hold) s -= 40;
            else s -= 120;
        } else if (node.pend === "step") {
            if (ad === 1) { if (diss && sign(d) !== sign(node.lastD)) s -= 60; }
            else if (ad === 2 && C.figures && !hold && !strongPos && node.ppC) {
                // la dissonanza (raggiunta per grado) lascia per salto di terza solo in due figure:
                // cambiata: stessa direzione dell'arrivo (nel rigoroso solo in discesa), su una consonanza;
                // doppia volta: direzione opposta, sull'altra vicina della nota di partenza X.
                var lastDir = sign(node.lastD);
                var cambiata = sign(d) === lastDir && !diss && (lastDir < 0 || !strict);
                var doppia = sign(d) === -lastDir && c.dia === node.ppC.dia - lastDir;
                if (cambiata || doppia) { s -= (cambiata ? 5 : 7); pend = d > 0 ? "res-" : "res+"; figLand = true; }
                else s -= 120;
            }
            else s -= 120;
        } else if (node.pend === "res+" || node.pend === "res-") {
            // dopo il salto della figura: grado congiunto in direzione opposta al salto
            var want = node.pend === "res+" ? 1 : -1;
            if (d === want) s += 6; else if (hold) s -= 60; else s -= 110;
        } else if (node.pend === "down") {
            if (d === -1) s += 8; else if (hold) s -= 6; else s -= 35;
        }
    }

    // 2. trattamento della dissonanza corrente
    if (diss) {
        if (!p) s -= 90;
        else if (hold) {
            if (node.cons) { s -= strongPos ? 2 : 8; pend = "sus"; if (sp === "sus") s += 18; }
            else s -= 70;
        } else if (ad === 1) {
            if (strongPos) { s -= strict ? 60 : 20; }   // appoggiatura (solo nello stile libero)
            else s -= 4;                               // nota di passaggio / di volta
            pend = "step";
        } else if (figLand) s -= 2;                    // seconda vicina della doppia volta (pend già fissato)
        else s -= strict ? 100 : 60;                   // dissonanza per salto
        if (sp === "1:1") s -= 80;                     // nota contro nota: niente dissonanze
    } else if (st.sev) { pend = "down"; s -= 1; }

    // 3. sensibile e alterazioni del minore
    if (p && !hold) {
        if (p.isLT && node.ltActive && d !== 1) s -= (ev.isCad || ev.isFinal) ? 40 : (ev.role === "middle" ? 10 : 18);
        if (p.isLT && node.ltActive && d === 1) s += 4;
        if (p.raised && d < 0) s -= 30;
        if (p.raised && p.deg === 5 && !(d === 1 && c.raised)) s -= 12;
        if (p.natural && p.deg === 6 && d > 0) s -= 12;
    }

    // 4. linea melodica
    var run = node.run, newMax = node.maxM, newCnt = node.maxCnt, newMaxIdx = node.maxIdx;
    var segStart = node.segStart, segLen = node.segLen;
    if (p && !hold) {
        // tratti nella stessa direzione: il punto di svolta non deve delineare un tritono o una settima
        if (segStart < 0 || node.run === 0) { segStart = p.midi; segLen = 1; }
        else if (sign(d) === sign(node.run)) segLen++;
        else {
            s -= outlinePenalty(C, segLen, Math.abs(p.midi - segStart));
            segStart = p.midi; segLen = 1;
        }
        var am = Math.abs(mv);
        if (ad === 0) s -= 40;
        else if (ad === 1) s += (am === 3 ? -90 : 16);
        else if (ad === 2) s += (am === 3 || am === 4) ? 3 : -60;
        else if (ad === 3) s += (am === 5) ? -7 : -90;
        else if (ad === 4) s += (am === 7) ? -11 : (strict ? -60 : -35);
        else if (ad === 5) s += (mv === 8) ? -12 : (strict ? -40 : -22);
        else if (ad === 7) s += (am === 12) ? -12 : -90;
        else s -= 100;
        if (ev.role === "below" && (ad === 3 || ad === 4 || ad === 7)) s += 8;   // salti tipici del basso
        if (ev.dur < ev.m.beat && ad >= 3) s -= 10;
        var L = node.lastD;
        if (Math.abs(L) >= 3) {
            if (sign(d) === -sign(L)) s += (ad === 1 ? 10 : (ad === 2 ? 4 : 0));
            else s -= 25;
        }
        if (Math.abs(L) >= 2 && ad >= 2 && sign(L) === sign(d)) s -= (Math.abs(L) + ad > 7) ? 50 : 8;
        if (Math.abs(L) >= 2 && ad >= 2) s -= 6;                 // salti consecutivi
        if (Math.abs(L) === 1 && ad === 1 && sign(d) !== sign(L)) s -= 4;   // ondeggiamento di seconde
        if (node.maxM > 0) {                                     // esplora il registro (fino a una decima)
            var spanNow = node.maxM - node.minM;
            if (spanNow < 15 && (c.midi > node.maxM || c.midi < node.minM)) s += 5;
        }
        run = sign(d) === sign(node.run) ? node.run + sign(d) : sign(d);
        if (Math.abs(run) >= 5) s -= 4 * (Math.abs(run) - 4);
        if (c.midi > node.maxM) { newMax = c.midi; newCnt = 1; newMaxIdx = ev.idx; }
        else if (c.midi === node.maxM) { newCnt = node.maxCnt + 1; s -= 16 * node.maxCnt; }
        if (c.midi === node.pp && p.midi === node.ppp) s -= 14;   // oscillazione A-B-A-B
        if (node.ppC && node.ppC.letter === c.letter && node.ppC.pc !== c.pc) s -= 45; // falsa relazione melodica (Si-La-Sib)
        if (node.span !== undefined) {
            var lowM = Math.min(node.minM, c.midi), hiM = Math.max(node.maxM, c.midi);
            if (hiM - lowM > 17) s -= 12;
        }
    } else if (!p) {
        s += st.ct ? 6 : -10;
        if (node.restBy && ev.strength < 2) s -= 10;     // rientro preferibilmente su tempo forte
        if (ev.idx === 0 && ev.role === "below") s += (c.pc === ev.key.tonicPc) ? 25 : -10;
        if (ev.bass) { var x0 = mod(c.midi - ev.bass.midi, 12); if (x0 === 0 || x0 === 7) s += 4; }
        if (c.midi > node.maxM) { newMax = c.midi; newCnt = 1; newMaxIdx = ev.idx; }
    }

    // 5. ritmo: tenere o muoversi
    if (hold && (c.locked || p.locked)) s -= 30;      // il ritmo delle note fissate resta quello dell'utente
    if (hold) {
        var hb;
        if (sp === "sus") hb = (ev.strength >= 2 ? 14 : -10);
        else if (sp === "1:1" || sp === "2:1" || sp === "4:1") hb = -85;
        else if (sp === "florid") hb = -2;
        else hb = 3;
        if (ev.melAttack) s += hb; else s += hb - 10;
        if (node.hold >= 1) s -= 7 * node.hold;
        if (ev.gap) s -= 15;
        if (ev.afterCad && !ev.gap) s += 12;
    } else if (p && !ev.melAttack) s += 3;

    // 6. moto rispetto a basso e melodia
    if (p && !hold) {
        var dirC = sign(mv), dirB = 0, dirM = 0;
        var b = ev.bass, bp = ev.bassPrev, m = ev.mel, mp = ev.melPrev;
        if (b && bp) {
            dirB = sign(b.midi - bp.midi);
            var r0 = Math.abs(p.midi - bp.midi) % 12, r1 = Math.abs(c.midi - b.midi) % 12;
            if (dirB !== 0 && r0 === r1 && (r1 === 0 || r1 === 7)) { if (!relax) return null; s -= 400; }
            if (dirB === dirC && (r1 === 0 || r1 === 7)) {
                var leap = Math.abs(mv) > 2;
                if (ev.role === "above") s -= leap ? (strict ? 150 : 60) : 15;
                else s -= leap ? (strict ? 30 : 12) : 4;
            }
            if (dirB !== 0 && dirB === -dirC) s += 6;
        }
        if (m && mp) {
            dirM = sign(m.midi - mp.midi);
            var q0 = Math.abs(mp.midi - p.midi) % 12, q1 = Math.abs(m.midi - c.midi) % 12;
            if (dirM !== 0 && q0 === q1 && (q1 === 0 || q1 === 7)) { if (!relax) return null; s -= 400; }
            if (dirM === dirC && (q1 === 0 || q1 === 7)) {
                var upperLeap = ev.role === "above" ? Math.abs(mv) > 2 : Math.abs(m.midi - mp.midi) > 2;
                var outer = ev.role === "above" || ev.role === "below";
                s -= upperLeap ? (outer ? (strict ? 120 : 50) : 25) : 6;
            }
            if (dirM !== 0 && dirM === -dirC) s += 6;
            var pmNew = (dirM !== 0 && dirM === dirC && q0 === q1) ? node.pm + 1 : 0;
            if (pmNew >= 3) s -= 5 * (pmNew - 2);
        }
        if (dirC !== 0 && dirC === dirB && dirC === dirM) s -= 8;
    }

    // 7. imitazione del motivo nelle pause della melodia
    if (ev.gap && ev.gapIdx >= 1 && p) {
        if (hold) s -= 20;
        else if (d === ev.gapInt) s += 24;
        else if (sign(d) === sign(ev.gapInt) && Math.abs(d - ev.gapInt) === 1) s += 6;
        else s -= 6;
    }

    // 8. cadenza: avvicinamento per grado
    if ((ev.isCad || ev.isFinal) && p && !hold && ev.role !== "below") s += (ad === 1 ? 10 : (ad === 2 ? 2 : -6));
    // clausola finale a due voci: se la melodia arriva per grado, sesta maggiore -> ottava
    // (contrappunto sopra) o terza minore -> unisono/ottava (sotto), per moto contrario
    if (ev.isFinal && p && !hold && ev.mel && ev.melPrev && ev.role !== "middle" &&
        Math.abs(ev.mel.dia - ev.melPrev.dia) === 1) {
        var up = ev.role === "above";
        var ivNow = up ? c.midi - ev.mel.midi : ev.mel.midi - c.midi;
        var ivPrev = mod(up ? p.midi - ev.melPrev.midi : ev.melPrev.midi - p.midi, 12);
        if (ivNow >= 0 && mod(ivNow, 12) === 0) {
            if (ivPrev === (up ? 9 : 3)) s += 16;
            if (ad === 1 && sign(mv) === -sign(ev.mel.midi - ev.melPrev.midi)) s += 6;
        }
    }

    // 8b. entrata in imitazione: riprende gli intervalli dell'inizio della melodia
    if (ev.imit) {
        if (ev.imit.k === 0) {
            var iv0 = mod(c.pc - C.entry.pc, 12);
            // all'ottava, alla quinta, alla quarta; nello stile libero anche alla terza o alla sesta
            s += iv0 === 0 ? 50 : (iv0 === 7 ? 44 : (iv0 === 5 ? 30 : ((iv0 === 3 || iv0 === 4 || iv0 === 8 || iv0 === 9) ? (strict ? 8 : 22) : -20)));
        } else if (p) {
            if (ev.imit.int === 0) s += hold ? 24 : -12;   // nota ribattuta del motivo: tenuta
            else if (hold) s -= 25;
            else if (d === ev.imit.int) s += 34;
            else if (sign(d) === sign(ev.imit.int) && Math.abs(d - ev.imit.int) === 1) s += 6;
            else s -= 12;
        }
    }

    // 9. evita di ripetere la stessa figura battuta dopo battuta
    if (p && !hold) {
        var b1 = pitchAt(node, ev.tick - ev.m.len), b2 = pitchAt(node, ev.tick - 2 * ev.m.len);
        if (b1 === c.midi) s -= (b2 === c.midi ? 9 : 3);
    }

    // culmine pianificato (vedi planClimax)
    var apexHit = node.apexHit;
    if (C.apex && !hold && c.midi >= C.apex.top - 2) {
        var inWin = ev.tick >= C.apex.t0 && ev.tick < C.apex.t1;
        if (c.midi < C.apex.top) { if (!inWin) s -= 6; }        // appena sotto la vetta: picchi secondari più bassi
        else if (!inWin) s -= 120 + 8 * (c.midi - C.apex.top);
        else if (!node.apexHit) { s += 40; apexHit = true; }
        else if (c.midi >= node.maxM) s -= 20;
    }

    var nz = C.opt.variety * (C.rng() - 0.5) * 6;   // varietà: rumore controllato, escluso dalla qualità
    s += nz;

    var pm = 0;
    if (p && !hold && ev.mel && ev.melPrev) {
        var dM = sign(ev.mel.midi - ev.melPrev.midi);
        if (dM !== 0 && dM === sign(mv) && Math.abs(ev.melPrev.midi - p.midi) % 12 === Math.abs(ev.mel.midi - c.midi) % 12) pm = node.pm + 1;
    }
    return {
        c: c, prev: node, score: node.score + s, noise: node.noise + nz,
        lastD: hold ? node.lastD : d, run: hold ? node.run : run,
        hold: hold ? node.hold + 1 : 0,
        maxM: newMax, maxCnt: newCnt, maxIdx: newMaxIdx, minM: Math.min(node.minM, c.midi), span: 1,
        pend: pend, cons: !diss, pm: pm, apexHit: apexHit,
        segStart: hold ? node.segStart : segStart, segLen: hold ? node.segLen : segLen,
        pp: hold ? node.pp : (p ? p.midi : -1), ppp: hold ? node.ppp : node.pp, ppC: hold ? node.ppC : p,
        ltActive: c.isLT && !!ev.chord && !!ev.chord.set[c.pc] && ev.chord.dominant
    };
}

function pitchAt(node, t) {           // altezza del contrappunto al tick t, risalendo il percorso
    for (var k = 0; node && k < 40; k++, node = node.prev) {
        if (node.t === undefined) return null;
        if (node.t <= t) return node.c ? node.c.midi : null;
    }
    return null;
}

// la nota fissata dall'utente, con i dati che servono alle regole
function lockedCand(C, ev) {
    var k = ev.key, info = noteInfo(ev.lock.midi, ev.lock.tpc), tl = tpcToLetter(k.tonicTpc);
    var inScale = k.scale.some(function (x) { return tpcToPc(x.tpc) === info.pc; });
    var raised = k.minor && (info.tpc === k.raised6 || info.tpc === k.raised7);
    var deg = mod(info.letter - tl, 7);
    return { midi: info.midi, tpc: info.tpc, pc: info.pc, letter: info.letter, dia: info.dia, deg: deg,
             raised: raised, natural: k.minor && !raised && (deg === 5 || deg === 6),
             isLT: info.pc === k.ltPc, chromatic: !inScale, locked: true };
}

// quanto il contrappunto ha davvero ripreso l'inizio della melodia
function entryReport(C, events, path) {
    var E = C.entry, hit = 0, tot = 0, first = null, prev = null;
    for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (!ev.imit) continue;
        var c = path[i];
        if (ev.imit.k === 0) { first = c; prev = c; continue; }
        tot++;
        if (c && prev && c.dia - prev.dia === ev.imit.int) hit++;
        prev = c;
    }
    // at: intervallo dell'imitazione rispetto alla prima nota della melodia (1 = unisono/ottava, 5 = quinta, ...)
    return { tick: E.t0, notes: E.len, intervals: tot, matched: hit,
             at: first ? 1 + mod(first.dia - E.dia, 7) : 0 };
}

function restNode(node) {
    return { c: null, prev: node, score: node.score - (node.pend ? 100 : 0), noise: node.noise, lastD: 0, run: 0, hold: 0,
             maxM: node.maxM, maxCnt: node.maxCnt, maxIdx: node.maxIdx, minM: node.minM, span: node.span,
             pend: null, cons: true, pm: 0, pp: -1, ppp: -1, ltActive: false, apexHit: node.apexHit,
             segStart: -1, segLen: 0 };
}

// tratto melodico di segLen movimenti nella stessa direzione che copre span semitoni
function outlinePenalty(C, segLen, span) {
    if (segLen < 2) return 0;                      // un salto singolo è già valutato a parte
    if (span === 6) return C.strict ? 24 : 14;     // tritono delineato (Fa–Sol–La–Si)
    if (span === 10 || span === 11) return C.strict ? 12 : 7;   // settima delineata
    return 0;
}

function optionalRest(C, ev, node) {
    var r = restNode(node), cost = 40;
    if (node.c) cost += (ev.strength >= 2 ? 6 : 16);   // interrompere la linea
    if (ev.crowded) cost -= 28;                         // melodia e basso troppo vicini
    if (ev.gap) cost += 15;                             // nelle pause della melodia si suona
    if (node.c && ev.dur < ev.m.beat) cost += 30;       // niente pause più brevi di un tempo
    var sp = C.opt.species;
    if (sp === "1:1" || sp === "2:1" || sp === "4:1") cost += 10;
    r.score -= cost;
    r.restBy = true;
    return r;
}

function search(C, events) {
    var B = C.opt.beam || 48;
    var root = { c: null, prev: null, score: 0, noise: 0, lastD: 0, run: 0, hold: 0, maxM: -1, maxCnt: 0, maxIdx: -1,
                 minM: 999, pend: null, cons: true, pm: 0, pp: -1, ppp: -1, ltActive: false, apexHit: false,
                 segStart: -1, segLen: 0 };
    var beam = [root], i, j, n;
    for (i = 0; i < events.length; i++) {
        var ev = events[i];
        ev.idx = i;
        var children = [];
        if (ev.rest) {
            for (n = 0; n < beam.length; n++) { var rn = restNode(beam[n]); rn.t = ev.tick; children.push(rn); }
        } else {
            var cands = ev.lock ? [lockedCand(C, ev)] : candsFor(C, ev.key, ev.chromatic);
            var stat = [];
            for (j = 0; j < cands.length; j++) stat.push(staticScore(C, ev, cands[j]));
            // nota fissata: le regole contano come punteggio ma non la escludono mai
            for (var pass = ev.lock ? 1 : 0; pass < 2 && !children.length; pass++) {
                for (n = 0; n < beam.length; n++)
                    for (j = 0; j < cands.length; j++) {
                        var ch = evalTransition(C, ev, beam[n], cands[j], stat[j], pass === 1);
                        if (ch) { ch.t = ev.tick; children.push(ch); }
                    }
            }
            // il contrappunto può anche tacere (con un costo), utile dove manca lo spazio
            if (!ev.isFinal && !ev.lock) for (n = 0; n < beam.length; n++) { var orn = optionalRest(C, ev, beam[n]); orn.t = ev.tick; children.push(orn); }
        }
        var best = {};
        for (j = 0; j < children.length; j++) {
            var x = children[j], pc = x.prev.c;
            var key = (x.c ? x.c.midi : "r") + "|" + (pc ? pc.midi : "r") + "|" + (x.pend || "") + "|" + (x.hold > 0 ? 1 : 0) + (x.apexHit ? "|A" : "");
            if (!best[key] || best[key].score < x.score) best[key] = x;
        }
        beam = Object.keys(best).map(function (kk) { return best[kk]; });
        beam.sort(function (a, b) { return b.score - a.score; });
        if (beam.length > B) beam.length = B;
    }
    // valutazione globale: obblighi irrisolti e posizione del culmine
    var total = events.length, bestNode = null, bestScore = -1e18;
    for (n = 0; n < beam.length; n++) {
        var nd = beam[n], sc = nd.score;
        if (nd.pend) sc -= 100;
        if (nd.c && nd.segStart >= 0) sc -= outlinePenalty(C, nd.segLen, Math.abs(nd.c.midi - nd.segStart));
        if (C.apex && !nd.apexHit && total > 8) sc -= 60;     // la linea non ha toccato il culmine previsto
        if (nd.maxIdx >= 0 && total > 4) {
            var rel = nd.maxIdx / total;
            if (rel >= 0.35 && rel <= 0.85) sc += 25;
            if (nd.maxCnt > 1) sc -= 20 * (nd.maxCnt - 1);
        }
        if (sc > bestScore) { bestScore = sc; bestNode = nd; }
    }
    // qualità secondo le regole (senza il rumore della varietà), media per evento:
    // serve a confrontare varianti ottenute con semi diversi
    C.quality = total ? (bestScore - bestNode.noise) / total : 0;
    var path = new Array(total);
    for (i = total - 1; i >= 0; i--) { path[i] = bestNode.c; bestNode = bestNode.prev; }
    return path;
}

// ---------------------------------------------------------------- uscita
function buildItems(C, events, path) {
    var runs = [], i;
    for (i = 0; i < events.length; i++) {
        var ev = events[i], c = path[i], last = runs[runs.length - 1];
        var brk = ev.lock || (i > 0 && events[i - 1].lock);    // le note fissate restano note a sé
        if (last && last.end === ev.tick && !brk &&
            ((c && last.c && last.c.midi === c.midi) || (!c && !last.c))) last.end += ev.dur;
        else runs.push({ t: ev.tick, end: ev.tick + ev.dur, c: c });
    }
    var items = [];
    for (i = 0; i < runs.length; i++) {
        var r = runs[i], pieces = [], t = r.t;
        while (t < r.end) {
            var m = measureAt(C.ms, t);
            var segEnd = Math.min(r.end, m.tick + m.len);
            decompose(t, segEnd, m, pieces);
            t = segEnd;
        }
        for (var k = 0; k < pieces.length; k++)
            items.push({ tick: pieces[k].t, ticks: pieces[k].len, midi: r.c ? r.c.midi : null,
                         tpc: r.c ? r.c.tpc : null, tieNext: !!r.c && k < pieces.length - 1 });
    }
    return items;
}
// item del generatore -> eventi { tick, dur, notes } (le note legate proseguono la precedente)
function itemsToLine(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.midi === null) continue;
        out.push({ tick: it.tick, dur: it.ticks, notes: [{ midi: it.midi, tpc: it.tpc, tieBack: i > 0 && items[i - 1].tieNext }] });
    }
    return out;
}
function decompose(t, e, m, out) {
    while (t < e) {
        var rem = e - t, pos = t - m.tick + m.pickup, v = null, i;
        for (i = 0; i < VALID.length; i++) {
            var val = VALID[i];
            if (val > rem) continue;
            var ok;
            if (val >= m.beat) ok = (pos % m.beat === 0);
            else ok = (pos % val === 0 || (pos % m.beat === 0)) && (pos % m.beat) + val <= m.beat;
            if (ok) { v = val; break; }
        }
        if (!v) for (i = 0; i < VALID.length; i++) if (VALID[i] <= rem) { v = VALID[i]; break; }
        if (!v) v = rem;
        out.push({ t: t, len: v });
        t += v;
    }
}

// ---------------------------------------------------------------- verifica finale
function verify(C, events, path) {
    var rep = { parallels: 0, hidden: 0, unresolved: 0, accented: 0, leaps: 0, steps: 0, contrary: 0, similar: 0,
                climaxCount: 0, details: [] };
    var prevI = -1, maxM = -1;
    for (var i = 0; i < events.length; i++) {
        var c = path[i];
        if (!c) { prevI = -1; continue; }
        if (c.midi > maxM) { maxM = c.midi; }
        if (prevI >= 0) {
            var p = path[prevI], ev = events[i];
            if (p.midi !== c.midi) {
                var ad = Math.abs(c.dia - p.dia);
                if (ad === 1) rep.steps++; else rep.leaps++;
                [[ev.bassPrev, ev.bass, "bass"], [ev.melPrev, ev.mel, "melody"]].forEach(function (pr) {
                    var a0 = pr[0], a1 = pr[1];
                    if (!a0 || !a1 || a0.midi === a1.midi) return;
                    var r0 = Math.abs(p.midi - a0.midi) % 12, r1 = Math.abs(c.midi - a1.midi) % 12;
                    if (r0 === r1 && (r1 === 0 || r1 === 7)) {
                        rep.parallels++;
                        rep.details.push({ tick: ev.tick, interval: r1 === 7 ? 5 : 8, voice: pr[2] });
                    }
                    if (sign(a1.midi - a0.midi) === sign(c.midi - p.midi)) rep.similar++; else rep.contrary++;
                });
            }
        }
        prevI = i;
    }
    for (i = 0; i < events.length; i++) if (path[i] && path[i].midi === maxM && (i === 0 || !path[i - 1] || path[i - 1].midi !== maxM)) rep.climaxCount++;
    rep.climaxAt = -1;                    // posizione del primo culmine, in % del brano
    for (i = 0; i < events.length; i++)
        if (path[i] && path[i].midi === maxM) { rep.climaxAt = Math.round(100 * (events[i].tick - C.start) / (C.end - C.start)); break; }
    return rep;
}


// ---------------------------------------------------------------- analisi di una voce esistente
// Controlla una voce scritta (dall'utente o dal plugin) rispetto a melodia e basso
// con le stesse regole del motore, e ritorna l'elenco dei rilievi.
//   input: come generate() più  line: [{ tick, dur, notes }]  (la voce da analizzare)
//   output: { findings: [{ tick, rule, level: "error"|"warning", text }], report: {...} }
// regole dell'analisi (i testi sono nei file di lingua: rule.<codice>)
var RULES = ["parallel5", "parallel8", "hidden", "accented", "dissonance", "suspension", "seventh", "leap", "sixth",
             "leapRecovery", "outline", "outline7", "crossing", "ltDoubled", "ltResolution", "crossRelation", "climax", "final"];
function analyze(input) {
    var opt = {}, k;
    for (k in DEFAULTS) opt[k] = DEFAULTS[k];
    if (input.options) for (k in input.options) if (input.options[k] !== undefined) opt[k] = input.options[k];
    var C = { opt: opt, start: input.start, end: input.end, rng: makeRng(1), notes: [], locked: [] };
    C.strict = opt.strictness !== "free";
    C.ms = prepMeasures(input.measures, opt.meter);
    if (!C.ms.length) throw "error.noMeasures";
    C.melLine = buildLine(input.melody || [], C.start, C.end, true);
    C.bassLine = buildLine(input.bass || [], C.start, C.end, false);
    if (!C.melLine.some(function (x) { return x.note; })) throw "error.noMelody";
    C.hasBass = C.bassLine.some(function (x) { return x.note; });
    var cp = buildLine(input.line || [], C.start, C.end, true);
    if (!cp.some(function (x) { return x.note; })) throw "error.noVoice";
    detectKeys(C, input.keys || []);
    analyseHarmony(C);
    findCadences(C);
    var mm = weightedMedian(C.melLine), cm = weightedMedian(cp);
    var role0 = cm >= mm ? "above" : (C.hasBass ? "middle" : "below");
    // ruolo della voce: dato dal generatore (anche battuta per battuta, con lo scambio delle parti) o dedotto
    var roles = (input.roles || []).slice().sort(function (a, b) { return a.t - b.t; });
    function roleAt(t) { var q = bsearch(roles, t); return q >= 0 ? roles[q].role : role0; }

    // note del contrappunto (attacchi), con i legami a precedente e successiva senza pause
    var notes = [], i;
    for (i = 0; i < cp.length; i++) {
        var sg = cp[i];
        if (!sg.note) continue;
        var last = notes[notes.length - 1];
        if (!sg.attack && last && last.end === sg.t && last.note.midi === sg.note.midi) { last.end = sg.end; continue; }
        notes.push({ t: sg.t, end: sg.end, note: sg.note });
    }
    for (i = 0; i < notes.length; i++) {
        notes[i].prev = (i > 0 && notes[i - 1].end === notes[i].t) ? notes[i - 1] : null;
        notes[i].next = (i + 1 < notes.length && notes[i + 1].t === notes[i].end) ? notes[i + 1] : null;
    }
    function noteOf(t) { for (var q = 0; q < notes.length; q++) if (notes[q].t <= t && t < notes[q].end) return notes[q]; return null; }

    var findings = [], seen = {};
    var rep = { key: { tpc: C.keys[0].key.tonicTpc, mode: C.keys[0].key.mode }, role: roles.length ? roles[0].role : role0, notes: notes.length, steps: 0, leaps: 0, contrary: 0, similar: 0, errors: 0, warnings: 0,
                figures: { passing: 0, neighbor: 0, cambiata: 0, double: 0, suspension: 0, appoggiatura: 0 } };
    function add(t, rule, level, args) {
        var id = t + ":" + rule;
        if (seen[id]) return;
        seen[id] = 1;
        findings.push({ tick: t, rule: rule, level: level, args: args || {} });
        if (level === "error") rep.errors++; else rep.warnings++;
    }
    function others(t) {
        var mel = noteAt(C.melLine, t), bass = noteAt(C.bassLine, t);
        if (opt.sameStaff && mel && bass && mel.midi === bass.midi) bass = null;
        return { mel: mel, bass: bass };
    }
    // dissonanza del contrappunto c nell'istante t: null, "diss" o "chord" (settima o tritono dell'accordo)
    function dissAt(c, t) {
        var o = others(t), ch = chordAt(C, t), dB = false, dM = false, cb = -1, role = roleAt(t);
        if (o.bass) { cb = mod(c.midi - o.bass.midi, 12); dB = !!DISS_LOW[cb]; }
        if (o.mel) {
            var im = role === "above" ? c.midi - o.mel.midi : o.mel.midi - c.midi, cm2 = mod(im, 12);
            var melLowest = role === "above" && !o.bass;
            var tab = (role === "below" || melLowest) ? DISS_LOW : DISS_UP;
            var triOK = cm2 === 6 && ch && ch.set[c.pc] && ch.set[o.mel.pc] && !melLowest;
            // se è la melodia a uscire dall'accordo (sua nota di passaggio o appoggiatura) l'urto non è del contrappunto
            var melCT = ch ? !!ch.set[o.mel.pc] : true;
            if ((tab[cm2] || (cm2 === 6 && !triOK)) && melCT) dM = true;
        }
        if (!dB && !dM) return null;
        var ct = !!(ch && ch.set[c.pc]), sev = ct && ch.seventh !== null && c.pc === ch.seventh;
        if (ct && !C.strict) {
            if (dB && (cb === 6 || sev)) { dB = false; sev = true; }
            if (dM) { dM = false; if (c.pc === ch.seventh) sev = true; }
        } else if (ct && sev) {
            if (dB && (cb === 10 || cb === 11 || cb === 1 || cb === 2 || cb === 6)) dB = false;
            dM = false;
        }
        if (dB || dM) return "diss";
        return sev ? "chord" : null;
    }
    function strongAt(t) {
        var m = measureAt(C.ms, t), st = strengthAt(m, t);
        if (st >= 3) return true;
        if (st < 2) return false;
        var ms = segAt(C.melLine, t), bs = segAt(C.bassLine, t);
        return !!((ms && ms.t === t && ms.attackAny) || (bs && bs.t === t && bs.attackAny));
    }

    // 1. ogni attacco del contrappunto: moto, salti, dissonanze, incroci
    var segStart = -1, segLen = 0, runDir = 0, maxM = -1;
    for (i = 0; i < notes.length; i++) {
        var n = notes[i], c = n.note, t = n.t, o = others(t), p = n.prev ? n.prev.note : null, role = roleAt(t);
        var ch = chordAt(C, t), key = keyAt(C, t);
        if (c.midi > maxM) maxM = c.midi;
        // incroci
        if (o.mel && ((role === "above" && c.midi < o.mel.midi) || (role !== "above" && c.midi > o.mel.midi))) add(t, "crossing", "error", { voice: "melody" });
        if (o.bass && role !== "below" && c.midi < o.bass.midi) add(t, "crossing", "error", { voice: "bass" });
        // sensibile raddoppiata
        if (ch && ch.dominant && c.pc === key.ltPc && ((o.mel && o.mel.pc === c.pc) || (o.bass && o.bass.pc === c.pc))) add(t, "ltDoubled", "warning");
        // falsa relazione
        var mp = noteAt(C.melLine, t - 1), bp = noteAt(C.bassLine, t - 1);
        [o.mel, o.bass, t > C.start ? mp : null, t > C.start ? bp : null].forEach(function (x) {
            if (x && x.letter === c.letter && x.pc !== c.pc) add(t, "crossRelation", "warning", { other: x.tpc, note: c.tpc });
        });
        if (p) {
            var d = c.dia - p.dia, ad = Math.abs(d), am = Math.abs(c.midi - p.midi), mv = c.midi - p.midi;
            if (ad === 1) rep.steps++; else if (am) rep.leaps++;
            // salti
            var bad = (ad === 1 && am === 3) || (ad === 2 && am !== 3 && am !== 4) || (ad === 3 && am !== 5) ||
                      (ad === 4 && am !== 7) || ad === 6 || (ad === 7 && am !== 12) || ad > 7 || (am === 6);
            var lp = { from: p.tpc, to: c.tpc, overOctave: ad > 7 };
            if (bad) add(t, "leap", "error", lp);
            else if (ad === 5 && C.strict && mv !== 8) add(t, "sixth", "warning", lp);
            if (n.prev.prev) {
                var pp = n.prev.prev.note, L = p.dia - pp.dia;
                if (Math.abs(L) >= 3 && (sign(d) === sign(L) || ad >= 3) && !(ad === 2 && Math.abs(L) === 2)) add(t, "leapRecovery", "warning");
            }
            // tratti nella stessa direzione
            var dir = sign(mv);
            if (dir !== 0) {
                if (segStart < 0 || runDir === 0) { segStart = p.midi; segLen = 1; }
                else if (dir === runDir) segLen++;
                else {
                    var span = Math.abs(p.midi - segStart);
                    if (segLen >= 2 && span === 6) add(n.prev.t, "outline", "warning");
                    if (segLen >= 2 && (span === 10 || span === 11)) add(n.prev.t, "outline7", "warning");
                    segStart = p.midi; segLen = 1;
                }
                runDir = dir;
            }
            // sensibile
            if (p.pc === keyAt(C, n.prev.t).ltPc && ch && ch.deg === 0 && d !== 1 && n.prev.t >= C.start) {
                var pch = chordAt(C, n.prev.t);
                if (pch && pch.dominant && role !== "middle") add(t, "ltResolution", "warning");
            }
            // moto rispetto a melodia e basso: parallele e dirette
            [["mel", "melody"], ["bass", "bass"]].forEach(function (v) {
                var a1 = o[v[0]], a0 = v[0] === "mel" ? mp : bp;
                if (!a0 || !a1 || a0.midi === a1.midi || p.midi === c.midi) return;
                if (opt.sameStaff && v[0] === "bass" && o.mel && a1.midi === o.mel.midi) return;
                var r0 = Math.abs(p.midi - a0.midi) % 12, r1 = Math.abs(c.midi - a1.midi) % 12;
                var dirO = sign(a1.midi - a0.midi);
                if (dirO === dir) rep.similar++; else rep.contrary++;
                if (r0 === r1 && (r1 === 0 || r1 === 7)) add(t, r1 === 7 ? "parallel5" : "parallel8", "error", { voice: v[1] });
                else if (C.strict && dirO === dir && (r1 === 0 || r1 === 7)) {
                    var outer = v[0] === "bass" ? role === "above" : (!C.hasBass && role !== "middle");
                    var upperLeap = role === "above" ? am > 2 : Math.abs(a1.midi - a0.midi) > 2;
                    if (outer && upperLeap) add(t, "hidden", "warning", { voice: v[1] });
                }
            });
        }
        // dissonanza all'attacco
        var ds = dissAt(c, t);
        if (ds) {
            var nx = n.next ? n.next.note : null;
            var inD = p ? c.dia - p.dia : null, outD = nx ? nx.dia - c.dia : null;
            if (ds === "chord") { if (nx && outD !== -1 && outD !== 0) add(t, "seventh", "warning"); }
            else if (strongAt(t)) {
                if (outD !== null && Math.abs(outD) === 1 && !C.strict) rep.figures.appoggiatura++;
                else add(t, "accented", C.strict ? "error" : "warning");
            } else if (inD !== null && Math.abs(inD) === 1 && outD !== null && Math.abs(outD) === 1) {
                if (sign(inD) === sign(outD)) rep.figures.passing++; else rep.figures.neighbor++;
            } else if (inD !== null && Math.abs(inD) === 1 && outD !== null && Math.abs(outD) === 2 && n.next.next &&
                       n.next.next.t === n.next.end && Math.abs(n.next.next.note.dia - nx.dia) === 1 &&
                       sign(n.next.next.note.dia - nx.dia) === -sign(outD)) {
                if (sign(outD) === sign(inD)) rep.figures.cambiata++; else rep.figures.double++;
            } else if (inD !== null && Math.abs(inD) === 2 && outD !== null && Math.abs(outD) === 1 && sign(outD) === -sign(inD) &&
                       n.prev.prev && n.prev.prev.end === n.prev.t && n.prev.prev.note.dia === nx.dia &&
                       Math.abs(p.dia - n.prev.prev.note.dia) === 1 && !strongAt(t)) {
                // seconda vicina della doppia volta (X – vicina sopra – vicina sotto – X)
            } else add(t, "dissonance", "error");
        }
    }
    // 2. note tenute mentre le altre voci si muovono: ritardi
    var pts = {};
    [C.melLine, C.bassLine].forEach(function (line) { for (var q = 0; q < line.length; q++) if (line[q].attackAny) pts[line[q].t] = 1; });
    Object.keys(pts).map(Number).sort(function (a, b) { return a - b; }).forEach(function (t) {
        var n = noteOf(t);
        if (!n || n.t === t) return;
        var ds = dissAt(n.note, t);
        if (!ds) return;
        var nx = n.next ? n.next.note : null, outD = nx ? nx.dia - n.note.dia : null;
        if (ds === "chord") { if (nx && outD !== -1 && outD !== 0) add(n.end, "seventh", "warning"); return; }
        if (dissAt(n.note, n.t)) return;                  // già dissonante all'attacco: rilevato sopra
        // su un tempo debole è l'altra voce a passare (sua nota di passaggio o di volta)
        if (!strongAt(t)) return;
        if (outD === -1) { if (!seen["sus" + n.t]) { seen["sus" + n.t] = 1; rep.figures.suspension++; } }
        else if (nx || n.end < C.end) add(t, "suspension", "error");
    });
    // 3. culmine e finale
    var tops = notes.filter(function (x) { return x.note.midi === maxM; });
    for (i = 1; i < tops.length; i++) add(tops[i].t, "climax", "warning", { n: i + 1 });
    var lastN = notes[notes.length - 1], fch = chordAt(C, lastN.t), fk = keyAt(C, lastN.t);
    if (fch && (!fch.set[lastN.note.pc] || (fch.root !== fk.tonicPc && fch.deg !== 0))) add(lastN.t, "final", "warning");
    findings.sort(function (a, b) { return a.tick - b.tick || (a.level === "error" ? -1 : 1); });
    return { findings: findings, report: rep };
}

// esportazioni per il collaudo in node
var Engine = { generate: generate, analyze: analyze, makeKey: makeKey, tpcName: tpcName, DEFAULTS: DEFAULTS, RULES: RULES };
if (typeof module !== "undefined") module.exports = Engine;
