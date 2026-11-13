# PyInstaller build recipe: bundles serve.py plus the app's files into a
# single BitcoinWallpaper executable, so people can run it without
# installing Python.
#
# You normally never run this yourself -- GitHub builds the Windows .exe
# automatically (see .github/workflows/release.yml). To build by hand:
#
#     pip install pyinstaller
#     pyinstaller --noconfirm BitcoinWallpaper.spec
#
# The result lands in dist/.
#
# Only the files listed here go into the bundle. config.local.js is
# deliberately NOT listed: the download must never contain anyone's
# node address. Users set theirs in the app's settings panel instead.

app_files = [
    "index.html",
    "style.css",
    "app.js",
    "cells.js",
    "config.js",
    "data.js",
    "grid-layout.js",
    "renderer.js",
    "ui.js",
    "LICENSE",
]

a = Analysis(
    ["serve.py"],
    datas=[(f, ".") for f in app_files] + [("fonts", "fonts")],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    name="BitcoinWallpaper",
    console=True,   # the window is how the user sees it's running / stops it
    upx=False,      # UPX compression makes antivirus false alarms more likely
)
