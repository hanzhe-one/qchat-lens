"""QChat Lens 桌面壳：pywebview + 内嵌 uvicorn。

双击 exe 即起一个本地 HTTP 服务并在原生窗口打开，无需安装任何环境。
"""
import multiprocessing
import os
import socket
import sys
import threading
import time

# PyInstaller 解包路径处理
if getattr(sys, "frozen", False):
    BASE = os.path.dirname(sys.executable)
else:
    BASE = os.path.dirname(os.path.abspath(__file__))


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _run_server(port):
    """在子进程跑 uvicorn，指向打包内的 backend。"""
    os.environ["QCHAT_LENS_PORT"] = str(port)
    sys.path.insert(0, BASE)
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="warning")


def main():
    port = _free_port()
    # 后台线程起服务（避免打包后 multiprocessing spawn 问题）
    t = threading.Thread(target=_run_server, args=(port,), daemon=True)
    t.start()

    # 等服务就绪
    import urllib.request
    for _ in range(100):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1)
            break
        except Exception:
            time.sleep(0.15)

    import webview
    url = f"http://127.0.0.1:{port}/"
    webview.create_window(
        "QChat Lens · 会话洞察",
        url,
        width=1240, height=800,
        min_size=(980, 640),
        background_color="#0a0d13",
    )
    webview.start()


if __name__ == "__main__":
    main()
