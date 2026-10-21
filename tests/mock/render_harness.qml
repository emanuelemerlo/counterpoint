import QtQuick 2.15
import "mockscore.js" as Mock
Item {
    id: h
    width: 860; height: 640
    property string pluginUrl
    Loader { id: ld; anchors.fill: parent; source: h.pluginUrl; onLoaded: Qt.callLater(h.go) }
    Connections { target: ld.item; ignoreUnknownSignals: true; function onGenerationFinished() { Qt.quit(); } }
    function go() {
        var p = ld.item;
        p.curScore = Mock.makeScore({ num: 3, den: 4, measures: 8, sharps: 0, staves: [
            { name: "Pianoforte", voices: ["A4:q C5:q E5:q D5:h B4:q C5:q. B4:e A4:q G#4:h r:q A4:q B4:q C5:q D5:q. C5:e B4:q E5:q D5:q C5:q B4:q A4:q G#4:q A4:h."] },
            { name: "Basso", voices: ["A2:h. F2:h. E2:h. E2:h. A2:h. D3:h. E2:h. A2:h."] } ] });
        p.run(); p.setVariants(5, false); p.generate();
    }
}
