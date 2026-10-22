//=============================================================================
//  Contrappunto – plugin per MuseScore 4
//  Scrive, confronta e corregge il contrappunto: genera una voce a partire da
//  melodia (canto dato) e basso, la scrive in un rigo/voce esistente oppure in
//  un nuovo rigo, e controlla una voce scritta a mano.
//  Il motore musicale è in contrappunto_engine.js, i testi in i18n/ (una lingua
//  per file: vedi TRANSLATING.md).
//=============================================================================
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import MuseScore 3.0
import "contrappunto_engine.js" as Engine
import "i18n/i18n.js" as I18n

MuseScore {
    id: plugin
    title: "Contrappunto"
    description: I18n.tr(I18n.resolve("auto", detectUiLanguage()), "plugin.description")
    version: "2.7.0"
    categoryCode: "composing-arranging-tools"
    pluginType: "dialog"
    requiresScore: true
    width: 880
    height: 690

    // ------------------------------------------------------------------ stato
    property var staffNames: []
    property int rangeStart: 0
    property int rangeEnd: 0
    property var rangeInfo: null         // { sel, a, b, n }: battute dell'intervallo (testo in rangeText())

    // varianti
    property bool busy: false
    property var job: null              // calcolo in corso (vedi generate())
    property var candidates: []         // [{ seed, res, staff, voice }] ordinate per qualità
    property int chosen: -1             // variante scritta nella destinazione
    property var target: null           // { staff, voice } dove si scrive la variante scelta
    property bool separateStaves: false // ultima generazione: una variante per rigo
    property var lockedNotes: []        // note mantenute nell'ultima rigenerazione parziale
    property var measureTicks: []       // inizio di ogni battuta (per i numeri di battuta nei messaggi)
    signal generationFinished()

    // colori dei rilievi dell'analisi (riconosciuti per toglierli a un'analisi successiva)
    readonly property string markError: "#d00000"
    readonly property string markWarning: "#e07000"

    // ------------------------------------------------------------------ lingua
    // "auto" = la lingua dell'interfaccia di MuseScore (se non c'è un file per
    // quella lingua: inglese). Tutti i testi passano da tr(), che legge plugin.lang:
    // cambiando lingua le scritte e il riquadro dei messaggi si aggiornano da soli.
    property string langPref: "auto"
    readonly property string uiLang: detectUiLanguage()
    readonly property string lang: I18n.resolve(langPref, uiLang)
    readonly property var langValues: ["auto"].concat(I18n.languages().map(function (l) { return l.code; }))
    readonly property var langLabels: [tr("lang.auto", { name: langName(I18n.resolve("auto", uiLang)) })]
                                      .concat(I18n.languages().map(function (l) { return l.name; }))
    function detectUiLanguage() {
        var c = "";
        try { if (Qt.uiLanguage) c = Qt.uiLanguage; } catch (e) {}
        if (!c) try { c = Qt.locale().name; } catch (e2) {}
        return c || "en";
    }
    function langName(code) {
        var ls = I18n.languages();
        for (var i = 0; i < ls.length; i++) if (ls[i].code === code) return ls[i].name;
        return code;
    }
    function tr(key, args) { return I18n.tr(plugin.lang, key, args); }
    function note(midi) { return I18n.midiName(plugin.lang, midi); }
    function plural(key, n) { return tr(key, { n: n }); }

    readonly property var speciesValues: ["free", "1:1", "2:1", "4:1", "sus", "florid"]
    readonly property var speciesLabels: speciesValues.map(function (v) { return tr("species." + v); })
    readonly property var positionValues: ["auto", "above", "middle", "below"]
    readonly property var positionLabels: positionValues.map(function (v) { return tr("position." + v); })
    readonly property var registerValues: ["auto", "soprano", "alto", "tenor", "bass"]
    readonly property var registerRanges: ({ soprano: [60, 81], alto: [53, 74], tenor: [48, 69], bass: [40, 62] })
    readonly property var registerLabels: registerValues.map(function (v) {
        var r = registerRanges[v];
        return r ? tr("register." + v, { lo: note(r[0]), hi: note(r[1]) }) : tr("register." + v);
    })
    // estensioni comode (suoni reali, MIDI): il contrappunto resta sempre dentro
    readonly property var instruments: [
        { id: "violin", lo: 55, hi: 88 },        // Sol3–Mi6
        { id: "flute", lo: 60, hi: 93 },         // Do4–La6
        { id: "oboe", lo: 58, hi: 86 },          // Sib3–Re6
        { id: "viola", lo: 48, hi: 81 },         // Do3–La5
        { id: "violoncello", lo: 36, hi: 72 },   // Do2–Do5
        { id: "bassoon", lo: 34, hi: 70 },       // Sib1–Sib4
        { id: "soprano", lo: 60, hi: 81 },
        { id: "alto", lo: 53, hi: 74 },
        { id: "tenor", lo: 48, hi: 69 },
        { id: "bass", lo: 40, hi: 62 },
        { id: "piano", lo: 21, hi: 108 }
    ]
    readonly property var instrumentLabels: instruments.map(function (x) { return tr("instrument." + x.id); })
    readonly property var voiceLabels: [1, 2, 3, 4].map(function (n) { return tr("voice.n", { n: n }); })

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

    // ------------------------------------------------------------------ impostazioni salvate
    // Settings viene creato a runtime: se il modulo manca (versioni diverse di Qt in
    // MuseScore 4.x) il plugin funziona lo stesso, senza ricordare le scelte.
    property bool persistSettings: true
    property string settingsCategory: "Contrappunto"
    property var store: null
    function openStore() {
        if (store !== null) return store;
        var srcs = ['import QtQuick 2.15; import Qt.labs.settings 1.0; Settings { category: "' + settingsCategory + '" }',
                    'import QtQuick; import QtCore; Settings { category: "' + settingsCategory + '" }'];
        store = false;
        for (var i = 0; i < srcs.length && !store; i++) {
            try { store = Qt.createQmlObject(srcs[i], plugin, "contrappuntoSettings"); } catch (e) { store = false; }
        }
        return store;
    }
    function currentSettings() {
        return { lang: langPref, species: speciesCombo.currentIndex, position: positionCombo.currentIndex, register: registerCombo.currentIndex,
                 strict: strictCombo.currentIndex, mode: modeCombo.currentIndex, meter: meterCombo.currentIndex,
                 imitation: imitationCheck.checked, entry: entryCheck.checked, ties: tiesCheck.checked,
                 variety: varietySlider.value, variants: variantsSpin.value, separate: separateCheck.checked,
                 instrument: instrumentCombo.currentIndex, toNew: newStaffRadio.checked, voice: voiceCombo.currentIndex };
    }
    function saveSettings() {
        if (!persistSettings) return false;
        var st = openStore();
        if (!st) return false;
        try { st.setValue("options", JSON.stringify(currentSettings())); return true; } catch (e) { return false; }
    }
    function readSettings() {
        if (!persistSettings) return null;
        var st = openStore();
        if (!st) return null;
        var o = null;
        try { var raw = st.value("options", ""); if (raw) o = JSON.parse(raw); } catch (e) { o = null; }
        return o;
    }
    function loadSettings() { var o = readSettings(); if (o && typeof o.lang === "string") langPref = o.lang; return applySettings(o); }
    function applySettings(o) {
        if (!o) return false;
        function idx(combo, v) { if (typeof v === "number" && v >= 0 && v < combo.count) combo.currentIndex = v; }
        idx(speciesCombo, o.species); idx(positionCombo, o.position); idx(registerCombo, o.register);
        idx(strictCombo, o.strict); idx(modeCombo, o.mode); idx(meterCombo, o.meter);
        idx(instrumentCombo, o.instrument); idx(voiceCombo, o.voice);
        if (typeof o.imitation === "boolean") imitationCheck.checked = o.imitation;
        if (typeof o.entry === "boolean") entryCheck.checked = o.entry;
        if (typeof o.ties === "boolean") tiesCheck.checked = o.ties;
        if (typeof o.variety === "number") varietySlider.value = o.variety;
        if (typeof o.variants === "number") variantsSpin.value = Math.max(1, Math.min(8, o.variants));
        if (typeof o.separate === "boolean") separateCheck.checked = o.separate;
        if (o.toNew === false) existingRadio.checked = true;
        return true;
    }

    onRun: {
        if (!curScore) { quit(); return; }
        applyTheme();
        var saved = readSettings();
        if (saved && typeof saved.lang === "string" && plugin.langValues.indexOf(saved.lang) >= 0) langPref = saved.lang;
        languageCombo.currentIndex = Math.max(0, plugin.langValues.indexOf(langPref));
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
        lockedNotes = [];
        var restored = applySettings(saved);
        setStatus(function () { return tr("status.ready") + (restored ? tr("status.restored") : ""); }, "info");
    }

    // Cambio di lingua: i modelli delle tendine cambiano e Qt azzera la scelta, quindi la ripristino.
    function setLanguage(code) {
        if (plugin.langValues.indexOf(code) < 0) code = "auto";
        var keep = currentSettings();
        var mel = melodyCombo.currentIndex, bas = bassCombo.currentIndex, tst = targetStaffCombo.currentIndex;
        langPref = code;
        refreshStaves();
        applySettings(keep);
        melodyCombo.currentIndex = mel; bassCombo.currentIndex = bas; targetStaffCombo.currentIndex = tst;
        if (!keep.toNew) existingRadio.checked = true; else newStaffRadio.checked = true;
        languageCombo.currentIndex = Math.max(0, plugin.langValues.indexOf(langPref));
        saveSettings();          // il messaggio in corso resta e si ritraduce da solo
    }

    // ------------------------------------------------------------------ utilità score
    function refreshStaves() {
        var names = [];
        for (var s = 0; s < curScore.nstaves; s++) names.push(tr("staff.default", { n: s + 1 }));
        for (var p = 0; p < curScore.parts.length; p++) {
            var part = curScore.parts[p];
            var s0 = Math.floor(part.startTrack / 4), s1 = Math.floor(part.endTrack / 4);
            var nm = part.partName || part.longName || tr("staff.part", { n: p + 1 });
            for (var st = s0; st < s1 && st < names.length; st++)
                names[st] = (s1 - s0 > 1) ? tr("staff.labelMulti", { n: st + 1, name: nm, k: st - s0 + 1 })
                                          : tr("staff.label", { n: st + 1, name: nm });
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
        measureTicks = ms.map(function (x) { return x.tick; });
        rangeInfo = { sel: !!(sel && sel.isRange), a: a + 1, b: b + 1, n: ms.length };
    }
    function rangeText() {
        var r = rangeInfo;
        if (!r) return "";
        return r.sel ? tr("range.selection", { a: r.a, b: r.b }) : tr("range.all", { n: r.n });
    }

    // "batt. 12" / "bar 12" per un tick dello spartito
    function barText(tick) {
        var ms = measureTicks, i = 0;
        while (i + 1 < ms.length && ms[i + 1] <= tick) i++;
        return tr("bar", { n: i + 1 });
    }

    function elTicks(el) {
        try { if (el.actualDuration && el.actualDuration.ticks > 0) return el.actualDuration.ticks; } catch (e) {}
        try { if (el.duration && el.duration.ticks > 0) return el.duration.ticks; } catch (e) {}
        return 480;
    }

    // Legge tutte le voci di un rigo (tranne excludeVoice), oppure solo onlyVoice, come eventi {tick, dur, notes}
    function readStaff(staffIdx, excludeVoice, onlyVoice) {
        var out = [];
        for (var v = 0; v < 4; v++) {
            if (v === excludeVoice) continue;
            if (onlyVoice !== undefined && onlyVoice >= 0 && v !== onlyVoice) continue;
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
            try { removeElement(chords[i].el); } catch (e) { console.log("Contrappunto: could not remove an element: " + e); }
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
            console.log("Contrappunto: ties not created: " + e);
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
    // Il messaggio è una funzione che produce il testo: se cambia la lingua viene
    // ricalcolato (il binding del Text legge plugin.lang attraverso tr()).
    property var statusBuilder: null
    property string statusKind: "info"
    readonly property color statusColor: statusKind === "error" ? cError : (statusKind === "good" ? cGood : cText)
    function setStatus(builder, kind) {
        statusBuilder = typeof builder === "function" ? builder : function () { return String(builder); };
        statusKind = kind || "info";
    }
    function statusString() { return statusBuilder ? statusBuilder() : ""; }

    // ------------------------------------------------------------------ varianti: descrizioni
    function pct(a, b) { return (a + b) ? Math.round(100 * a / (a + b)) + "%" : "–"; }
    function candTitle(i) {
        var c = candidates[i];
        if (!c) return "";
        return tr("cand.title", { rank: i + 1, seed: c.seed, score: c.res.report.quality.toFixed(2),
                                  errors: c.res.report.errors || 0, warnings: c.res.report.warnings || 0 }) +
               (i === 0 && candidates.length > 1 ? tr("cand.best") : "") +
               (c.staff !== undefined && separateStaves ? tr("cand.staff", { n: c.staff + 1 }) : "");
    }
    function candStats(i) {
        var c = candidates[i];
        if (!c) return "";
        var r = c.res.report;
        var cl = plural("climax.count", r.climaxCount);
        if (r.climaxAt >= 0) cl = tr("climax.at", { climax: cl, p: r.climaxAt });
        return tr("cand.stats", { steps: pct(r.steps, r.leaps), contrary: pct(r.contrary, r.similar), climax: cl,
                                  parallels: r.parallels ? plural("parallels.some", r.parallels) : tr("parallels.none") });
    }
    function checkText(r) {
        return tr("count.both", { errors: plural("count.errors", r.errors || 0), warnings: plural("count.warnings", r.warnings || 0) });
    }
    function parallelsText(r) {
        return r.details.map(function (d) {
            return tr("parallel.item", { kind: tr(d.interval === 5 ? "parallel.fifths" : "parallel.octaves"),
                                         voice: tr("voice." + d.voice), bar: barText(d.tick) });
        }).join("; ");
    }
    function extrasText(r, entryAsked) {
        var txt = "\n" + (r.checkError ? tr("extras.checkFailed", { msg: r.checkError }) : tr("extras.check", { counts: checkText(r) }));
        var f = r.figures;
        if (f) {
            var parts = [];
            if (f.suspension) parts.push(plural("fig.suspension", f.suspension));
            if (f.cambiata) parts.push(plural("fig.cambiata", f.cambiata));
            if (f.double) parts.push(plural("fig.double", f.double));
            if (parts.length) txt += tr("extras.figures", { list: parts.join(", ") });
        }
        if (r.entry) txt += "\n" + tr("extras.entry", { bar: barText(r.entry.tick), interval: tr("interval." + r.entry.at),
                                                      matched: r.entry.matched, total: r.entry.intervals });
        else if (entryAsked) txt += "\n" + tr("extras.entryNone");
        if (r.locked) txt += "\n" + plural("extras.locked", r.locked);
        return txt;
    }
    function describe(c, staff, voice) {
        var r = c.res.report;
        return tr("desc.head", { seed: c.seed, notes: r.notes, staff: staff + 1, voice: voice + 1 }) + "\n" +
               tr("desc.body", { key: I18n.keyName(plugin.lang, r.key), role: tr("role." + r.role), steps: r.steps, leaps: r.leaps,
                                 contrary: r.contrary, similar: r.similar }) + "\n" +
               (r.parallels ? tr("desc.parallels", { list: parallelsText(r) }) : tr("desc.noParallels")) +
               (r.climaxCount === 1 ? tr("desc.oneClimax") : "") +
               (r.swaps ? "\n" + tr("desc.swaps", { n: r.swaps, side: tr(r.altRole === "above" ? "side.above" : "side.below") }) : "") +
               extrasText(r, !!c.entryAsked) + rangeNote(c);
    }
    function insName(ins) { return ins.id ? tr("instrument." + ins.id) : (ins.label || tr("instrument.unknown")); }
    function rangeNote(c) {
        var r = c.res.report, ins = c.ins;
        if (!ins) return "";
        var txt = "\n" + tr("range.instrument", { name: insName(ins), lo: note(ins.lo), hi: note(ins.hi),
                                                  rlo: note(r.range[0]), rhi: note(r.range[1]) });
        if (r.roleBefore !== r.role) txt += tr("range.roleChange", { role: tr("roleGoes." + r.role) });
        if (r.rangeShift) txt += tr("range.shift", { n: Math.abs(r.rangeShift), dir: tr(r.rangeShift > 0 ? "dir.up" : "dir.down") });
        return txt;
    }

    // ------------------------------------------------------------------ estensione dello strumento
    // Estensione (suoni reali) dello strumento che suonerà il contrappunto, o null
    function targetRange(toNew, staffIdx) {
        if (toNew) {
            var ins = instruments[instrumentCombo.currentIndex];
            return { lo: ins.lo, hi: ins.hi, id: ins.id };
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
                        return { lo: instruments[k].lo, hi: instruments[k].hi, id: instruments[k].id };
                var lo = part.minPitchA, hi = part.maxPitchA;              // estensione "amatoriale" (comoda)
                if (!(lo > 0 && hi > lo)) { lo = part.minPitchP; hi = part.maxPitchP; }
                if (lo > 0 && hi > lo) return { lo: lo, hi: hi, label: part.partName || part.longName || "" };
            }
        } catch (e) { console.log("Contrappunto: instrument range not read: " + e); }
        return null;
    }

    // ------------------------------------------------------------------ azione principale
    // Il calcolo procede una variante alla volta (Timer) per non bloccare la finestra.
    // extra (facoltativo): { target: { staff, voice }, locked: [...] } per rigenerare intorno alle note mantenute
    function generate(extra) {
        if (busy) return;
        extra = extra || {};
        var melStaff = melodyCombo.currentIndex;
        var bassStaff = bassCombo.currentIndex - 1;           // -1 = nessun basso
        var toNew = extra.target ? false : newStaffRadio.checked;
        var tStaff = extra.target ? extra.target.staff : targetStaffCombo.currentIndex;
        var tVoice = extra.target ? extra.target.voice : voiceCombo.currentIndex;
        saveSettings();

        if (!toNew && (tStaff === melStaff || tStaff === bassStaff) && tVoice === 0 && staffHasNotes(tStaff, 0)) {
            setStatus(function () { return tr("error.voice1"); }, "error");
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
        var separate = n > 1 && separateCheck.checked && !extra.locked;
        lockedNotes = extra.locked || [];
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
                entry: entryCheck.checked && entryCheck.enabled,
                locked: extra.locked || null,
                variety: varietySlider.value,
                sameStaff: melStaff === bassStaff,
                instrument: targetRange(toNew || separate, tStaff)
            },
            n: n, i: 0, seed0: seedSpin.value, results: [],
            toNew: toNew, tStaff: tStaff, tVoice: tVoice,
            separate: separate
        };
        busy = true;
        setStatus(function () { return n > 1 ? tr("status.computingN", { i: 0, n: n }) : tr("status.computing"); }, "info");
        stepTimer.start();
    }

    Timer { id: stepTimer; interval: 20; repeat: false; onTriggered: plugin.step() }

    // usato dal collaudo
    function setVariants(n, separate) { variantsSpin.value = n; separateCheck.checked = separate; }
    function setVariantCount(n) { variantsSpin.value = n; return separateCheck.checked; }
    function setDestination(staff, voice) { existingRadio.checked = true; targetStaffCombo.currentIndex = staff; voiceCombo.currentIndex = voice; }
    function setSpecies(i) { speciesCombo.currentIndex = i; }
    function setSeed(n) { seedSpin.value = n; }

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
            j.results.push({ seed: seed, res: Engine.generate(inp), ins: j.options.instrument, entryAsked: j.options.entry });
        } catch (e) {
            busy = false;
            setStatus(function () { return tr("error.compute", { msg: I18n.errorText(plugin.lang, e) }); }, "error");
            generationFinished();
            return;
        }
        j.i++;
        if (j.i < j.n) {
            var done = j.i, tot = j.n;
            setStatus(function () { return tr("status.computingN", { i: done, n: tot }); }, "info");
            stepTimer.start();
            return;
        }
        finishJob();
    }

    function appendStaff() {
        var before = curScore.nstaves;
        curScore.appendPart(instruments[instrumentCombo.currentIndex].id);
        if (curScore.nstaves === before) curScore.appendPart("piano");
        if (curScore.nstaves === before) throw tr("error.appendStaff");
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
        } catch (e) { console.log("Contrappunto: label not added: " + e); }
    }

    function finishJob() {
        var j = job;
        // varianti identiche (succede con Varietà bassa) contano una volta sola
        var seen = {}, list = [];
        for (var i = 0; i < j.results.length; i++) {
            var sig = j.results[i].res.report.signature;
            if (!seen[sig]) { seen[sig] = true; list.push(j.results[i]); }
        }
        // ordine: prima senza parallele, poi meno errori dell'analisi, poi punteggio delle regole più alto
        list.sort(function (a, b) {
            return (a.res.report.parallels - b.res.report.parallels) ||
                   ((a.res.report.errors || 0) - (b.res.report.errors || 0)) ||
                   (b.res.report.quality - a.res.report.quality) || (a.seed - b.seed);
        });

        var ties = [], tStaff = j.tStaff, tVoice = j.tVoice;
        curScore.startCmd();
        try {
            if (j.separate) {
                for (i = 0; i < list.length; i++) {
                    var st = appendStaff();
                    ties = ties.concat(writeItems(list[i].res.items, st, 0));
                    labelStaff(st, tr("label.variant", { n: i + 1, seed: list[i].seed }));
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
            setStatus(function () { return tr("error.write", { msg: I18n.errorText(plugin.lang, e) }); }, "error");
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

        var dup = j.n - list.length, sep = j.separate, toNew = j.toNew;
        var noTies = ties.length && !nTies && tiesCheck.checked;
        setStatus(function () {
            var msg;
            if (sep) {
                msg = tr("finish.separate", { n: list.length, staff: list[0].staff + 1 }) + rangeNote(list[0]);
            } else {
                msg = describe(list[0], tStaff, tVoice);
                if (list.length > 1) msg = tr("finish.best", { n: list.length }) + "\n" + msg;
                else if (toNew) msg += "\n" + tr("finish.newTarget");
            }
            if (dup > 0) msg += "\n" + plural("finish.dup", dup);
            if (noTies) msg += "\n" + tr("finish.noTies");
            if (mismatch) msg = plural("mismatch", mismatch) + "\n" + msg;
            return msg;
        }, (mismatch || list[0].res.report.parallels > 0) ? "error" : "info");
        busy = false;
        generationFinished();
    }

    // Clic su una variante dell'elenco: la scrive al posto di quella attuale
    function chooseCandidate(i) {
        if (busy || i < 0 || i >= candidates.length) return;
        var c = candidates[i];
        if (separateStaves) {
            chosen = i;
            setStatus(function () { return tr("choose.separate", { n: i + 1, desc: describe(c, c.staff, c.voice) }); },
                      c.res.report.parallels ? "error" : "info");
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
            setStatus(function () { return tr("error.write", { msg: I18n.errorText(plugin.lang, e) }); }, "error");
            return;
        }
        addTies(ties);
        var mismatch = verifyTrack(c.res.items, target.staff, target.voice);
        c.staff = target.staff; c.voice = target.voice;
        chosen = i;
        seedSpin.value = c.seed;
        var tg = { staff: target.staff, voice: target.voice };
        setStatus(function () {
            return (mismatch ? plural("mismatch", mismatch) + "\n" : "") +
                   tr("choose.written", { n: i + 1 }) + "\n" + describe(c, tg.staff, tg.voice);
        }, (mismatch || c.res.report.parallels) ? "error" : "info");
    }

    // ------------------------------------------------------------------ analisi di una voce
    // La voce analizzata è la destinazione: rigo esistente + voce (dopo una generazione
    // in un nuovo rigo è quel rigo). Gli errori diventano rossi, gli avvisi arancioni.
    function voiceTarget() {
        if (existingRadio.checked) return { staff: targetStaffCombo.currentIndex, voice: voiceCombo.currentIndex };
        return target;
    }
    function isMark(nt) {
        var c = "";
        try { c = String(nt.color).toLowerCase(); } catch (e) { return false; }
        return c.indexOf(markError) === 0 || c.indexOf(markWarning) === 0;
    }
    function clearMarks(staffIdx, voice) {
        var chords = chordsIn(staffIdx, voice), n = 0;
        for (var i = 0; i < chords.length; i++)
            for (var k = 0; k < chords[i].el.notes.length; k++) {
                var nt = chords[i].el.notes[k];
                if (isMark(nt)) { nt.color = "#000000"; n++; }
            }
        return n;
    }

    function analyzeVoice() {
        if (busy) return;
        var tg = voiceTarget();
        if (!tg) { setStatus(function () { return tr("analysis.needTarget"); }, "error"); return; }
        var melStaff = melodyCombo.currentIndex, bassStaff = bassCombo.currentIndex - 1;
        if ((tg.staff === melStaff || tg.staff === bassStaff) && tg.voice === 0) {
            setStatus(function () { return tr("analysis.voice1"); }, "error");
            return;
        }
        saveSettings();
        var line = readStaff(tg.staff, -1, tg.voice);
        if (!line.length) { setStatus(function () { return tr("analysis.empty", { voice: tg.voice + 1, staff: tg.staff + 1 }); }, "error"); return; }
        var measures = allMeasures(), ms = [];
        for (var i = 0; i < measures.length; i++) {
            var m = measures[i];
            if (m.tick + m.len <= rangeStart || m.tick >= rangeEnd) continue;
            ms.push({ tick: m.tick, len: m.len, num: m.num, den: m.den, isFirst: m.isFirst });
        }
        var res;
        try {
            res = Engine.analyze({
                melody: readStaff(melStaff, tg.staff === melStaff ? tg.voice : -1),
                bass: bassStaff >= 0 ? readStaff(bassStaff, tg.staff === bassStaff ? tg.voice : -1) : [],
                measures: ms, keys: readKeys(melStaff, measures), start: rangeStart, end: rangeEnd, line: line,
                options: { strictness: strictCombo.currentIndex === 0 ? "strict" : "free",
                           mode: ["auto", "major", "minor"][modeCombo.currentIndex],
                           meter: ["auto", "simple", "compound"][meterCombo.currentIndex],
                           sameStaff: melStaff === bassStaff }
            });
        } catch (e) { setStatus(function () { return tr("error.analysis", { msg: I18n.errorText(plugin.lang, e) }); }, "error"); return; }
        // colori: la nota (o la nota tenuta) che contiene il tick del rilievo
        var chords = chordsIn(tg.staff, tg.voice), marked = 0;
        curScore.startCmd();
        try {
            clearMarks(tg.staff, tg.voice);
            for (i = 0; i < res.findings.length; i++) {
                var f = res.findings[i], hit = null;
                for (var k = 0; k < chords.length && chords[k].tick <= f.tick; k++) hit = chords[k];
                if (!hit) continue;
                for (var q = 0; q < hit.el.notes.length; q++) {
                    var nt = hit.el.notes[q];
                    if (f.level === "error" || String(nt.color).toLowerCase().indexOf(markError) !== 0) nt.color = f.level === "error" ? markError : markWarning;
                }
                marked++;
            }
            curScore.endCmd();
        } catch (e2) { curScore.endCmd(true); setStatus(function () { return tr("error.colour", { msg: String(e2) }); }, "error"); return; }
        var r = res.report;
        setStatus(function () {
            var lines = [];
            for (var q = 0; q < res.findings.length && q < 40; q++)
                lines.push((res.findings[q].level === "error" ? "✖ " : "▲ ") + barText(res.findings[q].tick) + ": " + I18n.finding(plugin.lang, res.findings[q]));
            if (res.findings.length > 40) lines.push(tr("analysis.more", { n: res.findings.length - 40 }));
            var head = tr("analysis.head", { voice: tg.voice + 1, staff: tg.staff + 1, notes: r.notes, role: tr("analysis.role." + r.role),
                                             key: I18n.keyName(plugin.lang, r.key), counts: checkText(r) }) +
                       tr(res.findings.length ? "analysis.colours" : "analysis.none");
            return head + (lines.length ? "\n" + lines.join("\n") : "");
        }, r.errors ? "error" : (r.warnings ? "info" : "good"));
        lastAnalysis = res;
    }
    property var lastAnalysis: null

    // ------------------------------------------------------------------ rigenerazione intorno alle note scelte
    // Note da mantenere: quelle selezionate nella voce di destinazione; se non ce ne sono,
    // quelle cambiate a mano rispetto alla variante scritta dal plugin (più quelle già
    // mantenute la volta precedente, se sono ancora lì).
    function noteSelected(nt, list) {
        try { if (nt.selected === true) return true; } catch (e) {}
        for (var i = 0; i < list.length; i++) if (list[i] === nt) return true;
        return false;
    }
    function lockedFrom(tg) {
        var chords = chordsIn(tg.staff, tg.voice), sel = [], i;
        try {
            var els = curScore.selection.elements;
            for (i = 0; els && i < els.length; i++) if (els[i].type === Element.NOTE) sel.push(els[i]);
        } catch (e) {}
        var picked = [], how = "";
        if (sel.length) {
            for (i = 0; i < chords.length; i++) {
                for (var k = 0; k < chords[i].el.notes.length; k++)
                    if (noteSelected(chords[i].el.notes[k], sel)) { picked.push(chords[i]); break; }
            }
            if (picked.length) how = "selected";
        }
        if (!picked.length) {
            var c = chosen >= 0 ? candidates[chosen] : null, want = {};
            if (c && c.staff === tg.staff && c.voice === tg.voice) {
                for (i = 0; i < c.res.items.length; i++) if (c.res.items[i].midi !== null) want[c.res.items[i].tick] = c.res.items[i];
                var kept = {};
                for (i = 0; i < lockedNotes.length; i++) kept[lockedNotes[i].tick + ":" + lockedNotes[i].midi] = true;
                for (i = 0; i < chords.length; i++) {
                    var nt0 = chords[i].el.notes[chords[i].el.notes.length - 1], w = want[chords[i].tick];
                    var same = w && w.midi === nt0.pitch && w.ticks === elTicks(chords[i].el);
                    if (!same || kept[chords[i].tick + ":" + nt0.pitch]) picked.push(chords[i]);
                }
                if (picked.length) how = "edited by hand";
            }
        }
        // in eventi { tick, dur, midi, tpc }: nota più acuta dell'accordo, legature unite
        var out = [];
        for (i = 0; i < picked.length; i++) {
            var el = picked[i].el, nt = el.notes[el.notes.length - 1];
            for (var q = 0; q < el.notes.length; q++) if (el.notes[q].pitch > nt.pitch) nt = el.notes[q];
            var d = elTicks(el), last = out[out.length - 1];
            if (last && nt.tieBack && last.midi === nt.pitch && last.tick + last.dur === picked[i].tick) { last.dur += d; continue; }
            out.push({ tick: picked[i].tick, dur: d, midi: nt.pitch, tpc: (nt.tpc1 !== undefined ? nt.tpc1 : nt.tpc) });
        }
        return { notes: out, how: how };
    }

    function regenerateRest() {
        if (busy) return;
        var tg = voiceTarget();
        if (!tg) { setStatus(function () { return tr("regen.needTarget"); }, "error"); return; }
        var lk = lockedFrom(tg);
        if (!lk.notes.length) {
            setStatus(function () { return tr("regen.nothing", { voice: tg.voice + 1, staff: tg.staff + 1 }); }, "error");
            return;
        }
        console.log("Contrappunto: " + lk.notes.length + " notes kept (" + lk.how + ")");
        generate({ target: tg, locked: lk.notes });
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
        palette.highlightedText: "#ffffff"
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
                ColumnLayout {
                    spacing: 0
                    RowLayout {
                        spacing: 8
                        Label { text: plugin.title; font.bold: true; font.pixelSize: 17; color: plugin.cText }
                        Label { text: "v" + plugin.version; color: plugin.cTextDim }
                    }
                    Label { text: plugin.tr("app.tagline"); color: plugin.cTextDim; font.pixelSize: 12 }
                }
                Label {
                    text: plugin.rangeText(); color: plugin.cTextDim
                    elide: Text.ElideRight; Layout.fillWidth: true
                    horizontalAlignment: Text.AlignRight
                }
                Button {
                    text: plugin.tr("range.use")
                    enabled: !plugin.busy
                    onClicked: { captureRange(); setStatus(function () { return tr("range.updated", { range: rangeText() }); }, "info"); }
                }
                Label { text: plugin.tr("lang.label"); color: plugin.cText }
                ComboBox {
                    id: languageCombo
                    model: plugin.langLabels
                    enabled: !plugin.busy
                    Layout.preferredWidth: 170
                    onActivated: plugin.setLanguage(plugin.langValues[index])
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
                        title: plugin.tr("group.sources")
                        Layout.fillWidth: true
                        GridLayout {
                            columns: 2; columnSpacing: 8; rowSpacing: 6
                            anchors.left: parent.left; anchors.right: parent.right
                            Label { text: plugin.tr("label.melody"); color: plugin.cText }
                            ComboBox { id: melodyCombo; model: plugin.staffNames; Layout.fillWidth: true }
                            Label { text: plugin.tr("label.bass"); color: plugin.cText }
                            ComboBox { id: bassCombo; model: [plugin.tr("bass.none")].concat(plugin.staffNames); Layout.fillWidth: true }
                        }
                    }

                    GroupBox {
                        title: plugin.tr("group.destination")
                        Layout.fillWidth: true
                        GridLayout {
                            columns: 2; columnSpacing: 8; rowSpacing: 4
                            anchors.left: parent.left; anchors.right: parent.right
                            RadioButton {
                                id: newStaffRadio; text: plugin.tr("dest.new"); checked: true
                                ToolTip.visible: hovered; ToolTip.delay: 600
                                ToolTip.text: plugin.tr("dest.newTip")
                            }
                            ComboBox {
                                id: instrumentCombo
                                Layout.fillWidth: true
                                enabled: newStaffRadio.checked || (variantsSpin.value > 1 && separateCheck.checked)
                                opacity: enabled ? 1 : 0.45
                                model: plugin.instrumentLabels
                            }
                            RadioButton { id: existingRadio; text: plugin.tr("dest.existing") }
                            RowLayout {
                                Layout.fillWidth: true
                                enabled: existingRadio.checked
                                opacity: enabled ? 1 : 0.45
                                ComboBox { id: targetStaffCombo; model: plugin.staffNames; Layout.fillWidth: true }
                                ComboBox { id: voiceCombo; model: plugin.voiceLabels; currentIndex: 1; Layout.preferredWidth: 100 }
                            }
                        }
                    }

                    GroupBox {
                        title: plugin.tr("group.variants")
                        Layout.fillWidth: true
                        GridLayout {
                            columns: 3; columnSpacing: 8; rowSpacing: 4
                            anchors.left: parent.left; anchors.right: parent.right
                            Label { text: plugin.tr("label.variety"); color: plugin.cText }
                            Slider {
                                id: varietySlider; from: 0; to: 10; stepSize: 1; value: 3; Layout.fillWidth: true
                                ToolTip.visible: hovered; ToolTip.delay: 600
                                ToolTip.text: plugin.tr("variety.tip")
                            }
                            Label { text: varietySlider.value.toFixed(0); color: plugin.cText; Layout.preferredWidth: 20 }

                            Label { text: plugin.tr("label.seed"); color: plugin.cText }
                            RowLayout {
                                Layout.columnSpan: 2
                                SpinBox { id: seedSpin; from: 1; to: 99999; value: 1; editable: true }
                                Button { text: plugin.tr("seed.new"); onClicked: seedSpin.value = Math.floor(Math.random() * 99999) + 1 }
                            }

                            Label { text: plugin.tr("label.count"); color: plugin.cText }
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
                                    ToolTip.text: plugin.tr("count.tip")
                                }
                                Label {
                                    text: variantsSpin.value > 1 ? plugin.tr("count.seeds", { a: seedSpin.value, b: plugin.seedFor(seedSpin.value, variantsSpin.value - 1) })
                                                                 : plugin.tr("count.one")
                                    color: plugin.cTextDim
                                }
                            }
                            CheckBox {
                                id: separateCheck
                                Layout.columnSpan: 3
                                text: plugin.tr("separate.label")
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
                        title: plugin.tr("group.style")
                        Layout.fillWidth: true
                        GridLayout {
                            columns: 2; columnSpacing: 8; rowSpacing: 6
                            anchors.left: parent.left; anchors.right: parent.right
                            Label { text: plugin.tr("label.species"); color: plugin.cText }
                            ComboBox { id: speciesCombo; model: plugin.speciesLabels; Layout.fillWidth: true }
                            Label { text: plugin.tr("label.position"); color: plugin.cText }
                            ComboBox { id: positionCombo; model: plugin.positionLabels; Layout.fillWidth: true }
                            Label { text: plugin.tr("label.register"); color: plugin.cText }
                            ComboBox { id: registerCombo; model: plugin.registerLabels; Layout.fillWidth: true }
                            Label { text: plugin.tr("label.rules"); color: plugin.cText }
                            ComboBox {
                                id: strictCombo; Layout.fillWidth: true
                                model: [plugin.tr("rules.strict"), plugin.tr("rules.free")]
                            }
                            Label { text: plugin.tr("label.mode"); color: plugin.cText }
                            ComboBox { id: modeCombo; model: [plugin.tr("mode.auto"), plugin.tr("mode.major"), plugin.tr("mode.minor")]; Layout.fillWidth: true }
                            Label { text: plugin.tr("label.meter"); color: plugin.cText }
                            ComboBox { id: meterCombo; model: [plugin.tr("meter.auto"), plugin.tr("meter.simple"), plugin.tr("meter.compound")]; Layout.fillWidth: true }
                            CheckBox { id: imitationCheck; Layout.columnSpan: 2; text: plugin.tr("imitation.label"); checked: true }
                            CheckBox {
                                id: entryCheck; Layout.columnSpan: 2
                                text: plugin.tr("entry.label")
                                enabled: speciesCombo.currentIndex === 0 || speciesCombo.currentIndex === 5
                                opacity: enabled ? 1 : 0.45
                                ToolTip.visible: hovered; ToolTip.delay: 600
                                ToolTip.text: plugin.tr("entry.tip")
                            }
                            CheckBox { id: tiesCheck; Layout.columnSpan: 2; text: plugin.tr("ties.label"); checked: true }
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
                            id: candItem
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
                                    text: plugin.candTitle(index); color: plugin.cText; font.bold: candItem.sel
                                }
                                Label {
                                    width: parent.width; elide: Text.ElideRight
                                    text: plugin.candStats(index); font.pixelSize: 11
                                    color: (modelData.res.report.parallels || modelData.res.report.errors) ? plugin.cError : plugin.cTextDim
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
                        text: plugin.candidates.length ? "" : plugin.tr("list.hint")
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
                            text: plugin.statusString()
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
                    text: plugin.tr("btn.analyze")
                    enabled: !plugin.busy
                    onClicked: analyzeVoice()
                    ToolTip.visible: hovered; ToolTip.delay: 600
                    ToolTip.text: plugin.tr("btn.analyzeTip")
                }
                Button {
                    text: plugin.tr("btn.regenerate")
                    enabled: !plugin.busy
                    onClicked: regenerateRest()
                    ToolTip.visible: hovered; ToolTip.delay: 600
                    ToolTip.text: plugin.tr("btn.regenerateTip")
                }
                Button {
                    text: variantsSpin.value > 1 ? plugin.tr("btn.generateN", { n: variantsSpin.value }) : plugin.tr("btn.generate")
                    highlighted: true; enabled: !plugin.busy
                    onClicked: generate()
                }
                Button { text: plugin.tr("btn.close"); enabled: !plugin.busy; onClicked: { saveSettings(); quit(); } }
            }
        }
    }
}
