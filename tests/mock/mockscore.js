.pragma library
// Spartito simulato con un sottoinsieme dell'API plugin di MuseScore usato da contrappunto.qml.
var CHORD = 93, REST = 25;
var STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var LET_TPC = { C: 14, D: 16, E: 18, F: 13, G: 15, A: 17, B: 19 };
var DUR = { w: 1920, "h.": 1440, h: 960, "q.": 720, q: 480, "e.": 360, e: 240, s: 120 };

function parseLine(str) {
    var t = 0, out = [];
    str.trim().split(/\s+/).forEach(function (tok) {
        var p = tok.split(":"), d = DUR[p[1]];
        if (p[0] === "r") out.push(el(t, d, REST, []));
        else {
            var m = /^([A-G])(#|b)?(-?\d)$/.exec(p[0]);
            var alt = m[2] === "#" ? 1 : (m[2] === "b" ? -1 : 0);
            var midi = (parseInt(m[3]) + 1) * 12 + STEP[m[1]] + alt, tpc = LET_TPC[m[1]] + 7 * alt;
            out.push(el(t, d, CHORD, [{ pitch: midi, tpc: tpc, tpc1: tpc, tpc2: tpc, tieBack: null, tieFor: null }]));
        }
        t += d;
    });
    return out;
}

function el(tick, dur, type, notes) {
    var e = { tick: tick, dur: dur, type: type, notes: notes };
    Object.defineProperty(e, "duration", { get: function () { return { ticks: e.dur, numerator: e.dur, denominator: 1920 }; } });
    return e;
}
function makeScore(spec) {
    var S = { log: [], tracks: [], parts: [], sharps: spec.sharps || 0 };
    var mlen = spec.num * 1920 / spec.den, nMeas = spec.measures;
    S.endTick = mlen * nMeas;
    // misure
    var measures = [];
    for (var i = 0; i < nMeas; i++) measures.push({ firstSegment: { tick: i * mlen }, lastSegment: { tick: (i + 1) * mlen },
                                                     timesigNominal: { numerator: spec.num, denominator: spec.den } });
    for (i = 0; i < nMeas; i++) measures[i].nextMeasure = measures[i + 1] || null;
    S.firstMeasure = measures[0];
    S.lastSegment = { tick: S.endTick };
    function addStaff(name, lines) {
        var s0 = S.tracks.length / 4;
        for (var v = 0; v < 4; v++) S.tracks.push([]);
        (lines || []).forEach(function (ln, v) { S.tracks[s0 * 4 + v] = parseLine(ln); });
        if (!lines || !lines.length) for (var k = 0; k < nMeas; k++) S.tracks[s0 * 4].push(el(k * mlen, mlen, REST, []));
        return s0;
    }
    spec.staves.forEach(function (st) {
        var s0 = addStaff(st.name, st.voices);
        S.parts.push({ partName: st.name, longName: st.name, startTrack: s0 * 4, endTrack: s0 * 4 + 4 });
    });
    Object.defineProperty(S, "nstaves", { get: function () { return S.tracks.length / 4; } });
    S.appendPart = function (id) {
        S.log.push("appendPart(" + id + ")");
        var s0 = addStaff(id, null);
        S.parts.push({ partName: id, longName: id, startTrack: s0 * 4, endTrack: s0 * 4 + 4 });
    };
    S.startCmd = function () { S.log.push("startCmd"); };
    S.endCmd = function (rb) { S.log.push("endCmd" + (rb ? "(rollback)" : "")); };
    var selected = [];
    S.selection = { isRange: !!spec.selection, startStaff: 0, endStaff: 2,
                    startSegment: spec.selection ? { tick: spec.selection[0] } : null,
                    endSegment: spec.selection ? { tick: spec.selection[1] } : null,
                    clear: function () { selected = []; },
                    select: function (el, add) { if (!add) selected = []; selected.push(el); return true; } };
    S._cmd = function (name) {
        if (name !== "tie") return;
        selected.forEach(function (n) { n.tieFor = { mock: true }; n._tied = true; });
        S.log.push("tie x" + selected.length);
    };
    S.newCursor = function () { return makeCursor(S); };
    return S;
}

function makeCursor(S) {
    var c = { staffIdx: 0, voice: 0, _tick: 0, _idx: -1, _dur: 480 };
    function tr() { return S.tracks[c.staffIdx * 4 + c.voice]; }
    Object.defineProperty(c, "track", { get: function () { return c.staffIdx * 4 + c.voice; },
                                        set: function (t) { c.staffIdx = Math.floor(t / 4); c.voice = t % 4; } });
    Object.defineProperty(c, "tick", { get: function () { return c._tick; } });
    Object.defineProperty(c, "segment", { get: function () {
        var t = tr(); if (c._idx >= 0 && c._idx < t.length) return { tick: t[c._idx].tick }; return null; } });
    Object.defineProperty(c, "element", { get: function () { var t = tr(); return (c._idx >= 0 && c._idx < t.length) ? t[c._idx] : null; } });
    Object.defineProperty(c, "keySignature", { get: function () { return S.sharps; } });
    c.rewind = function (mode) { var t = tr(); c._idx = t.length ? 0 : -1; c._tick = t.length ? t[0].tick : 0; };
    c.rewindToTick = function (tk) {
        var t = tr(); c._idx = -1;
        for (var i = 0; i < t.length; i++) if (t[i].tick >= tk) { c._idx = i; break; }
        c._tick = c._idx >= 0 ? t[c._idx].tick : tk;
    };
    c.next = function () { var t = tr(); c._idx++; if (c._idx < t.length) { c._tick = t[c._idx].tick; return true; } c._idx = t.length; return false; };
    c.setDuration = function (n, d) { c._dur = Math.round(1920 * n / d); };
    function put(x) {
        var t = tr(), a = c._tick, b = a + x.dur;
        if (S.trace) console.log("put " + (x.type === CHORD ? x.notes[0].pitch : "r") + " @" + a + "+" + x.dur);
        for (var i = t.length - 1; i >= 0; i--) {
            var e = t[i];
            if (e.tick < b && e.tick + e.dur > a) {
                if (e.tick < a) { e.dur = a - e.tick; continue; }              // tronca
                if (e.tick + e.dur > b) { t.splice(i, 1, el(b, e.tick + e.dur - b, REST, [])); continue; }
                t.splice(i, 1);
            }
        }
        t.push(x); t.sort(function (u, w) { return u.tick - w.tick; });
        c._tick = b; c._idx = t.indexOf(x) + 1;
    }
    c.addNote = function (p, add) {
        var tpc = [14, 21, 16, 11, 18, 13, 20, 15, 10, 17, 12, 19][p % 12];
        put(el(c._tick, c._dur, CHORD, [{ pitch: p, tpc: tpc, tpc1: tpc, tpc2: tpc, tieBack: null, tieFor: null }]));
    };
    c.addRest = function () { put(el(c._tick, c._dur, REST, [])); };
    c.add = function (e) { S.log.push("add(" + (e.text || e.type) + " @" + c._tick + " rigo " + c.staffIdx + ")"); };
    return c;
}
