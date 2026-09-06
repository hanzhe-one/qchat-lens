# -*- mode: python ; coding: utf-8 -*-
# QChat Lens 打包配置（onedir，双击 QChatLens.exe）
# desktop.py 静态 import app.main，PyInstaller 才能把 app 包收集进去。

import sys
from pathlib import Path

ROOT = Path(SPECPATH).resolve().parent   # qchat-lens/
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend" / "dist"

datas = [
    (str(FRONTEND), "frontend_dist"),
]

# 让 PyInstaller 静态发现 app 包（collect submodules 递归）
import PyInstaller.utils.hooks as hooks
app_pkgs = []
for pkg in hooks.collect_submodules("app"):
    pass  # collect_submodules 只返回名字；改用 collect_all
collect_all_app = hooks.collect_all("app")
binaries = collect_all_app[1]
datas += collect_all_app[2]
hiddenimports = collect_all_app[0]

hiddenimports += [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "websocket",
    "webview",
    "clr_loader",
    "pythonnet",
]

# pythonnet 原生 dll（打包 webview EdgeChromium 后端必需）
try:
    clr_bins = hooks.collect_dynamic_libs("pythonnet")
    binaries += clr_bins
except Exception:
    pass

a = Analysis(
    [str(BACKEND / "desktop.py")],
    pathex=[str(BACKEND)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="QChatLens",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="QChatLens",
)
