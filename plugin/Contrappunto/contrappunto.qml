//=============================================================================
//  Contrappunto automatico – plugin per MuseScore 4
//  Genera una voce di contrappunto a partire da melodia (canto dato) e basso
//  e la scrive in un rigo/voce esistente oppure in un nuovo rigo.
//  Il motore musicale è in contrappunto_engine.js.
//=============================================================================
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import MuseScore 3.0
import "contrappunto_engine.js" as Engine

MuseScore {
    id: plugin
    title: "Contrappunto automatico"
    description: "Genera una contro-melodia in contrappunto (nota contro nota, 2:1, 4:1, ritardi, fiorito o libero) e la inserisce in un rigo esistente o in un nuovo rigo. Può calcolare più varianti e ordinarle per qualità."
    version: "2.4.0"
    categoryCode: "composing-arranging-tools"
    pluginType: "dialog"
    requiresScore: true
    width: 860
    height: 640

    // ------------------------------------------------------------------ stato
    property var staffNames: []
    property int rangeStart: 0
    property int rangeEnd: 0
    property string rangeLabel: ""

    // varianti
    property bool busy: false
    property var job: null              // calcolo in corso (vedi generate())
    property var candidates: []         // [{ seed, res, staff, voice }] ordinate per qualità
    property int chosen: -1             // variante scritta nella destinazione
    property var target: null           // { staff, voice } dove si scrive la variante scelta
    property bool separateStaves: false // ultima generazione: una variante per rigo
    signal generationFinished()

    readonly property var speciesValues: ["free", "1:1", "2:1", "4:1", "sus", "florid"]
    readonly property var speciesLabels: ["Libero (ritmo complementare)", "1:1 – nota contro nota", "2:1 – due note contro una",
                                          "4:1 – quattro note contro una", "Ritardi (4ª specie)", "Fiorito (5ª specie)"]
    readonly property var positionValues: ["auto", "above", "middle", "below"]
    readonly property var positionLabels: ["Automatica", "Sopra la melodia (soprano/contralto)",
                                           "Sotto la melodia, sopra il basso (tenore)", "Sotto la melodia, come basso"]
    readonly property var registerValues: ["auto", "soprano", "alto", "tenor", "bass"]
    readonly property var registerLabels: ["Automatico", "Soprano (Do4–La5)", "Contralto (Fa3–Re5)", "Tenore (Do3–La4)", "Basso (Mi2–Re4)"]
    // estensioni comode (suoni reali, MIDI): il contrappunto resta sempre dentro
    readonly property var instruments: [
        { label: "Violino", id: "violin", lo: 55, hi: 88 },        // Sol3–Mi6
        { label: "Flauto", id: "flute", lo: 60, hi: 93 },          // Do4–La6
        { label: "Oboe", id: "oboe", lo: 58, hi: 86 },             // Sib3–Re6
        { label: "Viola", id: "viola", lo: 48, hi: 81 },           // Do3–La5
        { label: "Violoncello", id: "violoncello", lo: 36, hi: 72 }, // Do2–Do5
        { label: "Fagotto", id: "bassoon", lo: 34, hi: 70 },       // Sib1–Sib4
        { label: "Voce – Soprano", id: "soprano", lo: 60, hi: 81 },
        { label: "Voce – Contralto", id: "alto", lo: 53, hi: 74 },
        { label: "Voce – Tenore", id: "tenor", lo: 48, hi: 69 },
        { label: "Voce – Basso", id: "bass", lo: 40, hi: 62 },
        { label: "Pianoforte", id: "piano", lo: 21, hi: 108 }
    ]

    // ------------------------------------------------------------------ tema
    // Colori presi dal tema di MuseScore (ui.theme, chiaro/scuro/alto contrasto);
    // se non disponibile, dalla tavolozza di sistema. Nessun colore fisso.
    property bool dark: false
    property color cBg: sysPal.window
    property color cPanel: sysPal.window
    property color cText: sysPal.windowText
    property color cTextDim: sysPal.windowText
    property color cField: sysPal.base
    property color cButton: sysPal.button
    property color cAccent: sysPal.highlight
    property color cBorder: sysPal.mid
    property color cError: "#b00020"
    property color cGood: "#1e7d45"

    SystemPalette { id: sysPal; colorGroup: SystemPalette.Active }

    function luma(c) { return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }
    function mix(a, b, t) { return Qt.rgba(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, 1); }

    function applyTheme() {
        var t = null;
        try { if (typeof ui !== "undefined" && ui && ui.theme && ui.theme.backgroundPrimaryColor !== undefined) t = ui.theme; } catch (e) {}
        if (t) {
            cBg = t.backgroundPrimaryColor;
            cPanel = t.backgroundSecondaryColor !== undefined ? t.backgroundSecondaryColor : t.backgroundPrimaryColor;
            cText = t.fontPrimaryColor;
            cButton = t.buttonColor !== undefined ? t.buttonColor : sysPal.button;
            cField = t.textFieldColor !== undefined ? t.textFieldColor : cButton;
            cAccent = t.accentColor !== undefined ? t.accentColor : sysPal.highlight;
            cBorder = t.strokeColor !== undefined ? t.strokeColor : mix(cBg, cText, 0.35);
        } else {
            cBg = sysPal.window; cPanel = sysPal.window; cText = sysPal.windowText;
            cButton = sysPal.button; cField = sysPal.base; cAccent = sysPal.highlight;
            cBorder = mix(cBg, cText, 0.35);
        }
        dark = luma(cBg) < 0.5;
        // garanzia di leggibilità: se il testo non contrasta con lo sfondo lo forzo
        if (Math.abs(luma(cText) - luma(cBg)) < 0.4) cText = dark ? "#f0f0f0" : "#1b1b1b";
        cTextDim = mix(cBg, cText, 0.72);
        cError = dark ? "#ff8a80" : "#b00020";
        cGood = dark ? "#7fd6a0" : "#1e7d45";
    }

    Component.onCompleted: applyTheme()

    onRun: {
        if (!curScore) { quit(); return; }
        applyTheme();
        refreshStaves();
        captureRange();
        var sel = curScore.selection;
        var mel = 0, bas = Math.min(1, curScore.nstaves - 1);
        if (sel && sel.isRange) {
            mel = sel.startStaff;
            bas = (sel.endStaff - 1 > sel.startStaff) ? sel.endStaff - 1 : Math.min(mel + 1, curScore.nstaves - 1);
        }
        melodyCombo.currentIndex = mel;
        bassCombo.currentIndex = (bas === mel) ? 0 : bas + 1;   // 0 = "nessuno"
        targetStaffCombo.currentIndex = mel;
        seedSpin.value = Math.floor(Math.random() * 9000) + 1;
        candidates = [];
        chosen = -1;
        setStatus("Pronto. Imposta le opzioni e premi Genera.", "info");
    }

    // ------------------------------------------------------------------ utilità score
    function refreshStaves() {
        var names = [];
        for (var s = 0; s < curScore.nstaves; s++) names.push("Rigo " + (s + 1));
        for (var p = 0; p < curScore.parts.length; p++) {
            var part = curScore.parts[p];
            var s0 = Math.floor(part.startTrack / 4), s1 = Math.floor(part.endTrack / 4);
            var nm = part.partName || part.longName || ("Parte " + (p + 1));
            for (var st = s0; st < s1 && st < names.length; st++)
                names[st] = (st + 1) + ": " + nm + ((s1 - s0 > 1) ? (" – rigo " + (st - s0 + 1)) : "");
        }
        staffNames = names;
    }

    function allMeasures() {
        var list = [], m = curScore.firstMeasure, first = true;
        while (m) {
            var t = m.firstSegment.tick;
            var nm = m.nextMeasure;
            var tEnd = nm ? nm.firstSegment.tick : curScore.lastSegment.tick;
            var ts = measureTimeSig(m);
            list.push({ tick: t, len: tEnd - t, num: ts.num, den: ts.den, isFirst: first, measure: m });
            first = false;
            m = nm;
        }
        return list;
    }

    // Prova più strade per leggere l'indicazione di tempo (le API cambiano tra le versioni 4.x)
    function fracOf(f) {
        try { if (f && f.numerator > 0 && f.denominator > 0) return { num: f.numerator, den: f.denominator }; } catch (e) {}
        return null;
    }
    function measureTimeSig(m) {
        var r = null;
        try { r = fracOf(m.timesigNominal); } catch (e) {}
        if (!r) try { r = fracOf(m.timesigActual); } catch (e) {}
        if (!r) {
            try {
                var seg = m.firstSegment;
                while (seg && !r && seg.tick === m.firstSegment.tick) {
                    var el = seg.elementAt(0);
                    if (el && el.type === Element.TIMESIG) {
                        r = fracOf(el.timesig) || fracOf(el.globalTimesig);
                        if (!r && el.numerator > 0) r = { num: el.numerator, den: el.denominator };
                    }
                    seg = seg.nextInMeasure;
                }
            } catch (e2) {}
        }
        return r || { num: 0, den: 0 };   // 0 = sconosciuto: il motore lo dedurrà dalla durata
    }

    function captureRange() {
        var ms = allMeasures();
        var sel = curScore.selection;
        var st = 0, en = curScore.lastSegment.tick;
        if (sel && sel.isRange) {
            st = sel.startSegment.tick;
            en = sel.endSegment ? sel.endSegment.tick : curScore.lastSegment.tick;
        }
        var a = 0, b = ms.length - 1;
        for (var i = 0; i < ms.length; i++) {
            if (ms[i].tick <= st) a = i;
            if (ms[i].tick < en) b = i;
        }
        rangeStart = ms[a].tick;
        rangeEnd = ms[b].tick + ms[b].len;
        rangeLabel = (sel && sel.isRange) ? ("Intervallo: battute " + (a + 1) + "–" + (b + 1) + ".")
                                          : ("Tutto lo spartito (battute 1–" + ms.length + ").");
    }

    function elTicks(el) {
        try { if (el.actualDuration && el.actualDuration.ticks > 0) return el.actualDuration.ticks; } catch (e) {}
        try { if (el.duration && el.duration.ticks > 0) return el.duration.ticks; } catch (e) {}
        return 480;
    }

    // Legge tutte le voci di un rigo (tranne excludeVoice) come eventi {tick, dur, notes}
    function readStaff(staffIdx, excludeVoice) {
        var out = [];
        for (var v = 0; v < 4; v++) {
            if (v === excludeVoice) continue;
            var c = curScore.newCursor();
            c.staffIdx = staffIdx;
            c.voice = v;
            c.rewind(Cursor.SCORE_START);
            while (c.segment) {
                var t = c.tick;
                if (t >= rangeEnd) break;
                var el = c.element;
                if (el && el.type === Element.CHORD) {
                    var d = elTicks(el);
                    if (t + d > rangeStart) {
                        var notes = [];
                        for (var n = 0; n < el.notes.length; n++) {
                            var nt = el.notes[n];
                            notes.push({ midi: nt.pitch, tpc: (nt.tpc1 !== undefined ? nt.tpc1 : nt.tpc), tieBack: !!nt.tieBack });
                        }
                        out.push({ tick: t, dur: d, notes: notes });
                    }
                }
                c.next();
            }
        }
        return out;
    }

    function readKeys(staffIdx, measures) {
        var keys = [];
        var c = curScore.newCursor();
        c.staffIdx = staffIdx;
        c.voice = 0;
        for (var i = 0; i < measures.length; i++) {
            var m = measures[i];
            if (m.tick + m.len <= rangeStart || m.tick >= rangeEnd) continue;
            c.rewindToTick(m.tick);
            var ks = c.keySignature;
            if (!keys.length || keys[keys.length - 1].sharps !== ks) keys.push({ tick: m.tick, sharps: ks });
        }
        return keys;
    }

    function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }

    // Accordi di una voce dentro l'intervallo, nell'ordine in cui li incontra il cursore
    function chordsIn(staffIdx, voice) {
        var out = [];
        var c = curScore.newCursor();
        c.staffIdx = staffIdx;
        c.voice = voice;
        c.rewind(Cursor.SCORE_START);
        while (c.segment && c.tick < rangeEnd) {
            var el = c.element;
            if (el && el.type === Element.CHORD && c.tick >= rangeStart) out.push({ tick: c.tick, el: el });
            c.next();
        }
        return out;
    }

    // Toglie le note già presenti nella voce di destinazione: in MuseScore 4 la
    // sovrascrittura del cursore non sempre elimina le note della variante
    // precedente, che restano udibili sotto la nuova.
    function clearTrack(staffIdx, voice) {
        var chords = chordsIn(staffIdx, voice);
        for (var i = chords.length - 1; i >= 0; i--) {
            try { removeElement(chords[i].el); } catch (e) { console.log("Contrappunto: rimozione non riuscita: " + e); }
        }
        return chords.length;
    }

    // Rilegge la voce scritta e la confronta con la variante: ritorna il numero di differenze
    function verifyTrack(items, staffIdx, voice) {
        var want = [], i;
        for (i = 0; i < items.length; i++) if (items[i].midi !== null) want.push(items[i]);
        var got = chordsIn(staffIdx, voice), diff = Math.abs(got.length - want.length);
        for (i = 0; i < Math.min(got.length, want.length); i++) {
            var notes = got[i].el.notes;
            if (got[i].tick !== want[i].tick || notes.length !== 1 || notes[0].pitch !== want[i].midi) diff++;
        }
        return diff;
    }

    // Scrive gli item in sequenza a partire da rangeStart; ritorna le note da legare
    function writeItems(items, staffIdx, voice) {
        clearTrack(staffIdx, voice);
        var c = curScore.newCursor();
        c.staffIdx = staffIdx;
        c.voice = 0;
        c.rewindToTick(items.length ? items[0].tick : rangeStart);
        c.voice = voice;          // posiziona con la voce 1, poi passa alla voce di destinazione
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var g = gcd(it.ticks, 1920);
            c.setDuration(it.ticks / g, 1920 / g);
            if (it.midi === null) c.addRest();
            else c.addNote(it.midi, false);
        }
        // seconda passata: ortografia (tpc) e raccolta delle note da legare
        var byTick = {};
        for (i = 0; i < items.length; i++) if (items[i].midi !== null) byTick[items[i].tick] = items[i];
        var ties = [];
        var r = curScore.newCursor();
        r.staffIdx = staffIdx;
        r.voice = voice;
        r.rewind(Cursor.SCORE_START);
        while (r.segment && r.tick < rangeEnd) {
            var el = r.element;
            if (el && el.type === Element.CHORD && r.tick >= rangeStart) {
                var item = byTick[r.tick];
                if (item && el.notes.length) {
                    var nt = el.notes[0];
                    try {
                        if (nt.pitch === item.midi && nt.tpc1 === nt.tpc2 && nt.tpc1 !== item.tpc) { nt.tpc1 = item.tpc; nt.tpc2 = item.tpc; }
                    } catch (e) {}
                    if (item.tieNext) ties.push(nt);
                }
            }
            r.next();
        }
        return ties;
    }

    function addTies(notes) {
        if (!notes.length || !tiesCheck.checked) return 0;
        try {
            curScore.selection.clear();
            for (var i = 0; i < notes.length; i++) curScore.selection.select(notes[i], true);
            cmd("tie");
            curScore.selection.clear();
            return notes.length;
        } catch (e) {
            console.log("Contrappunto: legature non create: " + e);
            return 0;
        }
    }

    function staffHasNotes(staffIdx, voice) {
        var c = curScore.newCursor();
        c.staffIdx = staffIdx; c.voice = voice;
        c.rewind(Cursor.SCORE_START);
        while (c.segment && c.tick < rangeEnd) {
            if (c.tick >= rangeStart && c.element && c.element.type === Element.CHORD) return true;
            c.next();
        }
        return false;
    }
    property color statusColor: cText
    function setStatus(msg, kind) {
        statusText.text = msg;
        statusColor = Qt.binding(function () {
            return kind === "error" ? plugin.cError : (kind === "good" ? plugin.cGood : plugin.cText);
        });
    }

    // ------------------------------------------------------------------ varianti: descrizioni
    function pct(a, b) { return (a + b) ? Math.round(100 * a / (a + b)) + "%" : "–"; }
    function candTitle(i) {
        var c = candidates[i];
        if (!c) return "";
        return (i + 1) + ".  Seme " + c.seed + "   ·   punteggio " + c.res.report.quality.toFixed(2) +
               (i === 0 && candidates.length > 1 ? "   ★ migliore" : "") +
               (c.staff !== undefined && separateStaves ? "   →  rigo " + (c.staff + 1) : "");
    }
    function candStats(i) {
        var c = candidates[i];
        if (!c) return "";
        var r = c.res.report;
        return "congiunti " + pct(r.steps, r.leaps) + "  ·  contrario " + pct(r.contrary, r.similar) +
               "  ·  " + (r.climaxCount === 1 ? "culmine" : ("culmini " + r.climaxCount)) +
               (r.climaxAt >= 0 ? " al " + r.climaxAt + "%" : "") + "  ·  " + (r.parallels ? (r.parallels + " parallele!") : "senza parallele");
    }
    function describe(c, staff, voice) {
        var r = c.res.report;
        var roleName = { above: "sopra la melodia", middle: "voce intermedia", below: "sotto la melodia (basso)" }[r.role];
        return "Seme " + c.seed + ": " + r.notes + " note nel rigo " + (staff + 1) + ", voce " + (voice + 1) + ".\n" +
               "Tonalità " + r.key + ", " + roleName + ". Gradi congiunti " + r.steps + ", salti " + r.leaps +
               ", moto contrario " + r.contrary + ", simile " + r.similar + ".\n" +
               (r.parallels ? ("Attenzione: " + r.details.join("; ")) : "Nessuna quinta o ottava parallela.") +
               (r.climaxCount === 1 ? " Un solo culmine." : "") +
               (r.swaps ? ("\nIn " + r.swaps + (r.swaps === 1 ? " battuta" : " battute") + " la voce passa " +
                           (r.altRole === "above" ? "sopra" : "sotto") + " la melodia per lasciarle spazio, invece di tacere.") : "") +
               rangeNote(c);
    }
    function rangeNote(c) {
        var r = c.res.report, ins = c.ins;
        if (!ins) return "";
        var roles = { above: "sopra la melodia", middle: "come voce intermedia", below: "sotto la melodia" };
        var txt = "\nEstensione " + ins.name + " (" + midiName(ins.lo) + "–" + midiName(ins.hi) + ") rispettata, registro " +
                  midiName(r.range[0]) + "–" + midiName(r.range[1]) + ".";
        if (r.roleBefore !== r.role) txt += " Per stare nell'estensione la voce va " + roles[r.role] + ".";
        if (r.rangeShift) txt += " Registro spostato di " + Math.abs(r.rangeShift) + (Math.abs(r.rangeShift) === 1 ? " ottava " : " ottave ") +
                                 (r.rangeShift > 0 ? "sopra." : "sotto.");
        return txt;
    }

    // ------------------------------------------------------------------ estensione dello strumento
    readonly property var pcNames: ["Do", "Do#", "Re", "Mib", "Mi", "Fa", "Fa#", "Sol", "Lab", "La", "Sib", "Si"]
    function midiName(m) { return pcNames[m % 12] + (Math.floor(m / 12) - 1); }

    // Estensione (suoni reali) dello strumento che suonerà il contrappunto, o null
    function targetRange(toNew, staffIdx) {
        if (toNew) {
            var ins = instruments[instrumentCombo.currentIndex];
            return { lo: ins.lo, hi: ins.hi, name: ins.label };
        }
        try {
            for (var p = 0; p < curScore.parts.length; p++) {
                var part = curScore.parts[p];
                if (staffIdx < Math.floor(part.startTrack / 4) || staffIdx >= Math.floor(part.endTrack / 4)) continue;
                // strumento noto: stessa estensione usata quando il rigo è stato creato (risultato ripetibile)
                var id = "";
                try { id = part.instrumentId || ""; } catch (e1) {}
                for (var k = 0; k < instruments.length; k++)
                    if (id && id === instruments[k].id)
                        return { lo: instruments[k].lo, hi: instruments[k].hi, name: instruments[k].label };
                var lo = part.minPitchA, hi = part.maxPitchA;              // estensione "amatoriale" (comoda)
                if (!(lo > 0 && hi > lo)) { lo = part.minPitchP; hi = part.maxPitchP; }
                if (lo > 0 && hi > lo) return { lo: lo, hi: hi, name: part.partName || part.longName || "strumento" };
            }
        } catch (e) { console.log("Contrappunto: estensione non letta: " + e); }
        return null;
    }

    // ------------------------------------------------------------------ azione principale
    // Il calcolo procede una variante alla volta (Timer) per non bloccare la finestra.
    function generate() {
        if (busy) return;
        var melStaff = melodyCombo.currentIndex;
        var bassStaff = bassCombo.currentIndex - 1;           // -1 = nessun basso
        var toNew = newStaffRadio.checked;
        var tStaff = targetStaffCombo.currentIndex;
        var tVoice = voiceCombo.currentIndex;

        if (!toNew && (tStaff === melStaff || tStaff === bassStaff) && tVoice === 0 && staffHasNotes(tStaff, 0)) {
            setStatus("La voce 1 del rigo scelto contiene la melodia o il basso: scegli la voce 2, 3 o 4, oppure un altro rigo.", "error");
            return;
        }

        var measures = allMeasures();
        var melody = readStaff(melStaff, (!toNew && tStaff === melStaff) ? tVoice : -1);
        var bass = bassStaff >= 0 ? readStaff(bassStaff, (!toNew && tStaff === bassStaff) ? tVoice : -1) : [];
        var keys = readKeys(melStaff, measures);
        var ms = [];
        for (var i = 0; i < measures.length; i++) {
            var m = measures[i];
            if (m.tick + m.len <= rangeStart || m.tick >= rangeEnd) continue;
            ms.push({ tick: m.tick, len: m.len, num: m.num, den: m.den, isFirst: m.isFirst });
        }
        var n = variantsSpin.value;
        job = {
            input: { melody: melody, bass: bass, measures: ms, keys: keys, start: rangeStart, end: rangeEnd },
            options: {
                species: speciesValues[speciesCombo.currentIndex],
                position: positionValues[positionCombo.currentIndex],
                register: registerValues[registerCombo.currentIndex],
                strictness: strictCombo.currentIndex === 0 ? "strict" : "free",
                mode: ["auto", "major", "minor"][modeCombo.currentIndex],
                meter: ["auto", "simple", "compound"][meterCombo.currentIndex],
                imitation: imitationCheck.checked,
                variety: varietySlider.value,
                sameStaff: melStaff === bassStaff,
                instrument: targetRange(toNew || (n > 1 && separateCheck.checked), tStaff)
            },
            n: n, i: 0, seed0: seedSpin.value, results: [],
            toNew: toNew, tStaff: tStaff, tVoice: tVoice,
            separate: n > 1 && separateCheck.checked
        };
        busy = true;
        setStatus(n > 1 ? ("Calcolo delle varianti: 0 di " + n + "…") : "Calcolo in corso…", "info");
        stepTimer.start();
    }

    Timer { id: stepTimer; interval: 20; repeat: false; onTriggered: plugin.step() }

    // usato dal collaudo
    function setVariants(n, separate) { variantsSpin.value = n; separateCheck.checked = separate; }
    function setVariantCount(n) { variantsSpin.value = n; return separateCheck.checked; }
    function setInstrument(id) {
        for (var k = 0; k < instruments.length; k++) if (instruments[k].id === id) instrumentCombo.currentIndex = k;
    }

    function seedFor(seed0, i) { return ((seed0 - 1 + i) % 99999) + 1; }

    function step() {
        var j = job;
        var inp = {}, k;
        for (k in j.input) inp[k] = j.input[k];
        inp.options = {};
        for (k in j.options) inp.options[k] = j.options[k];
        var seed = seedFor(j.seed0, j.i);
        inp.options.seed = seed;
        try {
            j.results.push({ seed: seed, res: Engine.generate(inp), ins: j.options.instrument });
        } catch (e) {
            busy = false;
            setStatus("Errore nel calcolo: " + e, "error");
            generationFinished();
            return;
        }
        j.i++;
        if (j.i < j.n) {
            setStatus("Calcolo delle varianti: " + j.i + " di " + j.n + "…", "info");
            stepTimer.start();
            return;
        }
        finishJob();
    }

    function appendStaff() {
        var before = curScore.nstaves;
        curScore.appendPart(instruments[instrumentCombo.currentIndex].id);
        if (curScore.nstaves === before) curScore.appendPart("piano");
        if (curScore.nstaves === before) throw "impossibile aggiungere un nuovo rigo";
        return before;
    }

    function labelStaff(staff, text) {
        try {
            var c = curScore.newCursor();
            c.staffIdx = staff; c.voice = 0;
            c.rewindToTick(rangeStart);
            var t = newElement(Element.STAFF_TEXT);
            t.text = text;
            c.add(t);
        } catch (e) { console.log("Contrappunto: etichetta non aggiunta: " + e); }
    }

    function finishJob() {
        var j = job;
        // varianti identiche (succede con Varietà bassa) contano una volta sola
        var seen = {}, list = [];
        for (var i = 0; i < j.results.length; i++) {
            var sig = j.results[i].res.report.signature;
            if (!seen[sig]) { seen[sig] = true; list.push(j.results[i]); }
        }
        // ordine: prima senza parallele, poi punteggio delle regole più alto
        list.sort(function (a, b) {
            return (a.res.report.parallels - b.res.report.parallels) ||
                   (b.res.report.quality - a.res.report.quality) || (a.seed - b.seed);
        });

        var ties = [], tStaff = j.tStaff, tVoice = j.tVoice;
        curScore.startCmd();
        try {
            if (j.separate) {
                for (i = 0; i < list.length; i++) {
                    var st = appendStaff();
                    ties = ties.concat(writeItems(list[i].res.items, st, 0));
                    labelStaff(st, "Variante " + (i + 1) + " – seme " + list[i].seed);
                    list[i].staff = st; list[i].voice = 0;
                }
            } else {
                if (j.toNew) { tStaff = appendStaff(); tVoice = 0; }
                ties = writeItems(list[0].res.items, tStaff, tVoice);
                list[0].staff = tStaff; list[0].voice = tVoice;
            }
            curScore.endCmd();
        } catch (e) {
            curScore.endCmd(true);
            busy = false;
            setStatus("Errore durante la scrittura: " + e, "error");
            generationFinished();
            return;
        }
        var nTies = addTies(ties);
        var mismatch = 0;
        for (i = 0; i < list.length; i++)
            if (list[i].staff !== undefined) mismatch += verifyTrack(list[i].res.items, list[i].staff, list[i].voice);

        separateStaves = j.separate;
        candidates = list;
        chosen = 0;
        target = j.separate ? null : { staff: tStaff, voice: tVoice };
        if (j.toNew || j.separate) {
            var keepMel = melodyCombo.currentIndex, keepBass = bassCombo.currentIndex;
            refreshStaves();                       // il cambio di modello azzera le tendine: le ripristino
            melodyCombo.currentIndex = keepMel;
            bassCombo.currentIndex = keepBass;
        }
        if (j.toNew && !j.separate) {
            targetStaffCombo.currentIndex = tStaff;
            voiceCombo.currentIndex = 0;
            existingRadio.checked = true;
        }

        var dup = j.n - list.length;
        var msg;
        if (j.separate) {
            msg = list.length + " varianti scritte in " + list.length + " righi nuovi (dal rigo " + (list[0].staff + 1) +
                  "), in ordine di qualità. Ascoltale e tieni quella che preferisci." + rangeNote(list[0]);
        } else {
            msg = describe(list[0], tStaff, tVoice);
            if (list.length > 1) msg = "Scritta la migliore di " + list.length + " varianti. Clicca un'altra variante nell'elenco per sostituirla.\n" + msg;
            else if (j.toNew) msg += "\nIl nuovo rigo è ora la destinazione: cambia il seme e premi di nuovo Genera per una variante.";
        }
        if (dup > 0) msg += "\n" + dup + (dup === 1 ? " variante era identica" : " varianti erano identiche") +
                            " a un'altra: alza la Varietà per risultati più diversi.";
        if (ties.length && !nTies && tiesCheck.checked) msg += "\nNon è stato possibile creare le legature di valore.";
        if (mismatch) msg = mismatchText(mismatch) + "\n" + msg;
        setStatus(msg, (mismatch || list[0].res.report.parallels > 0) ? "error" : "info");
        busy = false;
        generationFinished();
    }

    function mismatchText(n) {
        return "Attenzione: il rigo non corrisponde esattamente alla variante (" + n + (n === 1 ? " differenza" : " differenze") +
               "). Annulla con Ctrl+Z e segnala il problema.";
    }

    // Clic su una variante dell'elenco: la scrive al posto di quella attuale
    function chooseCandidate(i) {
        if (busy || i < 0 || i >= candidates.length) return;
        var c = candidates[i];
        if (separateStaves) {
            chosen = i;
            setStatus("Variante " + (i + 1) + " – " + describe(c, c.staff, c.voice), c.res.report.parallels ? "error" : "info");
            return;
        }
        if (i === chosen || !target) return;
        var ties = [];
        curScore.startCmd();
        try {
            ties = writeItems(c.res.items, target.staff, target.voice);
            curScore.endCmd();
        } catch (e) {
            curScore.endCmd(true);
            setStatus("Errore durante la scrittura: " + e, "error");
            return;
        }
        addTies(ties);
        var mismatch = verifyTrack(c.res.items, target.staff, target.voice);
        c.staff = target.staff; c.voice = target.voice;
        chosen = i;
        seedSpin.value = c.seed;
        setStatus((mismatch ? mismatchText(mismatch) + "\n" : "") +
                  "Variante " + (i + 1) + " scritta (il suo seme è ora nel campo Seme).\n" + describe(c, target.staff, target.voice),
                  (mismatch || c.res.report.parallels) ? "error" : "info");
    }

    // ------------------------------------------------------------------ interfaccia
    Pane {
        id: root
        anchors.fill: parent
        padding: 14
        palette.window: plugin.cBg
        palette.windowText: plugin.cText
        palette.base: plugin.cField
        palette.alternateBase: plugin.cPanel
        palette.text: plugin.cText
        palette.button: plugin.cButton
        palette.buttonText: plugin.cText
        palette.highlight: plugin.cAccent
        palette.highlightedText: plugin.dark ? "#ffffff" : "#ffffff"
        palette.mid: plugin.cBorder
        palette.dark: plugin.cBorder
        palette.light: plugin.mix(plugin.cButton, plugin.cBg, 0.5)
        palette.midlight: plugin.mix(plugin.cButton, plugin.cBg, 0.5)
        palette.shadow: plugin.dark ? "#000000" : "#808080"
        palette.placeholderText: plugin.cTextDim
        palette.toolTipBase: plugin.cPanel
        palette.toolTipText: plugin.cText
        background: Rectangle { color: plugin.cBg }

        ColumnLayout {
            anchors.fill: parent
            spacing: 10

            // ---- intestazione
            RowLayout {
                Layout.fillWidth: true
                spacing: 12
                Label { text: "Contrappunto automatico"; font.bold: true; font.pixelSize: 17; color: plugin.cText }
                Label { text: "v" + plugin.version; color: plugin.cTextDim }
                Label {
                    text: plugin.rangeLabel; color: plugin.cTextDim
                    elide: Text.ElideRight; Layout.fillWidth: true
                }
                Button {
                    text: "Usa la selezione corrente"
                    enabled: !plugin.busy
                    onClicked: { captureRange(); setStatus("Intervallo aggiornato. " + rangeLabel, "info"); }
                }
            }

            // ---- impostazioni su due colonne
            RowLayout {
                Layout.fillWidth: true
                spacing: 12
                enabled: !plugin.busy

                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 400
                    Layout.alignment: Qt.AlignTop
                    spacing: 8

                    GroupBox {
                        title: "Sorgenti"
                        Layout.fillWidth: true
                        GridLayout {
                            columns: 2; columnSpacing: 8; rowSpacing: 6
                            anchors.left: parent.left; anchors.right: parent.right
                            Label { text: "Melodia (canto dato):"; color: plugin.cText }
                            ComboBox { id: melodyCombo; model: plugin.staffNames; Layout.fillWidth: true }
                            Label { text: "Basso:"; color: plugin.cText }
                            ComboBox { id: bassCombo; model: ["— nessuno —"].concat(plugin.staffNames); Layout.fillWidth: true }
                        }
                    }

                    GroupBox {
                        title: "Destinazione"
                        Layout.fillWidth: true
                        GridLayout {
                            columns: 2; columnSpacing: 8; rowSpacing: 4
                            anchors.left: parent.left; anchors.right: parent.right
                            RadioButton {
                                id: newStaffRadio; text: "Nuovo rigo"; checked: true
                                ToolTip.visible: hovered; ToolTip.delay: 600
                                ToolTip.text: "Aggiunge un rigo in fondo alla partitura con lo strumento scelto"
                            }
                            ComboBox {
                                id: instrumentCombo
                                Layout.fillWidth: true
                                enabled: newStaffRadio.checked || (variantsSpin.value > 1 && separateCheck.checked)
                                opacity: enabled ? 1 : 0.45
                                model: plugin.instruments.map(function (x) { return x.label; })
                            }
                            RadioButton { id: existingRadio; text: "Rigo esistente" }
                            RowLayout {
                                Layout.fillWidth: true
                                enabled: existingRadio.checked
                                opacity: enabled ? 1 : 0.45
                                ComboBox { id: targetStaffCombo; model: plugin.staffNames; Layout.fillWidth: true }
                                ComboBox { id: voiceCombo; model: ["Voce 1", "Voce 2", "Voce 3", "Voce 4"]; currentIndex: 1; Layout.preferredWidth: 100 }
                            }
                        }
                    }

                    GroupBox {
                        title: "Varianti"
                        Layout.fillWidth: true
                        GridLayout {
                            columns: 3; columnSpacing: 8; rowSpacing: 4
                            anchors.left: parent.left; anchors.right: parent.right
                            Label { text: "Varietà:"; color: plugin.cText }
                            Slider {
                                id: varietySlider; from: 0; to: 10; stepSize: 1; value: 3; Layout.fillWidth: true
                                ToolTip.visible: hovered; ToolTip.delay: 600
                                ToolTip.text: "Quanto il risultato può scostarsi dalla soluzione più corretta (0 = sempre la stessa)"
                            }
                            Label { text: varietySlider.value.toFixed(0); color: plugin.cText; Layout.preferredWidth: 20 }

                            Label { text: "Seme:"; color: plugin.cText }
                            RowLayout {
                                Layout.columnSpan: 2
                                SpinBox { id: seedSpin; from: 1; to: 99999; value: 1; editable: true }
                                Button { text: "Nuovo seme"; onClicked: seedSpin.value = Math.floor(Math.random() * 99999) + 1 }
                            }

                            Label { text: "Quante:"; color: plugin.cText }
                            RowLayout {
                                Layout.columnSpan: 2
                                SpinBox {
                                    id: variantsSpin; from: 1; to: 8; value: 1
                                    // passando a più varianti si propone il confronto su righi separati
                                    property int lastValue: 1
                                    onValueChanged: {
                                        if (value > 1 && lastValue <= 1) separateCheck.checked = true;
                                        lastValue = value;
                                    }
                                    ToolTip.visible: hovered; ToolTip.delay: 600
                                    ToolTip.text: "Calcola più varianti (semi consecutivi) e le ordina per qualità"
                                }
                                Label {
                                    text: variantsSpin.value > 1 ? ("semi " + seedSpin.value + "–" + plugin.seedFor(seedSpin.value, variantsSpin.value - 1))
                                                                 : "una sola variante"
                                    color: plugin.cTextDim
                                }
                            }
                            CheckBox {
                                id: separateCheck
                                Layout.columnSpan: 3
                                text: "Una variante per rigo nuovo, per ascoltarle a confronto"
                                enabled: variantsSpin.value > 1
                                opacity: enabled ? 1 : 0.45
                            }
                        }
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 400
                    Layout.alignment: Qt.AlignTop
                    spacing: 8

                    GroupBox {
                        title: "Stile"
                        Layout.fillWidth: true
                        GridLayout {
                            columns: 2; columnSpacing: 8; rowSpacing: 6
                            anchors.left: parent.left; anchors.right: parent.right
                            Label { text: "Specie / ritmo:"; color: plugin.cText }
                            ComboBox { id: speciesCombo; model: plugin.speciesLabels; Layout.fillWidth: true }
                            Label { text: "Posizione:"; color: plugin.cText }
                            ComboBox { id: positionCombo; model: plugin.positionLabels; Layout.fillWidth: true }
                            Label { text: "Registro:"; color: plugin.cText }
                            ComboBox { id: registerCombo; model: plugin.registerLabels; Layout.fillWidth: true }
                            Label { text: "Regole:"; color: plugin.cText }
                            ComboBox {
                                id: strictCombo; Layout.fillWidth: true
                                model: ["Rigorose (accademiche)", "Libere (appoggiature, settime, dirette tollerate)"]
                            }
                            Label { text: "Modo:"; color: plugin.cText }
                            ComboBox { id: modeCombo; model: ["Automatico", "Maggiore", "Minore"]; Layout.fillWidth: true }
                            Label { text: "Metro:"; color: plugin.cText }
                            ComboBox { id: meterCombo; model: ["Automatico", "Semplice (2/4, 3/4, 4/4…)", "Composto (6/8, 9/8, 12/8…)"]; Layout.fillWidth: true }
                            CheckBox { id: imitationCheck; Layout.columnSpan: 2; text: "Imita il motivo della melodia nelle sue pause"; checked: true }
                            CheckBox { id: tiesCheck; Layout.columnSpan: 2; text: "Lega le note tenute (legature di valore)"; checked: true }
                        }
                    }
                }
            }

            // ---- risultati: elenco delle varianti e messaggi
            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.minimumHeight: 110
                spacing: 12

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredWidth: 400
                    color: plugin.cField; border.color: plugin.cBorder; radius: 4

                    ListView {
                        id: candList
                        anchors.fill: parent; anchors.margins: 4
                        clip: true
                        spacing: 2
                        model: plugin.candidates
                        ScrollBar.vertical: ScrollBar { }
                        delegate: Rectangle {
                            width: candList.width - 10
                            height: candCol.implicitHeight + 10
                            radius: 3
                            readonly property bool sel: index === plugin.chosen
                            color: sel ? Qt.rgba(plugin.cAccent.r, plugin.cAccent.g, plugin.cAccent.b, 0.25)
                                       : (candMouse.containsMouse ? Qt.rgba(plugin.cText.r, plugin.cText.g, plugin.cText.b, 0.07) : "transparent")
                            border.color: sel ? plugin.cAccent : "transparent"
                            Column {
                                id: candCol
                                x: 8; y: 5; width: parent.width - 16; spacing: 1
                                Label {
                                    width: parent.width; elide: Text.ElideRight
                                    text: plugin.candTitle(index); color: plugin.cText; font.bold: parent.parent.sel
                                }
                                Label {
                                    width: parent.width; elide: Text.ElideRight
                                    text: plugin.candStats(index); font.pixelSize: 11
                                    color: modelData.res.report.parallels ? plugin.cError : plugin.cTextDim
                                }
                            }
                            MouseArea {
                                id: candMouse
                                anchors.fill: parent; hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: plugin.chooseCandidate(index)
                            }
                        }
                    }
                    Label {
                        anchors.centerIn: parent
                        width: parent.width - 32
                        visible: plugin.candidates.length < 2
                        horizontalAlignment: Text.AlignHCenter
                        wrapMode: Text.WordWrap
                        color: plugin.cTextDim
                        text: plugin.candidates.length ? "" :
                              "Con «Quante» maggiore di 1 qui compare la classifica delle varianti: cliccane una per ascoltarla al posto della precedente."
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredWidth: 400
                    color: plugin.cField; border.color: plugin.cBorder; radius: 4
                    Flickable {
                        id: statusFlick
                        anchors.fill: parent; anchors.margins: 8
                        clip: true
                        contentHeight: statusText.implicitHeight
                        ScrollBar.vertical: ScrollBar { }
                        Text {
                            id: statusText
                            width: statusFlick.width
                            wrapMode: Text.WordWrap
                            color: plugin.statusColor
                        }
                    }
                }
            }

            // ---- pulsanti
            RowLayout {
                Layout.fillWidth: true
                BusyIndicator { running: plugin.busy; visible: plugin.busy; Layout.preferredHeight: 28; Layout.preferredWidth: 28 }
                Item { Layout.fillWidth: true }
                Button {
                    text: variantsSpin.value > 1 ? ("Genera " + variantsSpin.value + " varianti") : "Genera"
                    highlighted: true; enabled: !plugin.busy
                    onClicked: generate()
                }
                Button { text: "Chiudi"; enabled: !plugin.busy; onClicked: quit() }
            }
        }
    }
}
