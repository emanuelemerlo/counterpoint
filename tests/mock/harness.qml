import QtQuick 2.15
import "mockscore.js" as Mock
Item {
    id: h
    width: 500; height: 720
    property string pluginUrl
    property var score
    Loader {
        id: ld
        anchors.fill: parent
        source: h.pluginUrl
        onStatusChanged: if (status === Loader.Error) { console.log("RESULT LOAD_ERROR"); Qt.exit(2); }
        onLoaded: Qt.callLater(h.runTest)
    }
    function dump(staff, voice) {
        var t = score.tracks[staff * 4 + voice], out = [];
        for (var i = 0; i < t.length; i++) out.push(t[i].type === 93 ? (t[i].notes[0].pitch + "/" + t[i].notes[0].tpc1 + "@" + t[i].tick + "+" + t[i].dur + (t[i].notes[0]._tied ? "~" : "")) : ("r@" + t[i].tick + "+" + t[i].dur));
        return out.join(" ");
    }
    function runTest() {
        var p = ld.item;
        score = Mock.makeScore({ num: 3, den: 4, measures: 8, sharps: 0, staves: [
            { name: "Pianoforte", voices: ["A4:q C5:q E5:q D5:h B4:q C5:q. B4:e A4:q G#4:h r:q A4:q B4:q C5:q D5:q. C5:e B4:q E5:q D5:q C5:q B4:q A4:q G#4:q A4:h."] },
            { name: "Basso", voices: ["A2:h. F2:h. E2:h. E2:h. A2:h. D3:h. E2:h. A2:h."] } ] });
        p.curScore = score;
        p.run();
        console.log("staffNames: " + JSON.stringify(p.staffNames) + "  range " + p.rangeStart + "-" + p.rangeEnd);
        p.generate();
        console.log("log: " + score.log.join(", ") + "  cmd: " + p.cmdLog.join(","));
        console.log("nuovo rigo: " + dump(2, 0));
        // seconda generazione sul rigo appena creato
        p.generate();
        console.log("rigenerato: " + dump(2, 0));
        console.log("staves: " + score.nstaves);
        console.log("RESULT OK");
        Qt.exit(0);
    }
}
