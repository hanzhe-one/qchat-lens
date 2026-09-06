"""QChat Lens 桌面壳：pywebview + 内嵌 uvicorn。

双击 exe 即起本地 HTTP 服务并在原生窗口打开；若 pywebview 初始化失败
则自动回退到系统默认浏览器。日志写到 exe 旁的 qchat-lens.log。
"""
import os
import socket
import sys
import threading
import time
import traceback

if getattr(sys, "frozen", False):
    BASE = os.path.dirname(sys.executable)
else:
    BASE = os.path.dirname(os.path.abspath(__file__))

LOG_PATH = os.path.join(BASE, "qchat-lens.log")


def _log(msg):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _serve_forever(port):
    """在主线程跑 uvicorn（阻塞），指向本包内的 app。"""
    os.environ["QCHAT_LENS_PORT"] = str(port)
    sys.path.insert(0, BASE)
    from app.main import app
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


def _wait_ready(port, timeout=20):
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1)
            return True
        except Exception:
            time.sleep(0.15)
    return False


def _open_native_or_browser(url):
    """优先 pywebview 原生窗口；异常则退回系统浏览器。"""
    try:
        import webview
        win = webview.create_window(
            "QChat Lens · 会话洞察", url,
            width=1240, height=800, min_size=(980, 640),
            background_color="#0a0d14",
        )
        webview.start()
        _log("pywebview window closed")
        return True
    except Exception as e:
        _log("pywebview failed: %r" % (e,))
        _log(traceback.format_exc())
    try:
        import webbrowser
        webbrowser.open(url)
        _log("fell back to system browser")
    except Exception as e:
        _log("browser fallback failed: %r" % (e,))
    return False


def main():
    _log("QChat Lens starting")
    port = _free_port()
    _log(f"server port {port}")
    threading.Thread(target=_serve_forever, args=(port,), daemon=True).start()
    if not _wait_ready(port):
        _log("server failed to become ready")
        return
    _log("server ready")
    url = f"http://127.0.0.1:{port}/"
    _open_native_or_browser(url)


if __name__ == "__main__":
    main()
