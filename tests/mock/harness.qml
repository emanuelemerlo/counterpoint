import QtQuick 2.15
import "mockscore.js" as Mock
Item {
    id: h
    width: 860; height: 640
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
    // il rigo deve contenere esattamente le note della variante, senza resti di quelle precedenti
    function checkClean(items, what) {
        var t = score.tracks[2 * 4], notes = [], i;
        for (i = 0; i < t.length; i++) if (t[i].type === 93) notes.push(t[i].tick + ":" + t[i].notes[0].pitch);
        var want = items.filter(function (x) { return x.midi !== null; }).map(function (x) { return x.tick + ":" + x.midi; });
        if (notes.join(" ") !== want.join(" ")) fail(what + ": nel rigo " + notes.length + " note, attese " + want.length);
        var occ = 0;
        for (i = 0; i < t.length; i++) occ += t[i].dur;
        if (occ !== score.endTick) fail(what + ": elementi sovrapposti nel rigo (durata totale " + occ + ")");
        console.log(what + ": rigo pulito, " + notes.length + " note");
    }
    function fail(msg) { console.log("RESULT FAIL " + msg); Qt.exit(1); }
    function runTest() {
        var p = ld.item;
        score = Mock.makeScore({ num: 3, den: 4, measures: 8, sharps: 0, staves: [
            { name: "Pianoforte", voices: ["A4:q C5:q E5:q D5:h B4:q C5:q. B4:e A4:q G#4:h r:q A4:q B4:q C5:q D5:q. C5:e B4:q E5:q D5:q C5:q B4:q A4:q G#4:q A4:h."] },
            { name: "Basso", voices: ["A2:h. F2:h. E2:h. E2:h. A2:h. D3:h. E2:h. A2:h."] } ] });
        score.leakyOverwrite = true;      // riproduce la sovrascrittura imperfetta di MuseScore 4
        p.curScore = score;
        p.run();
        console.log("staffNames: " + JSON.stringify(p.staffNames) + "  range " + p.rangeStart + "-" + p.rangeEnd);
        if (p.setVariantCount(3) !== true) fail("con Quante > 1 la casella «una variante per rigo» deve attivarsi");
        p.setVariants(1, false);
        console.log("casella automatica: ok");
        phase = 1;
        p.generate();                       // 1) una variante in un nuovo rigo
    }
    property string first: ""
    function next() {
        var p = ld.item;
        if (phase === 1) {
            first = dump(2, 0);
            var vt = score.tracks[8];
            for (var q = 0; q < vt.length; q++)
                if (vt[q].type === 93 && (vt[q].notes[0].pitch < 55 || vt[q].notes[0].pitch > 88)) fail("nota fuori estensione del violino: " + vt[q].notes[0].pitch);
            console.log("estensione violino rispettata");
            console.log("log: " + score.log.join(", ") + "  cmd: " + p.cmdLog.join(","));
            console.log("nuovo rigo: " + first);
            phase = 2;
            p.generate();                   // 2) stesso seme sul rigo appena creato: deve dare lo stesso risultato
        } else if (phase === 2) {
            if (dump(2, 0) !== first) fail("rigenerazione con lo stesso seme diversa");
            console.log("deterministico: ok");
            p.findChild ? 0 : 0;
            phase = 3;
            p.setVariants(5, false);
            p.generate();                   // 3) cinque varianti, migliore nel rigo 3
        } else if (phase === 3) {
            console.log("varianti: " + p.candidates.length + "  " + p.candidates.map(function (c) { return c.seed + "=" + c.res.report.quality; }).join(" "));
            for (var i = 1; i < p.candidates.length; i++)
                if (p.candidates[i].res.report.quality > p.candidates[i - 1].res.report.quality && p.candidates[i].res.report.parallels === p.candidates[i - 1].res.report.parallels) fail("ordine");
            checkClean(p.candidates[0].res.items, "variante migliore");
            for (var k = p.candidates.length - 1; k >= 1; k--) {   // scelte ripetute, come un utente che le prova tutte
                p.chooseCandidate(k);
                checkClean(p.candidates[k].res.items, "variante " + (k + 1));
            }
            p.chooseCandidate(1);
            checkClean(p.candidates[1].res.items, "variante 2");
            console.log("scelta variante 2: ok, seme ora " + p.candidates[1].seed);
            var nst = score.nstaves;
            phase = 4;
            p.setVariants(3, true);
            p.generate();                   // 4) tre varianti in righi separati
            h.nst = nst;
        } else if (phase === 4) {
            console.log("righi: " + h.nst + " -> " + score.nstaves + "  log: " + score.log.slice(-6).join(", "));
            if (score.nstaves !== h.nst + p.candidates.length) fail("righi separati");
            console.log("RESULT OK");
            Qt.exit(0);
        }
    }
    property int nst: 0
}
