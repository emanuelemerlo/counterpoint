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
    description: "Genera una contro-melodia in contrappunto (nota contro nota, 2:1, 4:1, ritardi, fiorito o libero) e la inserisce in un rigo esistente o in un nuovo rigo."
    version: "2.0.0"
    categoryCode: "composing-arranging-tools"
    pluginType: "dialog"
    requiresScore: true
    width: 500
    height: 720

    // ------------------------------------------------------------------ stato
    property var staffNames: []
    property int rangeStart: 0
    property int rangeEnd: 0
    property string rangeLabel: ""
    property var lastTarget: null      // { staff, voice } dell'ultimo risultato scritto in un nuovo rigo

    readonly property var speciesValues: ["free", "1:1", "2:1", "4:1", "sus", "florid"]
    readonly property var speciesLabels: ["Libero (ritmo complementare)", "1:1 – nota contro nota", "2:1 – due note contro una",
                                          "4:1 – quattro note contro una", "Ritardi (4ª specie)", "Fiorito (5ª specie)"]
    readonly property var positionValues: ["auto", "above", "middle", "below"]
    readonly property var positionLabels: ["Automatica", "Sopra la melodia (soprano/contralto)",
                                           "Sotto la melodia, sopra il basso (tenore)", "Sotto la melodia, come basso"]
    readonly property var registerValues: ["auto", "soprano", "alto", "tenor", "bass"]
    readonly property var registerLabels: ["Automatico", "Soprano (Do4–La5)", "Contralto (Fa3–Re5)", "Tenore (Do3–La4)", "Basso (Mi2–Re4)"]
    readonly property var instruments: [
        { label: "Violino", id: "violin" }, { label: "Flauto", id: "flute" }, { label: "Oboe", id: "oboe" },
        { label: "Viola", id: "viola" }, { label: "Violoncello", id: "violoncello" }, { label: "Fagotto", id: "bassoon" },
        { label: "Voce – Soprano", id: "soprano" }, { label: "Voce – Contralto", id: "alto" },
        { label: "Voce – Tenore", id: "tenor" }, { label: "Voce – Basso", id: "bass" },
        { label: "Pianoforte", id: "piano" }
    ]

    onRun: {
        if (!curScore) { quit(); return; }
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
        setStatus("Pronto. " + rangeLabel, false);
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

    // Scrive gli item in sequenza a partire da rangeStart; ritorna le note da legare
    function writeItems(items, staffIdx, voice) {
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

    function setStatus(msg, isError) {
        statusText.text = msg;
        statusText.color = isError ? "#b00020" : "#1b1b1b";
    }

    // ------------------------------------------------------------------ azione principale
    function generate() {
        var melStaff = melodyCombo.currentIndex;
        var bassStaff = bassCombo.currentIndex - 1;           // -1 = nessun basso
        var toNew = newStaffRadio.checked;
        var tStaff = targetStaffCombo.currentIndex;
        var tVoice = voiceCombo.currentIndex;

        if (!toNew && (tStaff === melStaff || tStaff === bassStaff) && tVoice === 0 && staffHasNotes(tStaff, 0)) {
            setStatus("La voce 1 del rigo scelto contiene la melodia o il basso: scegli la voce 2, 3 o 4, oppure un altro rigo.", true);
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

        var res;
        try {
            res = Engine.generate({
                melody: melody, bass: bass, measures: ms, keys: keys, start: rangeStart, end: rangeEnd,
                options: {
                    species: speciesValues[speciesCombo.currentIndex],
                    position: positionValues[positionCombo.currentIndex],
                    register: registerValues[registerCombo.currentIndex],
                    strictness: strictCombo.currentIndex === 0 ? "strict" : "free",
                    mode: ["auto", "major", "minor"][modeCombo.currentIndex],
                    meter: ["auto", "simple", "compound"][meterCombo.currentIndex],
                    imitation: imitationCheck.checked,
                    variety: varietySlider.value,
                    seed: seedSpin.value,
                    sameStaff: melStaff === bassStaff
                }
            });
        } catch (e) {
            setStatus("Errore nel calcolo: " + e, true);
            return;
        }

        curScore.startCmd();
        var ties = [];
        try {
            if (toNew) {
                var before = curScore.nstaves;
                var inst = instruments[instrumentCombo.currentIndex].id;
                curScore.appendPart(inst);
                if (curScore.nstaves === before) curScore.appendPart("piano");
                if (curScore.nstaves === before) throw "impossibile aggiungere un nuovo rigo";
                tStaff = before;
                tVoice = 0;
            }
            ties = writeItems(res.items, tStaff, tVoice);
            curScore.endCmd();
        } catch (e) {
            curScore.endCmd(true);
            setStatus("Errore durante la scrittura: " + e, true);
            return;
        }
        var nTies = addTies(ties);

        if (toNew) {
            var keepMel = melodyCombo.currentIndex, keepBass = bassCombo.currentIndex;
            refreshStaves();                       // il cambio di modello azzera le tendine: le ripristino
            melodyCombo.currentIndex = keepMel;
            bassCombo.currentIndex = keepBass;
            targetStaffCombo.currentIndex = tStaff;
            voiceCombo.currentIndex = 0;
            existingRadio.checked = true;
        }
        var r = res.report;
        var roleName = { above: "sopra la melodia", middle: "voce intermedia", below: "sotto la melodia (basso)" }[r.role];
        var msg = "Fatto: " + r.notes + " note nel rigo " + (tStaff + 1) + ", voce " + (tVoice + 1) + ".\n" +
                  "Tonalità " + r.key + ", " + roleName + ". Gradi congiunti " + r.steps + ", salti " + r.leaps +
                  ", moto contrario " + r.contrary + ", simile " + r.similar + ".\n" +
                  (r.parallels ? ("Attenzione: " + r.details.join("; ")) : "Nessuna quinta o ottava parallela.") +
                  (r.climaxCount === 1 ? " Un solo culmine." : "") +
                  (toNew ? "\nIl nuovo rigo è ora la destinazione: cambia il seme e premi di nuovo Genera per una variante." : "") +
                  ((ties.length && !nTies && tiesCheck.checked) ? "\nNon è stato possibile creare le legature di valore." : "");
        setStatus(msg, r.parallels > 0);
    }

    // ------------------------------------------------------------------ interfaccia
    Rectangle {
        anchors.fill: parent
        color: "#f3f3f3"

        ScrollView {
            id: scroll
            anchors.fill: parent
            anchors.margins: 12
            clip: true
            contentWidth: availableWidth

            ColumnLayout {
                width: scroll.availableWidth
                spacing: 8

                Label { text: "Contrappunto automatico"; font.bold: true; font.pixelSize: 17; color: "#1b1b1b" }
                Label { text: plugin.rangeLabel; color: "#444"; wrapMode: Text.WordWrap; Layout.fillWidth: true }
                Button {
                    text: "Usa la selezione corrente"
                    onClicked: { captureRange(); setStatus("Intervallo aggiornato. " + rangeLabel, false); }
                }

                GroupBox {
                    title: "Sorgenti"
                    Layout.fillWidth: true
                    GridLayout {
                        columns: 2; columnSpacing: 8; rowSpacing: 6
                        anchors.left: parent.left; anchors.right: parent.right
                        Label { text: "Melodia (canto dato):"; color: "#1b1b1b" }
                        ComboBox { id: melodyCombo; model: plugin.staffNames; Layout.fillWidth: true }
                        Label { text: "Basso:"; color: "#1b1b1b" }
                        ComboBox { id: bassCombo; model: ["— nessuno —"].concat(plugin.staffNames); Layout.fillWidth: true }
                    }
                }

                GroupBox {
                    title: "Destinazione"
                    Layout.fillWidth: true
                    ColumnLayout {
                        anchors.left: parent.left; anchors.right: parent.right
                        RadioButton { id: newStaffRadio; text: "Nuovo rigo (aggiunto in fondo alla partitura)"; checked: true }
                        RowLayout {
                            enabled: newStaffRadio.checked
                            Layout.leftMargin: 28
                            Label { text: "Strumento:"; color: "#1b1b1b" }
                            ComboBox {
                                id: instrumentCombo
                                Layout.fillWidth: true
                                model: plugin.instruments.map(function (x) { return x.label; })
                            }
                        }
                        RadioButton { id: existingRadio; text: "Rigo esistente" }
                        RowLayout {
                            enabled: existingRadio.checked
                            Layout.leftMargin: 28
                            ComboBox { id: targetStaffCombo; model: plugin.staffNames; Layout.fillWidth: true }
                            ComboBox { id: voiceCombo; model: ["Voce 1", "Voce 2", "Voce 3", "Voce 4"]; currentIndex: 1 }
                        }
                    }
                }

                GroupBox {
                    title: "Stile"
                    Layout.fillWidth: true
                    GridLayout {
                        columns: 2; columnSpacing: 8; rowSpacing: 6
                        anchors.left: parent.left; anchors.right: parent.right
                        Label { text: "Specie / ritmo:"; color: "#1b1b1b" }
                        ComboBox { id: speciesCombo; model: plugin.speciesLabels; Layout.fillWidth: true }
                        Label { text: "Posizione:"; color: "#1b1b1b" }
                        ComboBox { id: positionCombo; model: plugin.positionLabels; Layout.fillWidth: true }
                        Label { text: "Registro:"; color: "#1b1b1b" }
                        ComboBox { id: registerCombo; model: plugin.registerLabels; Layout.fillWidth: true }
                        Label { text: "Regole:"; color: "#1b1b1b" }
                        ComboBox {
                            id: strictCombo; Layout.fillWidth: true
                            model: ["Rigorose (accademiche)", "Libere (appoggiature, settime, dirette tollerate)"]
                        }
                        Label { text: "Modo:"; color: "#1b1b1b" }
                        ComboBox { id: modeCombo; model: ["Automatico", "Maggiore", "Minore"]; Layout.fillWidth: true }
                        Label { text: "Metro:"; color: "#1b1b1b" }
                        ComboBox { id: meterCombo; model: ["Automatico", "Semplice (2/4, 3/4, 4/4…)", "Composto (6/8, 9/8, 12/8…)"]; Layout.fillWidth: true }
                    }
                }

                CheckBox { id: imitationCheck; text: "Imita il motivo della melodia nelle sue pause"; checked: true }
                CheckBox { id: tiesCheck; text: "Lega le note tenute (legature di valore)"; checked: true }

                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Varietà:"; color: "#1b1b1b" }
                    Slider { id: varietySlider; from: 0; to: 10; stepSize: 1; value: 3; Layout.fillWidth: true }
                    Label { text: varietySlider.value.toFixed(0); color: "#1b1b1b"; Layout.preferredWidth: 20 }
                }
                RowLayout {
                    Label { text: "Seme:"; color: "#1b1b1b" }
                    SpinBox { id: seedSpin; from: 1; to: 99999; value: 1; editable: true }
                    Button { text: "Nuovo seme"; onClicked: seedSpin.value = Math.floor(Math.random() * 99999) + 1 }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: statusText.implicitHeight + 16
                    color: "#ffffff"; border.color: "#cccccc"; radius: 4
                    Text {
                        id: statusText
                        anchors.fill: parent; anchors.margins: 8
                        wrapMode: Text.WordWrap
                        color: "#1b1b1b"
                    }
                }

                RowLayout {
                    Layout.alignment: Qt.AlignRight
                    Button { text: "Genera"; highlighted: true; onClicked: generate() }
                    Button { text: "Chiudi"; onClicked: quit() }
                }
            }
        }
    }
}
