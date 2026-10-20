.pragma library
/*
 * Contrappunto automatico – motore di generazione
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
    variety: 3,             // 0..10, casualità controllata
    seed: 1,
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
var NAMES = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];

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
    k.name = tpcName(t0) + (minor ? " minore" : " maggiore");
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
    C.ms = prepMeasures(input.measures, opt.meter);
    if (!C.ms.length) throw "Nessuna misura nell'intervallo.";
    C.melLine = buildLine(input.melody || [], C.start, C.end, true);
    C.bassLine = buildLine(input.bass || [], C.start, C.end, false);
    var hasMel = C.melLine.some(function (s) { return s.note; });
    if (!hasMel) throw "La melodia non contiene note nell'intervallo scelto.";
    C.hasBass = C.bassLine.some(function (s) { return s.note; });

    detectKeys(C, input.keys || []);
    chooseRange(C);
    analyseHarmony(C);
    findCadences(C);
    var events = planEvents(C);
    annotate(C, events);
    var path = search(C, events);
    var items = buildItems(C, events, path);
    var report = verify(C, events, path);
    report.key = C.keyName;
    report.role = C.role;
    report.range = [C.lo, C.hi];
    report.events = events.length;
    report.notes = items.filter(function (x) { return x.midi !== null; }).length;
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

function chooseRange(C) {
    var mm = weightedMedian(C.melLine);
    var bm = C.hasBass ? weightedMedian(C.bassLine) : null;
    var pos = C.opt.position, reg = C.opt.register;
    var presets = { soprano: [60, 81], alto: [53, 74], tenor: [48, 69], bass: [40, 62] };
    var role, lo, hi;
    if (pos === "auto") {
        if (presets[reg]) {
            var cen = (presets[reg][0] + presets[reg][1]) / 2;
            role = cen > mm ? "above" : (C.hasBass ? "middle" : "below");
        } else if (C.hasBass) role = (mm - bm >= 12) ? "middle" : "above";
        else role = mm >= 64 ? "below" : "above";
    } else role = pos;
    if (role === "middle" && !C.hasBass) role = "below";
    if (role === "below" && C.hasBass) role = "middle";

    if (presets[reg]) { lo = presets[reg][0]; hi = presets[reg][1]; }
    else if (role === "above") { lo = mm - 2; hi = mm + 14; }
    else if (role === "middle") {
        var c = Math.round((mm + bm) / 2);
        lo = Math.max(c - 8, bm + 3); hi = Math.min(c + 8, mm + 1);
        if (hi - lo < 12) { lo = c - 6; hi = c + 6; }
    } else { lo = mm - 19; hi = mm - 1; }
    lo = Math.max(lo, 36); hi = Math.min(hi, 91);
    if (hi - lo < 10) hi = lo + 12;
    C.role = role; C.lo = lo; C.hi = hi; C.melMed = mm; C.bassMed = bm;
    C.candCache = {};
}

function candsFor(C, key) {
    var id = key.sharps + key.mode;
    if (C.candCache[id]) return C.candCache[id];
    var out = [];
    for (var i = 0; i < key.scale.length; i++) {
        var sc = key.scale[i], pc = tpcToPc(sc.tpc), letter = tpcToLetter(sc.tpc);
        for (var midi = C.lo; midi <= C.hi; midi++) {
            if (mod(midi, 12) !== pc) continue;
            out.push({ midi: midi, tpc: sc.tpc, pc: pc, letter: letter, dia: diaOf(midi, letter), deg: sc.deg,
                       raised: sc.raised, natural: sc.natural,
                       isLT: key.minor ? (sc.raised && sc.deg === 6) : sc.deg === 6 });
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
    // attacchi del basso in contrappunto fiorito/libero
    ticks = uniqSort(ticks);
    var events = [];
    for (i = 0; i < ticks.length; i++) {
        var t0 = ticks[i], t1 = i + 1 < ticks.length ? ticks[i + 1] : C.end;
        if (t1 <= t0) continue;
        var ev = { tick: t0, dur: t1 - t0 };
        var g = gapOf(t0);
        if (g) { ev.gap = g; ev.gapIdx = g.onsets.indexOf(t0); ev.gapInt = ev.gapIdx >= 1 ? g.ints[ev.gapIdx - 1] : null; }
        events.push(ev);
    }
    return events;
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
    if (sp === "florid") florid = !fast || C.rng() < 0.12;
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
        // spazio reale disponibile per il contrappunto in questo istante
        if (C.role === "middle" && ev.mel) ev.crowded = ev.mel.midi - Math.max(C.lo, ev.bass ? ev.bass.midi + 3 : C.lo) < 6;
        else if (C.role === "above" && ev.mel) ev.crowded = Math.min(C.hi, ev.mel.midi + 16) - Math.max(C.lo, ev.mel.midi + 3) < 4;
        else if (C.role === "below" && ev.mel) ev.crowded = Math.min(C.hi, ev.mel.midi - 3) - C.lo < 4;
        else ev.crowded = false;
        ev.isFinal = (i === events.length - 1);
        ev.isCad = false;
        for (var c = 0; c < cadSet.length; c++) if (cadSet[c] >= t && cadSet[c] < te) ev.isCad = true;
        if (ev.isCad && i > 0) events[i - 1].isPreCad = true;
    }
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

// ---------------------------------------------------------------- valutazione
var DISS_LOW = { 1: 1, 2: 1, 5: 1, 6: 1, 10: 1, 11: 1 };   // contro la voce più grave
var DISS_UP = { 1: 1, 2: 1, 10: 1, 11: 1 };               // tra voci superiori

function staticScore(C, ev, c) {
    var s = 0, role = C.role, r = { dissB: false, dissM: false, sev: false, ct: false };
    var bass = ev.bass, mel = ev.mel, ch = ev.chord, cb = -1, x;
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
        var dissTable = (role === "below") ? DISS_LOW : DISS_UP;
        if (dissTable[cm]) { if (melCT) r.dissM = true; else s -= 8; }
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
    var sp = C.opt.species;

    // 1. obblighi lasciati dalla nota precedente
    if (node.pend) {
        if (node.pend === "sus") {
            if (d === -1 && !diss) s += 15;
            else if (hold) s -= 40;
            else s -= 120;
        } else if (node.pend === "step") {
            if (ad === 1) { if (diss && sign(d) !== sign(node.lastD)) s -= 60; }
            else s -= 120;
        } else if (node.pend === "down") {
            if (d === -1) s += 8; else if (hold) s -= 6; else s -= 35;
        }
    }

    // 2. trattamento della dissonanza corrente
    if (diss) {
        var strongPos = ev.strength >= 2;
        if (!p) s -= 90;
        else if (hold) {
            if (node.cons) { s -= strongPos ? 2 : 8; pend = "sus"; if (sp === "sus") s += 18; }
            else s -= 70;
        } else if (ad === 1) {
            if (strongPos) { s -= strict ? 60 : 20; }   // appoggiatura (solo nello stile libero)
            else s -= 4;                               // nota di passaggio / di volta
            pend = "step";
        } else s -= strict ? 100 : 60;                 // dissonanza per salto
        if (sp === "1:1") s -= 80;                     // nota contro nota: niente dissonanze
    } else if (st.sev) { pend = "down"; s -= 1; }

    // 3. sensibile e alterazioni del minore
    if (p && !hold) {
        if (p.isLT && node.ltActive && d !== 1) s -= (ev.isCad || ev.isFinal) ? 40 : (C.role === "middle" ? 10 : 18);
        if (p.isLT && node.ltActive && d === 1) s += 4;
        if (p.raised && d < 0) s -= 30;
        if (p.raised && p.deg === 5 && !(d === 1 && c.raised)) s -= 12;
        if (p.natural && p.deg === 6 && d > 0) s -= 12;
    }

    // 4. linea melodica
    var run = node.run, newMax = node.maxM, newCnt = node.maxCnt, newMaxIdx = node.maxIdx;
    if (p && !hold) {
        var am = Math.abs(mv);
        if (ad === 0) s -= 40;
        else if (ad === 1) s += (am === 3 ? -90 : 16);
        else if (ad === 2) s += (am === 3 || am === 4) ? 3 : -60;
        else if (ad === 3) s += (am === 5) ? -7 : -90;
        else if (ad === 4) s += (am === 7) ? -11 : (strict ? -60 : -35);
        else if (ad === 5) s += (mv === 8) ? -12 : (strict ? -40 : -22);
        else if (ad === 7) s += (am === 12) ? -12 : -90;
        else s -= 100;
        if (C.role === "below" && (ad === 3 || ad === 4 || ad === 7)) s += 8;   // salti tipici del basso
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
        if (ev.idx === 0 && C.role === "below") s += (c.pc === ev.key.tonicPc) ? 25 : -10;
        if (ev.bass) { var x0 = mod(c.midi - ev.bass.midi, 12); if (x0 === 0 || x0 === 7) s += 4; }
        if (c.midi > node.maxM) { newMax = c.midi; newCnt = 1; newMaxIdx = ev.idx; }
    }

    // 5. ritmo: tenere o muoversi
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
                if (C.role === "above") s -= leap ? (strict ? 150 : 60) : 15;
                else s -= leap ? (strict ? 30 : 12) : 4;
            }
            if (dirB !== 0 && dirB === -dirC) s += 6;
        }
        if (m && mp) {
            dirM = sign(m.midi - mp.midi);
            var q0 = Math.abs(mp.midi - p.midi) % 12, q1 = Math.abs(m.midi - c.midi) % 12;
            if (dirM !== 0 && q0 === q1 && (q1 === 0 || q1 === 7)) { if (!relax) return null; s -= 400; }
            if (dirM === dirC && (q1 === 0 || q1 === 7)) {
                var upperLeap = C.role === "above" ? Math.abs(mv) > 2 : Math.abs(m.midi - mp.midi) > 2;
                var outer = C.role === "above" || C.role === "below";
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
    if ((ev.isCad || ev.isFinal) && p && !hold && C.role !== "below") s += (ad === 1 ? 10 : (ad === 2 ? 2 : -6));

    // 9. evita di ripetere la stessa figura battuta dopo battuta
    if (p && !hold) {
        var b1 = pitchAt(node, ev.tick - ev.m.len), b2 = pitchAt(node, ev.tick - 2 * ev.m.len);
        if (b1 === c.midi) s -= (b2 === c.midi ? 9 : 3);
    }

    s += C.opt.variety * (C.rng() - 0.5) * 6;

    var pm = 0;
    if (p && !hold && ev.mel && ev.melPrev) {
        var dM = sign(ev.mel.midi - ev.melPrev.midi);
        if (dM !== 0 && dM === sign(mv) && Math.abs(ev.melPrev.midi - p.midi) % 12 === Math.abs(ev.mel.midi - c.midi) % 12) pm = node.pm + 1;
    }
    return {
        c: c, prev: node, score: node.score + s,
        lastD: hold ? node.lastD : d, run: hold ? node.run : run,
        hold: hold ? node.hold + 1 : 0,
        maxM: newMax, maxCnt: newCnt, maxIdx: newMaxIdx, minM: Math.min(node.minM, c.midi), span: 1,
        pend: pend, cons: !diss, pm: pm,
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

function restNode(node) {
    return { c: null, prev: node, score: node.score - (node.pend ? 100 : 0), lastD: 0, run: 0, hold: 0,
             maxM: node.maxM, maxCnt: node.maxCnt, maxIdx: node.maxIdx, minM: node.minM, span: node.span,
             pend: null, cons: true, pm: 0, pp: -1, ppp: -1, ltActive: false };
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
    var root = { c: null, prev: null, score: 0, lastD: 0, run: 0, hold: 0, maxM: -1, maxCnt: 0, maxIdx: -1,
                 minM: 999, pend: null, cons: true, pm: 0, pp: -1, ppp: -1, ltActive: false };
    var beam = [root], i, j, n;
    for (i = 0; i < events.length; i++) {
        var ev = events[i];
        ev.idx = i;
        var children = [];
        if (ev.rest) {
            for (n = 0; n < beam.length; n++) { var rn = restNode(beam[n]); rn.t = ev.tick; children.push(rn); }
        } else {
            var cands = candsFor(C, ev.key);
            var stat = [];
            for (j = 0; j < cands.length; j++) stat.push(staticScore(C, ev, cands[j]));
            for (var pass = 0; pass < 2 && !children.length; pass++) {
                for (n = 0; n < beam.length; n++)
                    for (j = 0; j < cands.length; j++) {
                        var ch = evalTransition(C, ev, beam[n], cands[j], stat[j], pass === 1);
                        if (ch) { ch.t = ev.tick; children.push(ch); }
                    }
            }
            // il contrappunto può anche tacere (con un costo), utile dove manca lo spazio
            if (!ev.isFinal) for (n = 0; n < beam.length; n++) { var orn = optionalRest(C, ev, beam[n]); orn.t = ev.tick; children.push(orn); }
        }
        var best = {};
        for (j = 0; j < children.length; j++) {
            var x = children[j], pc = x.prev.c;
            var key = (x.c ? x.c.midi : "r") + "|" + (pc ? pc.midi : "r") + "|" + (x.pend || "") + "|" + (x.hold > 0 ? 1 : 0);
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
        if (nd.maxIdx >= 0 && total > 4) {
            var rel = nd.maxIdx / total;
            if (rel >= 0.35 && rel <= 0.85) sc += 25;
            if (nd.maxCnt > 1) sc -= 20 * (nd.maxCnt - 1);
        }
        if (sc > bestScore) { bestScore = sc; bestNode = nd; }
    }
    var path = new Array(total);
    for (i = total - 1; i >= 0; i--) { path[i] = bestNode.c; bestNode = bestNode.prev; }
    return path;
}

// ---------------------------------------------------------------- uscita
function buildItems(C, events, path) {
    var runs = [], i;
    for (i = 0; i < events.length; i++) {
        var ev = events[i], c = path[i], last = runs[runs.length - 1];
        if (last && last.end === ev.tick &&
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
                [[ev.bassPrev, ev.bass, "basso"], [ev.melPrev, ev.mel, "melodia"]].forEach(function (pr) {
                    var a0 = pr[0], a1 = pr[1];
                    if (!a0 || !a1 || a0.midi === a1.midi) return;
                    var r0 = Math.abs(p.midi - a0.midi) % 12, r1 = Math.abs(c.midi - a1.midi) % 12;
                    if (r0 === r1 && (r1 === 0 || r1 === 7)) {
                        rep.parallels++;
                        rep.details.push((r1 === 7 ? "5e" : "8e") + " parallele con " + pr[2] + " a tick " + ev.tick);
                    }
                    if (sign(a1.midi - a0.midi) === sign(c.midi - p.midi)) rep.similar++; else rep.contrary++;
                });
            }
        }
        prevI = i;
    }
    for (i = 0; i < events.length; i++) if (path[i] && path[i].midi === maxM && (i === 0 || !path[i - 1] || path[i - 1].midi !== maxM)) rep.climaxCount++;
    return rep;
}

// esportazioni per il collaudo in node
var Engine = { generate: generate, makeKey: makeKey, tpcName: tpcName, DEFAULTS: DEFAULTS };
if (typeof module !== "undefined") module.exports = Engine;
