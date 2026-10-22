import QtQuick 2.15
// Fake MuseScore type, to test the plugin outside the application
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
    function newElement(t) { return { type: t, text: "" }; }
    function removeElement(e) { if (curScore && curScore._remove) curScore._remove(e); }
    function cmd(name) { cmdLog.push(name); if (curScore && curScore._cmd) curScore._cmd(name); }
}
