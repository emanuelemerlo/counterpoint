import QtQuick 2.15
import "mockscore.js" as Mock
// Runs contrappunto.qml against a fake MuseScore score: python3 tests/mock/run_mock.py
Item {
    id: h
    width: 880; height: 690
    property string pluginUrl
    property var score
    property int phase: 0
    Loader {
        id: ld
        anchors.fill: parent
        source: h.pluginUrl
        onStatusChanged: if (status === Loader.Error) { console.log("RESULT LOAD_ERROR"); Qt.exit(2); }
        onLoaded: Qt.callLater(h.runTest)
    }
    Connections {
        target: ld.item
        ignoreUnknownSignals: true
        function onGenerationFinished() { Qt.callLater(h.next); }
    }
    function dump(staff, voice) {
        var t = score.tracks[staff * 4 + voice], out = [];
        for (var i = 0; i < t.length; i++) out.push(t[i].type === 93 ? (t[i].notes[0].pitch + "/" + t[i].notes[0].tpc1 + "@" + t[i].tick + "+" + t[i].dur + (t[i].notes[0]._tied ? "~" : "")) : ("r@" + t[i].tick + "+" + t[i].dur));
        return out.join(" ");
    }
    // the staff must contain exactly the notes of the variant, with nothing left over from earlier ones
    function checkClean(items, what) {
        var t = score.tracks[2 * 4], notes = [], i;
        for (i = 0; i < t.length; i++) if (t[i].type === 93) notes.push(t[i].tick + ":" + t[i].notes[0].pitch);
        var want = items.filter(function (x) { return x.midi !== null; }).map(function (x) { return x.tick + ":" + x.midi; });
        if (notes.join(" ") !== want.join(" ")) fail(what + ": " + notes.length + " notes on the staff, expected " + want.length);
        var occ = 0;
        for (i = 0; i < t.length; i++) occ += t[i].dur;
        if (occ !== score.endTick) fail(what + ": overlapping elements on the staff (total duration " + occ + ")");
        console.log(what + ": clean staff, " + notes.length + " notes");
    }
    property bool failed: false
    function fail(msg) { console.log("RESULT FAIL " + msg); failed = true; Qt.exit(1); }

    // every visible text of the dialog, plus the status and the variant list
    function texts(item, out) {
        if (!item) return out;
        try { if (typeof item.text === "string" && item.text.length) out.push(item.text); } catch (e) {}
        try { if (typeof item.title === "string" && item.title.length) out.push(item.title); } catch (e) {}
        try { if (item.displayText && typeof item.displayText === "string") out.push(item.displayText); } catch (e) {}
        var ch = item.children || [];
        for (var i = 0; i < ch.length; i++) texts(ch[i], out);
        return out;
    }
    function checkTexts(lang, mustContain) {
        var p = ld.item, all = texts(p, []);
        all.push(p.statusString());
        for (var i = 0; i < p.candidates.length; i++) { all.push(p.candTitle(i)); all.push(p.candStats(i)); }
        var missing = all.filter(function (t) { return t.indexOf("⟦") >= 0; });
        if (missing.length) fail(lang + ": missing translations: " + missing.join(" | "));
        var joined = all.join("\n");
        mustContain.forEach(function (w) { if (joined.indexOf(w) < 0) fail(lang + ": expected text not found: " + w); });
        console.log(lang + ": " + all.length + " texts, no missing key");
    }

    function runTest() {
        var p = ld.item;
        score = Mock.makeScore({ num: 3, den: 4, measures: 8, sharps: 0, staves: [
            { name: "Pianoforte", voices: ["A4:q C5:q E5:q D5:h B4:q C5:q. B4:e A4:q G#4:h r:q A4:q B4:q C5:q D5:q. C5:e B4:q E5:q D5:q C5:q B4:q A4:q G#4:q A4:h."] },
            { name: "Basso", voices: ["A2:h. F2:h. E2:h. E2:h. A2:h. D3:h. E2:h. A2:h."] } ] });
        score.leakyOverwrite = true;      // reproduces MuseScore 4's imperfect overwrite
        p.curScore = score;
        p.persistSettings = false;        // the test neither reads nor writes the user's settings
        p.run();
        if (p.title !== "Contrappunto") fail("plugin title: " + p.title);
        // saved settings: round trip in a test category
        p.persistSettings = true;
        p.settingsCategory = "ContrappuntoCollaudo";
        p.setSpecies(2);
        if (p.saveSettings()) {
            p.setSpecies(0);
            p.loadSettings();
            if (p.currentSettings().species !== 2) fail("settings not restored");
            console.log("settings saved and restored: ok");
        } else console.log("settings: Settings module not available, test skipped");
        p.setSpecies(0);
        p.persistSettings = false;
        console.log("staffNames: " + JSON.stringify(p.staffNames) + "  range " + p.rangeStart + "-" + p.rangeEnd);
        if (p.setVariantCount(3) !== true) fail("with «How many» > 1 the «one variant per staff» box must switch on");
        p.setVariants(1, false);
        console.log("automatic check box: ok");
        p.setLanguage("en");
        checkTexts("en", ["Writes, compares and checks counterpoint", "Melody (cantus firmus):", "Generate"]);
        phase = 1;
        p.generate();                       // 1) one variant on a new staff
    }
    property string first: ""
    function next() {
        var p = ld.item;
        if (phase === 1) {
            first = dump(2, 0);
            var vt = score.tracks[8];
            for (var q = 0; q < vt.length; q++)
                if (vt[q].type === 93 && (vt[q].notes[0].pitch < 55 || vt[q].notes[0].pitch > 88)) fail("note outside the violin's range: " + vt[q].notes[0].pitch);
            console.log("violin range respected");
            console.log("log: " + score.log.join(", ") + "  cmd: " + p.cmdLog.join(","));
            console.log("new staff: " + first);
            phase = 2;
            p.generate();                   // 2) same seed on the staff just created: same result
        } else if (phase === 2) {
            if (dump(2, 0) !== first) fail("regenerating with the same seed gave a different result");
            console.log("deterministic: ok");
            phase = 3;
            p.setVariants(5, false);
            p.generate();                   // 3) five variants, the best on staff 3
        } else if (phase === 3) {
            console.log("variants: " + p.candidates.length + "  " + p.candidates.map(function (c) { return c.seed + "=" + c.res.report.quality; }).join(" "));
            for (var i = 1; i < p.candidates.length; i++) {
                var ra = p.candidates[i - 1].res.report, rb = p.candidates[i].res.report;
                if (rb.parallels === ra.parallels && rb.errors === ra.errors && rb.quality > ra.quality) fail("order");
            }
            checkClean(p.candidates[0].res.items, "best variant");
            for (var k = p.candidates.length - 1; k >= 1; k--) {   // repeated choices, like a user trying them all
                p.chooseCandidate(k);
                checkClean(p.candidates[k].res.items, "variant " + (k + 1));
            }
            p.chooseCandidate(1);
            checkClean(p.candidates[1].res.items, "variant 2");
            console.log("choosing variant 2: ok, seed now " + p.candidates[1].seed);

            // 3a) switching language keeps every choice and translates everything, the status too
            var before = JSON.stringify(p.currentSettings()), st0 = p.statusString();
            p.setLanguage("it");
            if (p.statusString() === st0) fail("status not translated when switching language");
            var afterIt = p.currentSettings(); afterIt.lang = JSON.parse(before).lang;
            if (JSON.stringify(afterIt) !== before) fail("settings changed when switching language: " + before + " -> " + JSON.stringify(afterIt));
            if (p.lang !== "it") fail("language not switched");
            p.chooseCandidate(2);           // a new status message, now in Italian
            checkTexts("it", ["Scrive, confronta e corregge il contrappunto", "Melodia (canto dato):", "Tonalità La minore", "Seme "]);
            var stIt = p.statusString();
            p.setLanguage("en");
            p.chooseCandidate(1);
            checkTexts("en", ["Key A minor", "Seed "]);
            if (p.statusString() === stIt) fail("status not translated back to English");
            console.log("language switch: ok");

            // 3b) the user edits one note of the variant by hand, then «Regenerate the rest»
            var tr = score.tracks[8], ed = null;
            for (var e = 0; e < tr.length && !ed; e++) if (tr[e].type === 93 && tr[e].tick >= 1440) ed = tr[e];
            ed.notes[0].pitch += 2; ed.notes[0].tpc1 += 2; ed.notes[0].tpc2 += 2; ed.notes[0].tpc += 2;
            h.edited = { tick: ed.tick, pitch: ed.notes[0].pitch, dur: ed.dur };
            console.log("note edited by hand: " + JSON.stringify(h.edited));
            p.setVariants(1, false);
            phase = 35;
            p.regenerateRest();
        } else if (phase === 35) {
            var kept = score.tracks[8].filter(function (x) { return x.type === 93 && x.tick === h.edited.tick; })[0];
            if (!kept || kept.notes[0].pitch !== h.edited.pitch || kept.dur !== h.edited.dur) fail("the note edited by hand was not kept");
            if (p.candidates[0].res.report.locked !== 1) fail("kept notes: expected 1, report " + p.candidates[0].res.report.locked);
            checkClean(p.candidates[0].res.items, "partial regeneration");
            console.log("regenerate the rest: note kept, " + p.candidates[0].res.report.notes + " notes");
            var nst = score.nstaves;
            phase = 4;
            p.setVariants(3, true);
            p.generate();                   // 4) three variants on separate staves
            h.nst = nst;
        } else if (phase === 4) {
            console.log("staves: " + h.nst + " -> " + score.nstaves + "  log: " + score.log.slice(-6).join(", "));
            if (score.nstaves !== h.nst + p.candidates.length) fail("separate staves");
            // 5) analysis of a hand-written voice with parallel fifths (staff 3, voice 2), in both languages
            score.tracks[2 * 4 + 1] = Mock.parseLine("D4:q F4:q A4:q G4:h E4:q");
            p.setDestination(2, 1);
            p.analyzeVoice();
            var an = p.lastAnalysis;
            if (!an) fail("analysis not run");
            var par = an.findings.filter(function (f) { return f.rule === "parallel5"; }).length;
            var red = score.tracks[9].filter(function (x) { return x.type === 93 && String(x.notes[0].color) === "#d00000"; }).length;
            console.log("analysis: " + an.findings.length + " findings, parallel fifths " + par + ", red notes " + red);
            if (par < 4 || red < 4) fail("the analysis must find and colour the parallel fifths");
            checkTexts("en", ["parallel fifths with the melody", "bar 2"]);
            p.setLanguage("it");
            checkTexts("it", ["quinte parallele con la melodia", "batt. 2"]);
            p.setLanguage("en");
            p.analyzeVoice();               // a second analysis does not pile up colours
            if (score.tracks[9].filter(function (x) { return x.type === 93 && String(x.notes[0].color) === "#d00000"; }).length !== red) fail("colours repeated");
            if (!failed) console.log("RESULT OK");
            Qt.exit(failed ? 1 : 0);
        }
    }
    property int nst: 0
    property var edited: null
}
