import QtQuick 2.15
// Finto tipo MuseScore per il collaudo fuori dall'applicazione
Item {
    property string title
    property string description
    property string version
    property string categoryCode
    property string pluginType
    property bool requiresScore
    property string menuPath
    property var curScore: null
    property var cmdLog: []
    signal run()
    function quit() { console.log("[mock] quit()"); }
    function cmd(name) { cmdLog.push(name); if (curScore && curScore._cmd) curScore._cmd(name); }
}
