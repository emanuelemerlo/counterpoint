# Screenshot of the plugin's window with the fake MuseScore, for the Wiki:
#   python3 tests/mock/screenshot.py <lang> <variants|analysis> <out.png>
# e.g. python3 tests/mock/screenshot.py it variants docs/wiki/images/dialog-it.png  (needs PySide6)
import sys, os
from PySide6.QtCore import QUrl, QTimer
from PySide6.QtGui import QGuiApplication
from PySide6.QtQuick import QQuickView

here = os.path.dirname(os.path.abspath(__file__))
plugin = os.path.join(here, "..", "..", "plugin", "Contrappunto", "contrappunto.qml")
lang, scene, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
app = QGuiApplication(sys.argv)
view = QQuickView()
view.engine().addImportPath(here)
view.setInitialProperties({"pluginUrl": QUrl.fromLocalFile(os.path.abspath(plugin)).toString(), "lang": lang, "scene": scene})
view.setSource(QUrl.fromLocalFile(os.path.join(here, "render_harness.qml")))
for e in view.errors(): print("QML ERROR:", e.toString())
view.show()


def shoot():
    # a short wait so that the last layout pass is painted
    QTimer.singleShot(300, lambda: (view.grabWindow().save(out), print("written", out), app.quit()))


view.rootObject().done.connect(shoot)
QTimer.singleShot(20000, lambda: app.exit(3))
sys.exit(app.exec())
