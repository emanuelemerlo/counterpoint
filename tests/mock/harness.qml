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
    function fail(msg) { console.log("RESULT FAIL " + msg); Qt.exit(1); }
    function runTest() {
        var p = ld.item;
        score = Mock.makeScore({ num: 3, den: 4, measures: 8, sharps: 0, staves: [
            { name: "Pianoforte", voices: ["A4:q C5:q E5:q D5:h B4:q C5:q. B4:e A4:q G#4:h r:q A4:q B4:q C5:q D5:q. C5:e B4:q E5:q D5:q C5:q B4:q A4:q G#4:q A4:h."] },
            { name: "Basso", voices: ["A2:h. F2:h. E2:h. E2:h. A2:h. D3:h. E2:h. A2:h."] } ] });
        p.curScore = score;
        p.run();
        console.log("staffNames: " + JSON.stringify(p.staffNames) + "  range " + p.rangeStart + "-" + p.rangeEnd);
        phase = 1;
        p.generate();                       // 1) una variante in un nuovo rigo
    }
    property string first: ""
    function next() {
        var p = ld.item;
        if (phase === 1) {
            first = dump(2, 0);
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
            var best = dump(2, 0);
            p.chooseCandidate(1);
            if (dump(2, 0) === best && p.candidates.length > 1) fail("la scelta della variante 2 non ha riscritto il rigo");
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
