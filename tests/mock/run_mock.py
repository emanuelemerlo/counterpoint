# Runs contrappunto.qml inside a fake MuseScore environment: python3 tests/mock/run_mock.py
import sys, os
from PySide6.QtCore import QUrl, QTimer
from PySide6.QtGui import QGuiApplication
from PySide6.QtQuick import QQuickView
here = os.path.dirname(os.path.abspath(__file__))
plugin = os.path.join(here, "..", "..", "plugin", "Contrappunto", "contrappunto.qml")
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
app = QGuiApplication(sys.argv)
view = QQuickView()
view.engine().addImportPath(here)
view.engine().quit.connect(app.quit)
view.engine().exit.connect(lambda code: app.exit(code))
view.setInitialProperties({"pluginUrl": QUrl.fromLocalFile(os.path.abspath(plugin)).toString()})
view.setSource(QUrl.fromLocalFile(os.path.join(here, "harness.qml")))
for e in view.errors(): print("QML ERROR:", e.toString())
QTimer.singleShot(20000, lambda: app.exit(3))
sys.exit(app.exec())
