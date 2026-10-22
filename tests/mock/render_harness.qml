import QtQuick 2.15
import "mockscore.js" as Mock
// Screenshots of the dialog for the Wiki: python3 tests/mock/screenshot.py <lang> <scene> <out.png>
// scene "variants": five variants ranked; scene "analysis": analysis of a voice with mistakes.
Item {
    id: h
    width: 880; height: 690
    property string pluginUrl
    property string lang: "en"
    property string scene: "variants"
    property var score
    signal done()
    Loader { id: ld; anchors.fill: parent; source: h.pluginUrl; onLoaded: Qt.callLater(h.go) }
    Connections { target: ld.item; ignoreUnknownSignals: true; function onGenerationFinished() { Qt.callLater(h.after); } }
    function go() {
        var p = ld.item;
        score = Mock.makeScore({ num: 3, den: 4, measures: 8, sharps: 0, staves: [
            { name: h.lang === "it" ? "Pianoforte" : "Piano", voices: ["A4:q C5:q E5:q D5:h B4:q C5:q. B4:e A4:q G#4:h r:q A4:q B4:q C5:q D5:q. C5:e B4:q E5:q D5:q C5:q B4:q A4:q G#4:q A4:h."] },
            { name: h.lang === "it" ? "Basso" : "Bass", voices: ["A2:h. F2:h. E2:h. E2:h. A2:h. D3:h. E2:h. A2:h."] } ] });
        if (h.lang === "it") score.partNames = { violin: "Violino" };
        p.curScore = score;
        p.persistSettings = false;
        p.run();
        p.setLanguage(h.lang);
        if (h.scene === "analysis") {
            score.tracks[1] = Mock.parseLine("r:h. C4:h. B3:h. B3:h. E4:h. A3:h. B3:h. E4:h.");
            p.setDestination(0, 1);
            p.analyzeVoice();
            Qt.callLater(h.done);
        } else {
            p.setVariants(5, false);
            p.generate();
        }
    }
    function after() { ld.item.chooseCandidate(0); Qt.callLater(h.done); }
}
